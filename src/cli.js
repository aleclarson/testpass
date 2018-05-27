const slurm = require('slurm')
const huey = require('huey')
const path = require('path')
const fs = require('fs')

const {watch} = require('./fs')
const modules = require('./modules')
const tests = require('./tests')
const ctx = require('./context')

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
tests.load(entry)

// Start the tests on the next tick.
setImmediate(async function() {
  let running = startTests()
  function startTests() {
    return tests.start({
      verbose: args.v,
      quiet: args.s,
    })
  }

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
    const unloadQueue = new Set()  // Files to unload.
    const changedTests = new Set() // Tests to reload.

    let dirty = false
    watch((event, file) => {
      if (event == 'add') return
      if (event == 'change') {
        file = fs.realpathSync(file)
      }

      // Tests are reloaded after the unload phase.
      if (event == 'change' && ctx.files[file]) {
        changedTests.add(file)
      } else if (modules.has(file)) {
        unloadQueue.add(file)
      } else return

      if (dirty) return
      dirty = true

      // Short delay to play nice with event bursting.
      setTimeout(async () => {
        // Stop the runner.
        await tests.stop()

        // Print empty lines until the screen is blank.
        process.stdout.write('\033[2J')

        // Clear the scrollback.
        process.stdout.write('\u001b[H\u001b[2J\u001b[3J')

        // Unload changed/deleted modules.
        if (unloadQueue.size) {
          unloadQueue.forEach(file => {
            modules.unload(file)
            tests.unload(file)
          })
          unloadQueue.clear()
        }

        // Reload changed tests.
        let ok = true
        if (changedTests.size) {
          changedTests.forEach(file => {
            modules.unload(file)
            if (tests.load(file)) {
              changedTests.delete(file)
            } else ok = false
          })
        }

        // The next file change interrupts the runner.
        dirty = false

        // Start the runner.
        if (ok) startTests()
      }, 1000)
    })
  }

  // Force exit once finished.
  else {
    await running
    process.exit()
  }
})
