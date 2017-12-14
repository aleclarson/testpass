// TODO: Support more of the Console API.

const huey = require('huey')

const {stdout} = process

// Equals true if the console is mocked.
let mocking = false

const keys = ['log', 'warn', 'error']
const mocked = []

function mockConsole(enabled) {
  if (enabled == mocking) {
    if (mocking) {
      throw Error('The console is already mocked')
    } else {
      return
    }
  }

  mocking = enabled
  if (enabled) {
    const logs = []
    logs.perform = performCalls
    keys.forEach((key, i) => {
      mocked[i] = console[key]
      mock(console, key, logs)
    })
    return logs
  } else {
    keys.forEach((key, i) => {
      console[key] = mocked[i]
    })
  }
}

module.exports = mockConsole

//
// Internal
//

function mock(obj, key, logs) {
  obj[key] = function() {
    const call = [key]
    for (let i = 0; i < arguments.length; i++) {
      call.push(arguments[i])
    }
    logs.push(call)
  }
}

function performCalls() {
  for (let i = 0; i < this.length; i++) {
    const args = this[i]
    const key = args.shift()
    for (let j = 0; j < args.length; j++) {
      const arg = args[j]
      if (typeof arg != 'string') {
        args[j] = JSON.stringify(arg)
      }
    }
    if (key == 'warn') {
      args.unshift(huey.yellow('warn:'))
    } else if (key == 'error') {
      args.unshift(huey.red('error:'))
    }
    stdout.write('\n' + args.join(' '))
  }
}
