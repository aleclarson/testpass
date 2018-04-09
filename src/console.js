
const huey = require('huey')

const {join, slice} = Array.prototype

const mockable = [
  {ctx: console, key: 'log'},
  {ctx: console, key: 'warn'},
  {ctx: console, key: 'error'},
]

if (typeof process != 'undefined') {
  var {stdout} = process
  mockable.push({ctx: stdout, key: 'write'})

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
      this.sigint = () => {
        process.removeListener('SIGINT', this.sigint)
        this.exec()
        if (process.listenerCount('SIGINT') == 0) {
          process.exit(130)
        }
      }
      process.prependListener('SIGINT', this.sigint)
    }
  },
  unmock() {
    if (this.active) {
      process.removeListener('SIGINT', this.sigint)
      this.mocked.forEach(unmock)
      this.mocked = null
      this.active = false
    }
  },
  // Prepend a `console.log` call
  prepend() {
    const {fn, ctx} = this.mocked[0]
    const args = slice.call(arguments)
    this.queue.unshift({fn, ctx, args})
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
  },
  exec() {
    this.unmock()

    const {queue} = this
    if (!queue) return

    this.queue = null
    if (!this.quiet && queue.length) {
      if (stdout) {
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
    }
  },
}

Object.defineProperty(LogBuffer.prototype, 'length', {
  get() { return this.queue.length }
})

module.exports = LogBuffer

//
// Internal
//

function mock({ctx, key}) {
  const orig = {fn: ctx[key], ctx, key}
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
      this.queue.push({ctx, args})
    }.bind(this)
  } else {
    ctx[key] = function() {
      this.queue.push({
        fn: orig.fn,
        ctx: this,
        args: slice.call(arguments)
      })
    }.bind(this)
  }
  return orig
}

function unmock(orig) {
  orig.ctx[orig.key] = orig.fn
}

function stringify(arg) {
  return typeof arg == 'string' ? arg : JSON.stringify(arg)
}
