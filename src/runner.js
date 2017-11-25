
const cleanStack = require('clean-stack')
const isObject = require('isObject')
const huey = require('huey')

const {getCallsite, toggleCallsites} = require('./utils')
const fs = require('./fs')

function runTests(top) {
  if (top.parent) {
    throw Error('Must pass a top-level group')
  }

  let stopped = false
  const runner = {
    finished: false,
    stop() {
      stopped = true
    }
  }

  runner.promise = (async function() {
    toggleCallsites(true)

    const files = []
    for (const path in top.files) {
      const file = new RunningFile(top.files[path], runner)
      if (!runner.stopped) {
        files.push(file)
        await runGroup(file.group)
      }
    }

    toggleCallsites(false)
    if (!runner.stopped) {
      runner.finished = true

      let testCount = 0, passCount = 0, failCount = 0
      files.forEach(file => {
        testCount += file.testCount
        passCount += file.passCount
        failCount += file.failCount
      })

      if (testCount) {
        const color = failCount ? 'red' : 'green'
        console.log('\n' + huey[color](passCount) + ' / ' + testCount + ' tests passed\n')
      }

      return {
        files,
        testCount,
        passCount,
        failCount,
      }
    }
  })()

  runner.promise.catch(error => {
    console.log(formatError(error))
  })

  return runner
}

async function runTest(test) {

  // Check if `test` is really a group.
  if (Array.isArray(test.tests)) {
    return runGroup(test)
  }

  // Run the test!
  const {file} = test.group
  try {
    const result = test.fn(test)
    if (result && typeof result.then == 'function') {
      await result
    }
    if (test.catch) {
      file.failCount += 1
      console.log(huey.red('Fail: ') + getTestName(test))
      console.log(huey.gray('  Expected an error to be thrown'))
      return
    }
  } catch(error) {
    if (!test.catch || !test.catch(error)) {
      file.failCount += 1
      console.log(huey.red('Fail: ') + getTestName(test))
      console.log(formatError(error))
      return
    }
  }
  if (test.errors) {
    file.failCount += 1
    console.log(huey.red('Fail: ') + getTestName(test))
    test.errors.forEach(error => {
      let message = ''
      if (typeof error.line == 'number') {
        const code = fs.readFile(file.path)[error.line]
        message = huey.yellow(error.line) + ' ' + code
      }
      if (error.message) {
        console.log('  ' + huey.gray(error.message))
        console.log('    ' + line)
      } else {
        console.log('  ' + line)
      }
    })
  } else {
    file.passCount += 1
    console.log(huey.green('Pass: ') + getTestName(test))
  }
}

module.exports = {
  runTests,
  runTest,
}

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
  this.index = ++file.testCount
  if (test.catch) {
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
        message: `Expected ${value} to be ${expected}`,
      })
    }
  },
  ne(result, expected) {
    if (deepEquals(result, expected)) {
      this._fail({
        line: getCallsite(1).getLineNumber(),
        message: `Expected ${value} not to be ${expected}`,
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
  if (Array.isArray(x)) {
    if (Array.isArray(y)) {
      return arrayEquals(x, y)
    }
  }
  else if (isObject(x)) {
    if (isObject(y)) {
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
  const keys = Object.keys(x)
  for (let i = 0, k = Object.keys(y); i < k.length; i++) {
    if (keys.indexOf(k[i]) < 0) return false
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (!deepEquals(x[key], y[key])) return false
  }
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

async function runGroup(group) {
  if (group.beforeAll) {
    await runAll(group.beforeAll)
  }

  // Merge all tests into a single promise.
  let tests = Promise.resolve()
  group.tests.forEach(test => {
    tests = tests.then(async function() {
      if (group.beforeEach) {
        await runAll(group.beforeEach)
      }

      await runTest(test)

      test.finished = true
      test.group.finish(test)

      if (group.afterEach) {
        await runAll(group.afterEach)
      }
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

function formatError(error) {
  return [
    huey.red(error.name + ': ') + error.message,
    formatStack(error.stack),
    ''
  ].join('\n')
}

function formatStack(stack) {
  stack = stack.map(frame => '  at ' + frame.toString()).join('\n')
  return huey.gray(cleanStack(stack))
}
