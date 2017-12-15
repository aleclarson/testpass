
const huey = require('huey')
const path = require('path')

const tests = require('./tests')
const fs = require('./fs')

require('./sourcemaps').enableInlineMaps()

const entry = getEntryPath()
if (hasFlag('-h') || entry.input == 'help') {
  console.log(`
  tp [file]

  Run tests for the given file.
  If no file is given, look for "$PWD/test.js" and run it.

  Options:
    -w   Enable watch mode
    -v   Show passed tests (instead of only failed)
    -s   Silence all logs
  `)
  process.exit()
}

// Load the tests.
try {
  require(entry.path)
} catch(error) {
  if (error.code == 'MODULE_NOT_FOUND') {
    const warn = huey.yellow('warn:')
    console.warn(`\n${warn} Entry path does not exist:\n  ` + huey.gray(entry.path) + '\n')
    process.exit()
  } else {
    throw error
  }
}

// CLI options
const options = {
  verbose: hasFlag('-v'),
  quiet: hasFlag('-s'),
}

// Start the tests on the next tick.
setImmediate(async function() {
  startTests()

  // Enable watch mode.
  if (hasFlag('-w')) {
    let rerunId = null
    fs.watch((event, file) => {
      if (onFileChange(event, file)) {
        clearTimeout(rerunId)
        rerunId = setTimeout(() => {
          tests.stop().then(startTests)
        }, 1000)
      }
    })
  }
})

function startTests() {

  // Print empty lines until the screen is blank.
  process.stdout.write('\033[2J')

  // Clear the scrollback.
  process.stdout.write('\u001b[H\u001b[2J\u001b[3J')

  tests.start(options)
}

function onFileChange(event, path) {
  // Reload all tests when a file is added.
  if (event == 'add') {
    tests.reloadAll()
    return true
  }
  // Reload a specific test file.
  if (event == 'change') {
    if (tests.reload(path)) {
      return true
    }
  }
  // Remove a specific test file.
  else if (tests.remove(path)) {
    return true
  }
  // Reload all tests when a source file is changed.
  if (require.cache[path]) {
    delete require.cache[path]
    tests.reloadAll()
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
  return {
    path: path.resolve(entry),
    input: entry,
  }
}
