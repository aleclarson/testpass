
const sourceMapSupport = require('source-map-support')

exports.mapToSource = sourceMapSupport.wrapCallSite

exports.enableInlineMaps = function() {
  // Hook into `Module._compile` for VM module support.
  sourceMapSupport.install({
    hookRequire: true,
    handleUncaughtExceptions: false,
  })

  // Reset `Error.prepareStackTrace` because we use `wrapCallSite` directly.
  Error.prepareStackTrace = undefined
}
