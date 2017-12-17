
const huey = require('huey')

let mocking = false

const mocked = [
  {ctx: console, key: 'log'},
  {ctx: console, key: 'warn'},
  {ctx: console, key: 'error'},
]

module.exports = function(enabled) {
  if (mocking != enabled) {
    if (mocking = enabled) {
      const logs = []
      logs.exec = exec
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
  const fn = orig.fn = ctx[key]
  ctx[key] = function() {
    this.push({
      fn,
      ctx,
      key,
      args: [].slice.call(arguments)
    })
  }.bind(this)
}

function unmock(orig) {
  const {ctx, key} = orig
  ctx[key] = orig.fn
}

function stringify(arg) {
  return typeof arg == 'string' ? arg : JSON.stringify(arg)
}

function exec() {
  if (typeof process != 'undefined') {
    this.forEach(event => {
      const args = event.args.map(stringify)
      if (event.key == 'warn') {
        args.unshift(huey.yellow('warn:'))
      } else if (event.key == 'error') {
        args.unshift(huey.red('error:'))
      }
      let msg = args.join(' ')
      if (event.obj == console) {
        msg = '\n' + msg
      }
      process.stdout.write(msg)
    })
  } else {
    this.forEach(event => {
      const args = event.obj == console ?
        event.args : event.args.map(stringify)
      event.fn.call(event.obj, args)
    })
  }
}
