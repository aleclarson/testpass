
const globRegex = require('glob-regex')
const path = require('path')
const fs = require('fs')

// Files whose change events are ignored.
const blacklistRE = /^\.git(\/|$)/

// File contents split by line.
const cache = Object.create(null)

// Directories being watched for changes.
const watched = new Set

function isDir(path) {
  try {
    return fs.statSync(path).isDirectory()
  } catch(e) {}
  return false
}

function readFile(path) {
  return cache[path] ||
    (cache[path] = fs.readFileSync(path, 'utf8').split('\n'))
}

function watch(onChange) {
  if (!watched.size) {
    watched.add(process.cwd())
  }
  watched.forEach(dir => {
    fs.watch(dir, {recursive: true}, (event, file) => {
      if (blacklistRE.test(file)) {
        return
      }
      file = path.join(dir, file)
      if (event == 'rename') {
        event = fs.existsSync(file) ? 'add' : 'delete'
      }
      if (event != 'add') {
        delete cache[file]
      }
      onChange(event, file)
    })
  })
}

module.exports = {
  isDir,
  readFile,
  watch,
  watched,
}
