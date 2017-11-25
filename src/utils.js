
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

module.exports = {
  getCallsite,
  toggleCallsites,
}
