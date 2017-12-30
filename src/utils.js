
const cleanStack = require('clean-stack')
const huey = require('huey')

const {mapToSource} = require('./sourcemaps')

// Equals true when callsites are preserved.
let preserving = false

// The previous value of `Error.prepareStackTrace`
let prepareStackTrace = undefined

// Overrides the default `Error.prepareStackTrace`
const returnCallsites = (e, stack) => {
  stack.split = splitCallsites
  stack.replace = returnThis
  return stack
}

function splitCallsites(delimiter) {
  if (delimiter == '\n') {
    return this.map(frame => 'at  ' + frame)
  }
  return []
}

function returnThis() {
  return this
}

function getCallsite(index) {
  const wasEnabled = preserving
  toggleCallsites(true)
  const callsite = Error().stack[1 + index]
  toggleCallsites(wasEnabled)
  return mapToSource(callsite)
}

function toggleCallsites(enabled) {
  if (preserving != enabled) {
    preserving = enabled
    if (enabled) {
      prepareStackTrace = Error.prepareStackTrace
      Error.prepareStackTrace = returnCallsites
    } else {
      Error.prepareStackTrace = prepareStackTrace
    }
  }
}

function formatError(error, indent = '') {
  const message = error.name + ': ' + error.message

  let {stack} = error
  if (Array.isArray(stack)) {
    stack = stack.filter(frame => frame.getFileName())
      .map(frame => indent + '  at ' + mapToSource(frame))
      .join('\n')
  } else {
    stack = stack.slice(message.length + 1)
  }

  return [
    indent + huey.red(message),
    huey.gray(cleanStack(stack, {pretty: true})),
    ''
  ].join('\n')
}

module.exports = {
  getCallsite,
  toggleCallsites,
  formatError,
}
