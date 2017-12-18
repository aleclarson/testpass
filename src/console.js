
const huey = require('huey')

const {join, slice, unshift} = Array.prototype

let mocking = false

const mocked = [
  {ctx: console, key: 'log'},
  {ctx: console, key: 'warn'},
  {ctx: console, key: 'error'},
]

if (typeof process != 'undefined') {
  var {stdout} = process
  mocked.push({ctx: stdout, key: 'write'})

  // Use `process.stdout` to ensure all logs appear in same location.
  const log = stdout.write.bind(stdout)
  console.debug = console.log = function() {
    log(join.call(arguments, ' ') + '\n')
  }
}

module.exports = function(enabled) {
  if (mocking != enabled) {
    if (mocking = enabled) {
      const logs = []
      logs.ln = ln
      logs.exec = exec
      logs.prepend = prepend
      mocked.forEach(mock, logs)
      return logs
    } else {
      mocked.forEach(unmock)
    }
  } else if (enabled) {
    throw Error('The console is already mocked')
  }
}

//
// Internal
//

function mock(orig) {
  const {ctx, key} = orig
  orig.fn = ctx[key]
  if (stdout) {
    ctx[key] = function() {
      const args = []
      if (key == 'warn') {
        args.push(huey.yellow('warn:'))
      } else if (key == 'error') {
        args.push(huey.red('error:'))
      }
      for (let i = 0; i < arguments.length; i++) {
        args.push(stringify(arguments[i]))
      }
      if (ctx == console) {
        args[0] = '\n' + args[0]
      }
      this.push({args})
    }.bind(this)
  } else {
    ctx[key] = function() {
      this.push({
        fn: orig.fn,
        ctx: this,
        args: slice.call(arguments)
      })
    }.bind(this)
  }
}

function unmock(orig) {
  const {ctx, key} = orig
  ctx[key] = orig.fn
}

// Print an empty line (if the previous line is not empty)
function ln() {
  let isEmpty = true
  if (this.length) {
    const {args} = this[this.length - 1]
    const last = args[args.length - 1]
    isEmpty = typeof last == 'string' && /\n\ *$/.test(last)
  }
  if (!isEmpty) {
    console.log('')
  }
}

// Prepend a `console.log` call
function prepend() {
  const {fn, ctx} = mocked[0]
  const args = slice.call(arguments)
  if (typeof process != 'undefined') {
    args[0] = '\n' + args[0]
  }
  unshift.call(this, {fn, ctx, args})
}

function stringify(arg) {
  return typeof arg == 'string' ? arg : JSON.stringify(arg)
}

function exec() {
  if (mocking) {
    mocking = false
    mocked.forEach(unmock)
  }
  if (this.length && !this.quiet) {
    if (stdout) {
      this.forEach(event => {
        stdout.write(event.args.join(' '))
      })
    } else {
      this.forEach(event => {
        event.fn.apply(event.ctx, event.args)
      })
    }
  }
}
