const slurm = require('slurm')
const huey = require('huey')
const path = require('path')

const {reloadModule} = require('./modules')
const tests = require('./tests')
const ctx = require('./context')
const fs = require('./fs')

require('./sourcemaps').enableInlineMaps()

const args = slurm({
  w: true, // watch
  v: true, // verbose
  s: true, // silent
  r: true, // repeat
  h: true, // help
})

if (args.h) {
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

let entry = path.resolve(args[0] || 'test.js')
if (!path.extname(entry)) entry += '/test.js'

try {
  require.resolve(entry)
} catch(error) {
  const warn = huey.yellow('warn:')
  console.warn(`\n${warn} entry does not exist:\n  ` + huey.gray(entry) + '\n')
  process.exit(1)
}

// Load the tests.
ctx.addFile(entry)
require(entry)

// Start the tests on the next tick.
setImmediate(async function() {
  let running = startTests()

  // Repeat tests until exit.
  if (args.r) {
    while (true) {
      await running
      debugger // allow debugging between runs
      running = startTests()
    }
  }

  // Enable watch mode.
  else if (args.w) {
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
  if (args.w) {
    // Print empty lines until the screen is blank.
    process.stdout.write('\033[2J')

    // Clear the scrollback.
    process.stdout.write('\u001b[H\u001b[2J\u001b[3J')
  }
  tests.start({
    verbose: args.v,
    quiet: args.s,
  })
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
