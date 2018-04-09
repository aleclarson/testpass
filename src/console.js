
const huey = require('huey')

const {join, slice} = Array.prototype

const mockable = [
  {ctx: console, key: 'log'},
  {ctx: console, key: 'warn'},
  {ctx: console, key: 'error'},
]

if (typeof process != 'undefined') {
  var {stdout, stderr} = process
  mockable.push({ctx: stdout, key: 'write'})
  mockable.push({ctx: stderr, key: 'write'})

  // Use `process.stdout` to ensure all logs appear in same location.
  const log = stdout.write.bind(stdout)
  console.debug = console.log = function() {
    log(join.call(arguments, ' ') + '\n')
  }
}

function LogBuffer(quiet) {
  this.queue = []
  this.quiet = !!quiet
  this.mock()
}

LogBuffer.prototype = {
  constructor: LogBuffer,
  mock() {
    if (!this.active) {
      this.active = true
      this.mocked = mockable.map(mock, this)
      if (typeof process != 'undefined') {
        this.stdout = this.mocked
          .filter(m => m.ctx == stdout)
          .map(m => ({
            write: m.fn.bind(m.ctx)
          }))[0]
      }
      process.prependListener('SIGINT', this.sigint = () => {
        this.prepend('').flush().unmock()
        if (process.listenerCount('SIGINT') == 0) {
          process.exit(130)
        }
      })
    }
    return this
  },
  flush() {
    const {queue} = this
    if (!queue.length) return this
    if (this.stdout) {
      const {stdout} = this
      queue.forEach(event => {
        stdout.write(event.args.join(' '))
        if (event.ctx == console) {
          stdout.write('\n')
        }
      })
    } else {
      queue.forEach(event => {
        event.fn.apply(event.ctx, event.args)
      })
    }
    queue.length = 0
    return this
  },
  unmock() {
    if (this.active) {
      process.removeListener('SIGINT', this.sigint)
      this.mocked.forEach(unmock)
      this.mocked = null
      this.active = false
    }
    return this
  },
  // Prepend a `console.log` call
  prepend() {
    const {fn, ctx} = this.mocked[0]
    const args = slice.call(arguments)
    this.queue.unshift({fn, ctx, args})
    return this
  },
  // Print an empty line (if the previous line is not empty)
  ln() {
    let isEmpty = true
    const {length} = this
    if (length) {
      const {args} = this.queue[length - 1]
      const last = args[args.length - 1]
      isEmpty = typeof last == 'string' && /\n\ *$/.test(last)
    }
    if (!isEmpty) {
      console.log('')
    }
    return this
  }
}

Object.defineProperty(LogBuffer.prototype, 'length', {
  get() { return this.queue.length }
})

module.exports = LogBuffer

//
// Internal
//

const noop = Function.prototype

function mock({ctx, key}) {
  const orig = {fn: ctx[key], ctx, key}
  if (this.quiet) {
    ctx[key] = noop
  } else if (this.stdout) {
    const {queue} = this
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
      queue.push({ctx, args})
    }
  } else {
    const {queue} = this
    ctx[key] = function() {
      queue.push({
        fn: orig.fn,
        ctx,
        args: slice.call(arguments)
      })
    }
  }
  return orig
}

function unmock(orig) {
  orig.ctx[orig.key] = orig.fn
}

function stringify(arg) {
  return typeof arg == 'string' ? arg : JSON.stringify(arg)
}
