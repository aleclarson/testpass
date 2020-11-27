
const {top, files, addFile, set: setContext, Group} = require('./context')
const {formatError, toggleCallsites} = require('./utils')
const Runner = require('./runner')

// The current test runner.
let runner = null

exports.start = function(opts) {
  if (runner) {
    throw Error('Already running')
  }
  runner = new Runner(top, opts)
  return runner.start()
    .then(res => {
      runner = null
      return res
    })
    .catch(error => {
      runner = null
      console.log(formatError(error))
      return {error}
    })
}

exports.stop = async function() {
  if (runner) {
    runner.stop()
    await runner.promise
  }
}

// Returns false when the file throws an error.
exports.load = function(path) {
  const file = files[path] || addFile(path)
  const index = file.group ? top.tests.indexOf(file.group) : -1
  file.group = new Group('', top, file)
  file.header = null

  toggleCallsites(true)
  try {
    // Assume the module isn't loaded.
    setContext(file.group, () => require(file.path))

    if (index == -1) {
      top.tests.push(file.group)
    } else {
      top.tests[index] = file.group
    }

    return true
  }
  catch(error) {
    console.log('')
    console.log(formatError(error))

    if (index !== -1) {
      top.tests.splice(index, 1)
    }

    file.group = null
    return false
  }
  finally {
    toggleCallsites(false)
  }
}

exports.unload = function(path) {
  const file = files[path]
  if (file) {
    const index = top.tests.indexOf(file.group)
    if (index !== -1) top.tests.splice(index, 1)
    delete files[path]
  }
}
