
const path = require('path')

const {formatError, getCallsite, toggleCallsites} = require('./utils')
const Runner = require('./runner')
const fs = require('./fs')

// The default test filter.
const matchAll = /.*/

// The top-level group.
let top = new Group('', null)

// The map of test files.
const files = Object.create(null)

// Parents of the current context.
const stack = []

// The group being mutated.
let context = null

// The current test runner.
let runner = null

// Functions executed before the next run.
const nextRun = []

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
  const group = getContext()
  if (group.filter != matchAll) {
    throw Error('Cannot call `filter` more than once per group')
  }
  if (typeof regex == 'string') {
    group.filter = new RegExp('.*' + regex + '.*')
  } else if (regex instanceof RegExp) {
    if (regex.global) {
      throw Error('Cannot use global RegExp')
    } else {
      group.filter = regex
    }
  } else {
    throw TypeError('Must provide string or RegExp')
  }
}

function header(message) {
  const group = getContext()
  if (group.parent != top) {
    throw Error('Cannot call `header` inside a `group` function')
  }
  group.file.header = message
}

function group(id, fn) {
  if (typeof id == 'function') {
    fn = id; id = ''
  }
  const group = new Group(id, getContext())
  group.parent.tests.push(group)
  setContext(group, fn)
}

function fgroup(id, fn) {
  if (typeof id == 'function') {
    fn = id; id = ''
  }
  const group = new Group(id, getContext())
  group.parent.tests.push(group)
  setContext(group, fn)
  focus(group.parent, group)
}

function xgroup() {
  // Do nothing.
}

function test(id, fn) {
  return new Test(id, fn)
}

function ftest(id, fn) {
  return focus(getContext(), new Test(id, fn))
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
  const file = files[path]
  if (!file) return false

  if (top && file.group) {
    const index = top.tests.indexOf(file.group)

    file.group = null
    nextRun.push(() => {
      if (top) {
        if (loadFile(file)) {
          // Replace the old test group.
          top.tests.splice(index, 1, file.group)
        } else {
          return false
        }
      }
    })
  }
  return true
}

function reloadAllTests() {
  if (top) {
    const order = top.tests
    top = null
    nextRun.push(() => {
      top = new Group('', null)
      for (const path in files) {
        const file = files[path]
        const index = order.indexOf(file.group)
        if (loadFile(file)) {
          top.tests[index] = file.group
        } else {
          return false
        }
      }
    })
  }
}

function removeTests(path) {
  const file = files[path]
  if (!file) return false

  if (top) {
    const index = top.tests.indexOf(file.group)
    top.tests.splice(index, 1)
    delete files[path]
  }
  return true
}

function startTests(options = {}) {
  if (runner) {
    throw Error('Already running')
  }

  // Print empty lines until the screen is blank.
  process.stdout.write('\033[2J')

  // Clear the scrollback.
  process.stdout.write('\u001b[H\u001b[2J\u001b[3J')

  if (nextRun.length) {
    const queue = nextRun.slice()
    nextRun.length = 0
    for (let i = 0; i < queue.length; i++) {
      if (queue[i]() === false) {
        return null
      }
    }
  }

  runner = new Runner(top, options)
  return Promise.resolve()
    .then(() => runner.start())
    .then(res => {
      runner = null
      return res
    })
    .catch(error => {
      runner = null
      console.log(formatError(error))
      return {error}
    })
}

async function stopTests() {
  if (runner) {
    runner.stop()
    await runner.promise
  }
}

module.exports = {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  filter,
  header,
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
  startTests,
  stopTests,
}

//
// Internal
//

function Test(id, fn) {
  if (typeof id == 'function') {
    fn = id; id = ''
  }
  this.id = id
  this.fn = fn
  this.line = getCallsite(2).getLineNumber()
  getContext(3).tests.push(this)
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

function getFile(group) {
  while (group) {
    if (group.file) return group.file
    group = group.parent
  }
}

function File(path) {
  this.path = path
  this.group = new Group('', top, this)
  top.tests.push(this.group)
}

function Group(id, parent, file) {
  this.id = id
  this.file = file || (parent ? getFile(parent) : null)
  this.parent = parent
  this.filter = matchAll
  this.tests = []
}

// Create a file if no context exists.
function getContext(i) {
  if (context) {
    return context
  } else {
    const path = getCallsite(i || 2).getFileName()
    const file = files[path] || (files[path] = new File(path))
    return file.group
  }
}

function setContext(group, createTests) {
  stack.push(context)
  context = group
  createTests()
  context = stack.pop()
}

// Focus on specific tests.
function focus(group, test) {
  if (group.only) {
    group.only.add(test)
  } else {
    group.only = new Set([test])
  }
  if (group.parent != top) {
    focus(group.parent, group)
  }
  return test
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

// Returns false when the file throws an error.
function loadFile(file) {
  toggleCallsites(true)
  file.group = new Group('', top, file)
  file.header = null
  try {
    delete require.cache[file.path]
    require(file.path)
  } catch(error) {
    console.log('')
    console.log(formatError(error))
    file.group = null
    nextRun.push(() => {
      if (top) return loadFile(file)
    })
    return false
  } finally {
    toggleCallsites(false)
  }
  return true
}
