
const isObject = require('is-object')
const isSet = require('is-set')
const bocks = require('bocks')
const bold = require('ansi-bold')
const huey = require('huey')
const path = require('path')

const {formatError, getCallsite, toggleCallsites} = require('./utils')
const LogBuffer = require('./console')
const fs = require('./fs')

const homedir = new RegExp('^' + require('os').homedir())
const stopError = Error('The runner was stopped')

function Runner(top, options = {}) {
  if (top.parent) {
    throw Error('Must pass a top-level test group')
  }
  this.tests = top.tests
  this.quiet = !options.verbose && !!options.quiet
  this.verbose = !!options.verbose
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
  this.index = this.id || !parent ? file.testCount : parent.index
  this.parent = parent
  this.tests = new Set
  this.finished = false

  // Filter the grouped tests.
  const tests = group.only instanceof Set ? group.only : group.tests
  tests.forEach(test => {
    if (!group.filter || group.filter.test(test.id)) {
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
  delay(ms, fn) {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          const result = fn()
          if (result && typeof result.then == 'function') {
            await result
          }
          resolve()
        } catch(error) {
          reject(error)
        }
      }, ms)
    })
  },
  eq(result, expected) {
    if (!deepEquals(result, expected)) {
      this._fail({
        line: getCallsite(1).getLineNumber(),
        message: `Expected ${JSON.stringify(result)} to be ${JSON.stringify(expected)}`,
      })
    }
  },
  ne(result, expected) {
    if (deepEquals(result, expected)) {
      this._fail({
        line: getCallsite(1).getLineNumber(),
        message: `Expected ${JSON.stringify(result)} not to be ${JSON.stringify(expected)}`,
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

function formatFailedTest(test, file, indent, error) {
  const location = file.path.replace(homedir, '~') + ':' + test.line
  return [
    indent, huey.red('× '), getTestName(test),
    '\n', indent, huey.gray('  at ' + location),
    error ? '\n' + formatError(error, indent + '  ') : '',
  ].join('')
}

function grayBox(input) {
  return bocks(input).replace(bocks.RE, huey.dim.gray('$1'))
}

async function runTests() {
  const {tests} = this

  let focused = false
  const files = []
  for (let i = 0; i < tests.length; i++) {
    const file = tests[i].file
    if (file.group.tests.length) {
      if (file.group.only) {
        if (!focused) {
          files.length = 0
        }
        files.push(file)
        focused = true
      } else if (!focused) {
        files.push(file)
      }
    }
  }

  toggleCallsites(true)
  const finished = []
  try {
    for (let i = 0; i < files.length; i++) {
      if (!this.stopped) {
        const file = files[i]
        const running = new RunningFile(file, this)

        const logs = new LogBuffer(this.quiet)
        if (!logs.quiet) {
          const header = file.header ||
            path.relative(process.cwd(), file.path)

          console.log('')
          console.log(grayBox(bold(header)) + '\n')
        }

        await runGroup(running.group)
        if (logs.length > 2) {
          logs.exec()
        } else {
          logs.unmock()
        }
        finished.push(running)
      }
    }
  } catch(error) {
    if (error != stopError) {
      if (!this.quiet) {
        console.log(formatError(error))
      }
      return {files, error}
    } else {
      return {files, stopped: true}
    }
  } finally {
    toggleCallsites(false)
  }

  if (!this.stopped) {
    this.finished = true

    let testCount = 0, passCount = 0, failCount = 0
    finished.forEach(file => {
      testCount += file.testCount
      passCount += file.passCount
      failCount += file.failCount
    })

    if (!this.quiet) {
      let report
      if (testCount) {
        const emoji = passCount == testCount ? '🙂' : '💀'
        const passed = huey[failCount ? 'red' : 'green'](passCount)
        report = `${passed} / ${testCount} tests passed ${emoji}`
      } else {
        report = huey.yellow('warn:') + ' 0 / 0 tests passed 💩'
      }
      console.log(grayBox(report))
    }

    return {
      files,
      testCount,
      passCount,
      failCount,
    }
  }
}

async function runTest(test, logs) {
  const {file} = test.group
  const {runner} = file
  const indent = runner.tests.length > 1 ? '  ' : ''
  try {
    const result = test.fn(test)
    if (result && typeof result.then == 'function') {
      await result
    }
    if (test.catch) {
      file.failCount += 1
      if (!runner.quiet) {
        logs.prepend([
          formatFailedTest(test, file, indent),
          '\n', indent, huey.red('  Expected an error to be thrown'),
          '\n'
        ].join(''))
      }
      return
    }
  } catch(error) {
    if (typeof error == 'string') {
      error = Error(error)
    }
    if (!test.catch || !test.catch(error)) {
      file.failCount += 1
      if (!runner.quiet) {
        logs.prepend(formatFailedTest(test, file, indent, error))
      }
      return
    }
  }
  if (test.errors) {
    file.failCount += 1
    if (!runner.quiet) {
      logs.prepend(formatFailedTest(test, file, indent) + '\n')
      logs.ln()
      test.errors.forEach((error, index) => {
        let message = ''
        if (typeof error.line == 'number') {
          const code = fs.readFile(file.path)
          const line = code[error.line - 1]
          if (line) {
            message = '  ' + huey.gray(error.line + ': ') + line.trim()
          } else {
            const warn = huey.yellow('warn: ')
            console.log(warn + 'Invalid line: ' + error.line)
            console.log(warn + '    for file: ' + huey.gray(file.path))
          }
        }
        if (error.message) {
          message = '  ' + huey.red(error.message) + '\n  ' + message
        }
        if (index > 0) console.log('')
        console.log(indent + message)
      })
      console.log('')
    }
  } else {
    file.passCount += 1
    if (runner.verbose) {
      if (logs.length) {
        logs.ln()
        logs.prepend('')
      }
      logs.prepend(indent + huey.green('✦ ') + getTestName(test))
    } else {
      logs.quiet = true
    }
  }
}

async function runGroup(group) {
  const {runner} = group.file

  // Logs within `beforeAll` are always silenced.
  if (group.beforeAll) {
    const logs = new LogBuffer()
    try {
      await runAll(group.beforeAll)
    } finally {
      logs.unmock()
    }
  }

  // Merge all tests into a single promise.
  let tests = Promise.resolve()
  group.tests.forEach(test => {
    tests = tests.then(async function() {
      if (runner.stopped) {
        throw stopError
      }

      // Logs from `beforeEach`, `runTest`, and `afterEach` are kept together.
      let logs = new LogBuffer(runner.quiet)

      if (group.beforeEach) {
        try {
          await runAll(group.beforeEach)
        } catch(error) {
          logs.ln()
          logs.exec()
          throw error
        }
        logs.ln()
      }

      // Avoid mocking console for `runGroup`.
      if (!test.fn) {
        logs.exec()
      }

      try {
        if (test.fn) {
          await runTest(test, logs)
          test.finished = true
        } else {
          await runGroup(test)
        }
      } catch(error) {
        logs.unmock()
        throw error
      }

      // Don't run `afterEach` if the runner is stopped.
      if (group.afterEach) {
        if (!test.fn) {
          logs = new LogBuffer(runner.quiet)
        }
        try {
          await runAll(group.afterEach)
        } finally {
          logs.ln()
          logs.exec()
        }
      } else if (test.fn) {
        logs.exec()
      }

      // Notify the parent group that we finished.
      group.finish(test)
    })
  })

  // Wait for all tests to finish.
  try {
    await tests
  } finally {
    // Logs within `afterAll` are always silenced.
    if (group.afterAll) {
      const logs = new LogBuffer()
      try {
        await runAll(group.afterAll)
      } finally {
        logs.unmock()
      }
    }
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
