// TODO: Support more of the Console API.

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
    const key = this[i].shift()
    console[key].apply(console, this[i])
  }
}
