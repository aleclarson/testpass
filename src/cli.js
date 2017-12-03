
const huey = require('huey')
const path = require('path')

const fs = require('./fs')
const tp = require('.')

require('./sourcemaps').enableInlineMaps()

// Load the tests.
const entry = getEntryPath()
try {
  require(entry)
} catch(error) {
  if (error.code == 'MODULE_NOT_FOUND') {
    const warn = huey.yellow('warn:')
    console.warn(`\n${warn} Entry path does not exist:\n  ` + huey.gray(entry) + '\n')
    process.exit()
  } else {
    throw error
  }
}

// Start the tests on the next tick.
setImmediate(async function() {
  tp.startTests({
    verbose: hasFlag('-v'),
  })

  // Enable watch mode.
  if (hasFlag('-w')) {
    let rerunId = null
    fs.watch((event, file) => {
      if (onFileChange(event, file)) {
        clearTimeout(rerunId)
        rerunId = setTimeout(() => {
          tp.stopTests().then(tp.startTests)
        }, 1000)
      }
    })
  }
})

function onFileChange(event, path) {
  // Reload all tests when a file is added.
  if (event == 'add') {
    tp.reloadAllTests()
    return true
  }
  // Reload a specific test file.
  if (event == 'change') {
    if (tp.reloadTests(path)) {
      return true
    }
  }
  // Remove a specific test file.
  else if (tp.removeTests(path)) {
    return true
  }
  // Reload all tests when a source file is changed.
  if (require.cache[path]) {
    delete require.cache[path]
    tp.reloadAllTests()
    return true
  }
  return false
}

function hasFlag(flag) {
  return process.argv.indexOf(flag) >= 0
}

function getEntryPath() {
  let entry = process.argv[2]
  if (entry == '--') entry = process.argv[3]
  if (!entry || entry[0] == '-') entry = 'test.js'
  return path.resolve(entry)
}
