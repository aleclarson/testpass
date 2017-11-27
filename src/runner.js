
const isObject = require('is-object')
const isSet = require('is-set')
const bold = require('ansi-bold')
const huey = require('huey')
const path = require('path')

const {formatError, getCallsite, toggleCallsites} = require('./utils')
const fs = require('./fs')

const homedir = new RegExp('^' + require('os').homedir())
const stopError = Error('The runner was stopped')

function Runner(top) {
  if (top.parent) {
    throw Error('Must pass a top-level test group')
  }
  this.tests = top.tests
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
  this.header = file.header
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
  this.index = this.id || !parent ? file.testCount : parent.index
  this.parent = parent
  this.tests = new Set
  this.finished = false

  // Filter the grouped tests.
  const tests = group.only || group.tests
  tests.forEach(test => {
    if (group.filter.test(test.id)) {
      const ctr = test.tests ? RunningGroup : RunningTest
      this.tests.add(new ctr(test, this, file))
    }
  })

  // Hooks
  this.beforeAll = group.beforeAll
  this.beforeEach = group.beforeEach
  this.afterEach = group.afterEach
  this.afterAll = group.afterAll
}

RunningGroup.prototype = {
  constructor: RunningGroup,
  finish(test) {
    const exists = this.tests.delete(test)
    if (exists && !this.tests.size) {
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
  this.index = ++file.testCount - group.index
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

function printFailedTest(test, file, indent, error) {
  const location = file.path.replace(homedir, '~') + ':' + test.line
  console.log(indent + huey.red('× ') + getTestName(test))
  console.log(indent + huey.gray('  at ' + location))
  if (error) {
    console.log(formatError(error, indent + '  '))
  }
}

async function runTests() {
  const {tests} = this

  let focused = false
  const files = []
  for (let i = 0; i < tests.length; i++) {
    const file = tests[i].file
    if (!focused || file.group.only) {
      focused = !!file.group.only
      files.push(new RunningFile(file, this))
    }
  }

  toggleCallsites(true)
  try {
    if (!focused && files.length == 1) {
      console.log('')
    }
    for (let i = 0; i < files.length; i++) {
      if (!this.stopped) {
        const file = files[i]
        if (focused || files.length > 1) {
          const header = file.header ||
            path.relative(process.cwd(), file.path)

          console.log('')
          console.log(new Array(header.length).fill('⎼').join(''))
          console.log(bold(header) + '\n')
        }
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
    files.forEach(file => {
      testCount += file.testCount
      passCount += file.passCount
      failCount += file.failCount
    })

    if (testCount) {
      const emoji = passCount == testCount ? '🙂' : '💀'
      const passed = huey[failCount ? 'red' : 'green'](passCount)
      console.log(`\n${passed} / ${testCount} tests passed ${emoji}\n`)
    }

    return {
      files,
      testCount,
      passCount,
      failCount,
    }
  }
}

async function runTest(test) {
  const {file} = test.group
  const indent = file.runner.tests.length > 1 ? '  ' : ''
  try {
    const result = test.fn(test)
    if (result && typeof result.then == 'function') {
      await result
    }
    if (test.catch) {
      file.failCount += 1
      printFailedTest(test, file, indent)
      console.log(indent + huey.red('  Expected an error to be thrown'))
      console.log('')
      return
    }
  } catch(error) {
    if (!test.catch || !test.catch(error)) {
      file.failCount += 1
      printFailedTest(test, file, indent, error)
      return
    }
  }
  if (test.errors) {
    file.failCount += 1
    printFailedTest(test, file, indent)
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
      console.log(indent + message)
    })
    console.log('')
  } else {
    file.passCount += 1
    if (process.flags.verbose && test.id) {
      console.log(indent + huey.green('✦ ') + getTestName(test))
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
      if (test.tests) {
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
