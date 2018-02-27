
const path = require('path')

const {getCallsite} = require('./utils')
const tests = require('./tests')
const ctx = require('./context')
const fs = require('./fs')

//
// Exports
//

function beforeAll(fn) {
  ctx.pushFn('beforeAll', fn)
}

function beforeEach(fn) {
  ctx.pushFn('beforeEach', fn)
}

function afterEach(fn) {
  ctx.pushFn('afterEach', fn)
}

function afterAll(fn) {
  ctx.pushFn('afterAll', fn)
}

function filter(regex) {
  const group = ctx.get()
  if (group.filter) {
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
  const group = ctx.get()
  if (group.parent != ctx.top) {
    throw Error('Cannot call `header` inside a `group` function')
  }
  group.file.header = message
}

function focus() {
  ctx.get().focus()
}

function group(id, fn) {
  if (typeof id == 'function') {
    fn = id; id = ''
  }
  const parent = ctx.get()
  parent.tests.push(ctx.set(new ctx.Group(id, parent), fn))
}

function fgroup(id, fn) {
  if (typeof id == 'function') {
    fn = id; id = ''
  }
  const parent = ctx.get()
  const group = ctx.set(new ctx.Group(id, parent), fn)
  parent.tests.push(group)
  parent.focus(group)
}

function xgroup() {
  // Do nothing.
}

function test(id, fn) {
  return new Test(id, fn)
}

function ftest(id, fn) {
  return new Test(id, fn, true)
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
  fs.crawl(dir, pattern || '.js', []).forEach(path => {
    ctx.addFile(path)
    require(path)
  })
}

module.exports = {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  filter,
  header,
  focus,
  group,
  fgroup,
  xgroup,
  test,
  ftest,
  xtest,
  watchDir,
  findTests,
  reloadTests: tests.reload,
  reloadAllTests: tests.reloadAll,
  removeTests: tests.remove,
  startTests: tests.start,
  stopTests: tests.stop,
}

//
// Internal
//

function Test(id, fn, focus) {
  if (typeof id == 'function') {
    fn = id; id = ''
  }
  this.id = id
  if (typeof fn == 'function') {
    this.fn = fn
    this.line = getCallsite(2).getLineNumber()

    const group = ctx.get(3)
    if (focus) {
      group.focus(this)
    } else {
      group.tests.push(this)
    }
  }
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
    return (error) =>
      error.name == value.name &&
      error.message == value.message
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
