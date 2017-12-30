
const huey = require('huey')
const path = require('path')

const {reloadModule} = require('./modules')
const tests = require('./tests')
const ctx = require('./context')
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

try {
  require.resolve(entry.path)
} catch(error) {
  const warn = huey.yellow('warn:')
  console.warn(`\n${warn} Entry path does not exist:\n  ` + huey.gray(entry.path) + '\n')
  process.exit()
}

// Load the tests.
ctx.addFile(entry.path)
require(entry.path)

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
  // Reload affected tests when a source file is changed/removed.
  return reloadModule(path)
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
