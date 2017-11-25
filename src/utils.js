
const cleanStack = require('clean-stack')
const huey = require('huey')

const preserveCallsites = (e, stack) => stack

function getCallsite(index) {
  const enabled = Error.prepareStackTrace != null
  if (!enabled) toggleCallsites(true)
  const callsite = Error().stack[1 + index]
  if (!enabled) toggleCallsites(false)
  return callsite
}

function toggleCallsites(enabled) {
  Error.prepareStackTrace = enabled ? preserveCallsites : undefined
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
