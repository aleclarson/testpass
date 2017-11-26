
const cleanStack = require('clean-stack')
const huey = require('huey')

// Equals true when callsites are preserved.
let preserving = false

// The previous value of `Error.prepareStackTrace`
let prepareStackTrace = undefined

// Overrides the default `Error.prepareStackTrace`
const returnCallsites = (e, stack) => stack

function getCallsite(index) {
  const wasEnabled = preserving
  toggleCallsites(true)
  const callsite = Error().stack[1 + index]
  toggleCallsites(wasEnabled)
  return callsite
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
  return indent + [
    huey.red(error.name + ': ' + error.message),
    formatStack(error.stack, indent),
    ''
  ].join('\n')
}

function formatStack(stack, indent) {
  stack = stack.filter(frame => frame.getFileName())
    .map(frame => indent + '  at ' + frame.toString()).join('\n')
  return huey.gray(cleanStack(stack, {pretty: true}))
}

module.exports = {
  getCallsite,
  toggleCallsites,
  formatError,
  formatStack,
}
