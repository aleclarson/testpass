
const isObject = require('is-object')
const isSet = require('is-set')
const huey = require('huey')

const {formatError, getCallsite, toggleCallsites} = require('./utils')
const fs = require('./fs')

const homedir = new RegExp('^' + require('os').homedir())
const stopError = Error('The runner was stopped')

function Runner(top, files) {
  if (top.parent) {
    throw Error('Must pass a top-level test group')
  }
  this.tests = top.tests
  this.files = files
  this.stopped = false
  this.finished = false
}

Runner.prototype = {
  constructor: Runner,
  start() {
    if (this.promise) return this.promise
    return this.promise = runTests.call(this)
  },
  stop() {
    this.stopped = true
  }
}

module.exports = Runner

//
// Internal
//

function RunningFile(file, runner) {
  this.path = file.path
  this.runner = runner
  this.testCount = 0
  this.passCount = 0
  this.failCount = 0
  this.finished = false
  this.group = new RunningGroup(file.group, null, this)
}

function RunningGroup(group, parent, file) {
  this.id = group.id
  this.file = file
  this.parent = parent

  const order = []
  const queue = new Set
  group.tests.forEach(test => {
    if (group.filter.test(test.id)) {
      const ctr = test.tests ? RunningGroup : RunningTest
      const inst = new ctr(test, this, file)
      order.push(inst)
      queue.add(inst)
    }
  })

  this.tests = order
  this.running = queue
  this.finished = false

  // Hooks
  this.beforeAll = group.beforeAll
  this.beforeEach = group.beforeEach
  this.afterEach = group.afterEach
  this.afterAll = group.afterAll
}

RunningGroup.prototype = {
  constructor: RunningGroup,
  finish(test) {
    const exists = this.running.delete(test)
    if (exists && !this.running.size) {
      this.finished = true
      if (this.parent) {
        this.parent.finish(this)
      } else {
        this.file.finished = true
      }
    }
  }
}

function RunningTest(test, group, file) {
  this.id = test.id
  this.fn = test.fn
  this.line = test.line
  this.index = ++file.testCount
  if (test.hasOwnProperty('catch')) {
    this.catch = test.catch
  }
  this.group = group
  this.finished = false
}

RunningTest.prototype = {
  constructor: RunningTest,
  eq(result, expected) {
    if (!deepEquals(result, expected)) {
      this._fail({
        line: getCallsite(1).getLineNumber(),
        message: `Expected ${result} to be ${expected}`,
      })
    }
  },
  ne(result, expected) {
    if (deepEquals(result, expected)) {
      this._fail({
        line: getCallsite(1).getLineNumber(),
        message: `Expected ${result} not to be ${expected}`,
      })
    }
  },
  assert(cond) {
    if (!cond) {
      this._fail({
        line: getCallsite(1).getLineNumber(),
      })
    }
  },
  fail(message) {
    this._fail({
      line: getCallsite(1).getLineNumber(),
      message,
    })
  },
  _fail(error) {
    if (this.errors) {
      this.errors.push(error)
    } else {
      this.errors = [error]
    }
  }
}

function deepEquals(x, y) {
  if (isObject(x)) {
    if (Array.isArray(x)) {
      if (Array.isArray(y)) {
        return arrayEquals(x, y)
      }
    }
    else if (isSet(x)) {
      if (isSet(y)) {
        return setEquals(x, y)
      }
    }
    else if (isObject(y)) {
      return objectEquals(x, y)
    }
  }
  else if (x === y) {
    return true
  }
  return false
}

function arrayEquals(x, y) {
  if (x.length != y.length) {
    return false
  }
  for (let i = 0; i < x.length; i++) {
    if (!deepEquals(x[i], y[i])) {
      return false
    }
  }
  return true
}

function objectEquals(x, y) {
  const xk = Object.keys(x)
  const yk = Object.keys(y)
  if (xk.length == yk.length) {
    for (let i = 0; i < yk.length; i++) {
      if (xk.indexOf(yk[i]) < 0) return false
    }
    for (let i = 0; i < xk.length; i++) {
      const k = xk[i]
      if (!deepEquals(x[k], y[k])) return false
    }
    return true
  }
  return false
}

function setEquals(x, y) {
  if (x.size == y.size) {
    for (let v of x) {
      if (!y.has(v)) return false
    }
    return true
  }
  return false
}

function getTestName(test) {
  const ids = []
  let group = test.group
  if (group.id) {
    ids.push(group.id)
  }
  while (group = group.parent) {
    if (group.id) {
      ids.unshift(group.id)
    }
  }
  if (test.id) {
    ids.push(test.id)
  } else {
    ids.push('#' + test.index)
  }
  return ids.join(' ')
}

function printFailedTest(test, file, error) {
  const location = file.path.replace(homedir, '~') + ':' + test.line
  console.log(huey.red('× ') + getTestName(test))
  console.log(huey.gray('  at ' + location))
  if (error) {
    console.log(formatError(error, '  '))
  }
}

async function runTests() {
  toggleCallsites(true)

  const {tests, files} = this
  const running = []
  try {
    for (let i = 0; i < tests.length; i++) {
      const file = new RunningFile(tests[i].file, this)
      if (!this.stopped) {
        running.push(file)
        await runGroup(file.group)
      }
    }
  } catch(error) {
    (error == stopError) || console.log(formatError(error))
    return
  } finally {
    toggleCallsites(false)
  }

  if (!this.stopped) {
    this.finished = true

    let testCount = 0, passCount = 0, failCount = 0
    running.forEach(file => {
      testCount += file.testCount
      passCount += file.passCount
      failCount += file.failCount
    })

    if (testCount) {
      const color = failCount ? 'red' : 'green'
      console.log(huey[color](passCount) + ' / ' + testCount + ' tests passed\n')
    }

    return {
      files: running,
      testCount,
      passCount,
      failCount,
    }
  }
}

async function runTest(test) {
  const {file} = test.group
  try {
    const result = test.fn(test)
    if (result && typeof result.then == 'function') {
      await result
    }
    if (test.catch) {
      file.failCount += 1
      printFailedTest(test, file)
      console.log(huey.red('  Expected an error to be thrown'))
      console.log('')
      return
    }
  } catch(error) {
    if (!test.catch || !test.catch(error)) {
      file.failCount += 1
      printFailedTest(test, file, error)
      return
    }
  }
  if (test.errors) {
    file.failCount += 1
    printFailedTest(test, file)
    console.log('')
    test.errors.forEach((error, index) => {
      let message = ''
      if (typeof error.line == 'number') {
        const code = fs.readFile(file.path)[error.line - 1]
        message = '  ' + huey.gray(error.line + ': ') + code.trim()
      }
      if (error.message) {
        message = '  ' + huey.red(error.message) + '\n  ' + message
      }
      if (index > 0) {
        console.log('')
      }
      console.log(message)
    })
    console.log('')
  } else {
    file.passCount += 1
    if (process.flags.verbose && test.id) {
      console.log(huey.green('• ') + getTestName(test))
    }
  }
}

async function runGroup(group) {
  if (group.beforeAll) {
    await runAll(group.beforeAll)
  }

  // Merge all tests into a single promise.
  let tests = Promise.resolve()
  group.tests.forEach(test => {
    tests = tests.then(async function() {
      if (group.file.runner.stopped) {
        throw stopError
      }

      if (group.beforeEach) {
        await runAll(group.beforeEach)
      }

      // Check if `test` is really a group.
      if (Array.isArray(test.tests)) {
        await runGroup(test)
      } else {
        await runTest(test)
        test.finished = true
      }

      if (group.afterEach) {
        await runAll(group.afterEach)
      }

      // Mark the test as finished.
      group.finish(test)
    })
  })

  // Wait for all tests to finish.
  await tests

  if (group.afterAll) {
    await runAll(group.afterAll)
  }
}

async function runAll(fns) {
  for (let i = 0; i < fns.length; i++) {
    const result = fns[i]()
    if (result && typeof result.then == 'function') {
      await result
    }
  }
}
