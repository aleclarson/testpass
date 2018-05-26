
const {formatError, toggleCallsites} = require('./utils')
const Runner = require('./runner')
const ctx = require('./context')

// The current test runner.
let runner = null

// Functions executed before the next run.
const nextRun = []

function startTests(options = {}) {
  if (runner) {
    throw Error('Already running')
  }

  if (nextRun.length) {
    const queue = nextRun.slice()
    nextRun.length = 0
    for (let i = 0; i < queue.length; i++) {
      if (queue[i]() === false) {
        return null
      }
    }
  }

  runner = new Runner(ctx.top, options)
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

async function stopTests() {
  if (runner) {
    runner.stop()
    await runner.promise
  }
}

// Returns false when the file throws an error.
function loadTests(file) {
  toggleCallsites(true)
  file.group = new ctx.Group('', ctx.top, file)
  file.header = null
  try {
    delete require.cache[file.path]
    require(file.path)
    return true
  } catch(error) {
    console.log('')
    console.log(formatError(error))
    file.group = null
    nextRun.push(() => {
      if (ctx.top) {
        return loadTests(file)
      }
    })
    return false
  } finally {
    toggleCallsites(false)
  }
}

function reloadTests(path) {
  const file = ctx.files[path]
  if (!file) return false

  const {top} = ctx
  if (top && file.group) {
    const index = top.tests.indexOf(file.group)

    file.group = null
    nextRun.push(() => {
      const {top} = ctx
      if (top) {
        if (loadTests(file)) {
          // Replace the old test group.
          top.tests.splice(index, 1, file.group)
        } else {
          return false
        }
      }
    })
  }
  return true
}

function reloadAllTests() {
  let {top} = ctx
  if (top) {
    const order = top.tests
    ctx.top = null
    nextRun.push(() => {
      ctx.top = top = new ctx.Group('', null)
      for (const path in ctx.files) {
        const file = ctx.files[path]
        const index = order.indexOf(file.group)
        if (loadTests(file)) {
          top.tests[index] = file.group
        } else {
          return false
        }
      }
    })
  }
}

function removeTests(path) {
  const file = ctx.files[path]
  if (!file) return false

  if (ctx.top) {
    const {tests} = ctx.top
    tests.splice(tests.indexOf(file.group), 1)
    delete ctx.files[path]
  }
  return true
}

module.exports = {
  stop: stopTests,
  start: startTests,
  reload: reloadTests,
  reloadAll: reloadAllTests,
  remove: removeTests,
}
