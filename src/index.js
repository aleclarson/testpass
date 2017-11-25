
const path = require('path')

const {runTests} = require('./runner')
const utils = require('./utils')
const fs = require('./fs')

// The default test filter.
const matchAll = /.*/

// The top-level group.
let top = createContext('', null)
top.files = Object.create(null)

// Parents of the current context.
const stack = []

// The group being mutated.
let context = null

// The current test runner.
let runner = null

// Functions executed before the next run.
const nextRun = []

// Command-line flags
process.flags = {
  watch: process.argv.indexOf('-w') >= 0,
  serial: process.argv.indexOf('-c') < 0,
}

// Start the tests on the next tick.
setImmediate(async function() {
  runner = runTests(top)

  // Enable watch mode.
  if (process.flags.watch) {
    let rerunId = null
    fs.watch((event, file) => {
      // TODO: Handle deleted files.
      if (event == 'change' && onFileChange(file)) {
        clearTimeout(rerunId)
        rerunId = setTimeout(runAgain, 1000)
      }
    })
  }

  await runner.promise
  runner = null
})

//
// Exports
//

function beforeAll(fn) {
  const group = getContext()
  if (group.beforeAll) {
    group.beforeAll.push(fn)
  } else {
    group.beforeAll = [fn]
  }
}

function beforeEach(fn) {
  const group = getContext()
  if (group.beforeEach) {
    group.beforeEach.push(fn)
  } else {
    group.beforeEach = [fn]
  }
}

function afterEach(fn) {
  const group = getContext()
  if (group.afterEach) {
    group.afterEach.push(fn)
  } else {
    group.afterEach = [fn]
  }
}

function afterAll(fn) {
  const group = getContext()
  if (group.afterAll) {
    group.afterAll.push(fn)
  } else {
    group.afterAll = [fn]
  }
}

function filter(regex) {
  const context = getContext()
  if (context.filter != matchAll) {
    throw Error('Cannot call `filter` more than once per group')
  }
  if (typeof regex == 'string') {
    context.filter = new RegExp('.*' + regex + '.*')
  } else if (regex instanceof RegExp) {
    if (regex.global) {
      throw Error('Cannot use global RegExp')
    } else {
      context.filter = regex
    }
  } else {
    throw TypeError('Must provide string or RegExp')
  }
}

function group(id, fn) {
  if (typeof id == 'function') {
    fn = id; id = ''
  } else if (typeof fn != 'function') {
    throw TypeError('Must provide a function')
  }

  // Create the group context.
  const group = createContext(id, getContext())

  // Collect tests from the `fn` function.
  stack.push(context)
  context = group
  fn()
  context = stack.pop()

  // Add self to parent context.
  group.parent.tests.push(group)
}

// TODO: Implement `fgroup`
function fgroup() {
  throw Error('Unimplemented')
}

function xgroup() {
  // Do nothing.
}

function test(id, fn) {
  if (typeof id == 'function') {
    fn = id; id = ''
  } else if (typeof fn != 'function') {
    throw TypeError('Must provide a function')
  }
  const test = new Test(id, fn)
  getContext().tests.push(test)
  return test
}

// TODO: Implement `ftest`
function ftest() {
  throw Error('Unimplemented')
}

function xtest() {
  return new Test()
}

function watchDir(dir) {
  if (!path.isAbsolute(dir)) {
    dir = path.resolve(dir)
  }
  fs.watched.add(dir)
}

function findTests(dir, pattern) {
  fs.crawl(dir, pattern || '.js', []).forEach(require)
}

function reloadTests(path) {
  if (!top) return false

  const file = top.files[path]
  if (!file) return false

  const {group} = file
  if (group) {
    file.group = null

    nextRun.push(() => {
      file.group = createContext('', top, file)

      // Reload the file.
      delete require.cache[path]
      require(path)

      // Replace the old test group.
      top.tests.splice(top.tests.indexOf(group), 1, file.group)
    })
  }
  return true
}

function reloadAllTests() {
  if (top) {
    const {files} = top
    top = null
    nextRun.push(() => {
      top = createContext('', null)
      top.files = files
      Object.keys(files).forEach(reloadTests)
    })
  }
}

// TODO: Implement removing a file.
function removeTests(file) {
  throw Error('Unimplemented')
}

function runAgain() {
  if (runner) {
    runner.stop()
  }

  if (nextRun.length) {
    nextRun.forEach(fn => fn())
    nextRun.length = 0
  }

  // Clear the screen.
  process.stdout.write('\033[2J')

  // Move cursor to top of screen.
  process.stdout.write('\033[0f')

  // Run the tests!
  runner = runTests(top)
  runner.promise.then(() => {
    runner = null
  })
  return runner
}

module.exports = {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  filter,
  group,
  fgroup,
  xgroup,
  test,
  ftest,
  xtest,
  watchDir,
  findTests,
  reloadTests,
  reloadAllTests,
  removeTests,
  runAgain,
}

//
// Internal
//

function Test(id, fn) {
  this.id = id
  this.fn = fn
}

Test.prototype = {
  constructor: Test,
  catch(value) {
    if (value) {
      this.catch = matchError(value)
    } else {
      throw Error('Must provide an argument')
    }
  }
}

// Create a file if no context exists.
function getContext() {
  if (context) {
    return context
  } else {
    const path = utils.getCallsite(2).getFileName()
    const file = top.files[path] || (top.files[path] = new File(path))
    return file.group
  }
}

function getFile(group) {
  while (group) {
    if (group.file) return group.file
    group = group.parent
  }
}

function File(path) {
  this.path = path
  this.group = createContext('', top, this)
  top.tests.push(this.group)
}

function createContext(id, parent, file) {
  return {
    id,
    file: file || (parent ? getFile(parent) : null),
    parent,
    filter: matchAll,
    tests: [],
  }
}

function matchError(value) {
  if (typeof value == 'function') {
    return value
  }
  if (typeof value == 'string') {
    return (error) => error.message.startsWith(value)
  }
  if (value instanceof RegExp) {
    return (error) => value.test(error.message)
  }
  if (value instanceof Error) {
    return (error) => error.name == value.name && error.message == value.message
  }
  if (typeof value == 'object') {
    return (error) => {
      if (typeof value.name == 'string') {
        if (error.name != value.name) return false
      }
      if (typeof value.message == 'string') {
        if (error.message != value.message) return false
      }
      else if (value.message instanceof RegExp) {
        if (!value.message.test(error.message)) return false
      }
      if (typeof value.code == 'number') {
        if (error.code != value.code) return false
      }
      return true
    }
  }
  throw TypeError('Invalid argument type: ' + typeof error)
}

function onFileChange(file) {
  // Reload a specific test file.
  if (reloadTests(file)) {
    return true
  }
  // Reload all tests when a source file changes.
  if (require.cache[file]) {
    delete require.cache[file]
    reloadAllTests()
    return true
  }
  return false
}
