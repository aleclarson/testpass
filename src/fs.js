
const globRegex = require('glob-regex')
const path = require('path')
const fs = require('fs')

// File contents split by line.
const cache = Object.create(null)

// Directories being watched for changes.
const watched = new Set

function readFile(path) {
  return cache[path] ||
    (cache[path] = fs.readFileSync(path, 'utf8').split('\n'))
}

function crawl(dir, pattern, paths) {
  const matcher = matchFiles(pattern)
  fs.readdirSync(dir).forEach(name => {
    const file = path.join(dir, name)
    if (matcher(file, name)) {
      paths.push(file)
    }
    // Ignore 'node_modules' directories.
    else if (name != 'node_modules') {
      try {
        crawl(file, matcher, paths)
      } catch(e) {}
    }
  })
  return paths
}

function watch(onChange) {
  if (!watched.size) {
    watched.add(process.cwd())
  }
  watched.forEach(dir => {
    fs.watch(dir, {recursive: true}, (event, file) => {
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
  readFile,
  crawl,
  watch,
  watched,
}

//
// Internal
//

function matchFiles(pattern) {
  if (typeof pattern == 'function') {
    return pattern
  }
  if (typeof pattern == 'string') {
    if (pattern.indexOf('*') >= 0) {
      pattern = globRegex(pattern)
    } else {
      return (file) => file.endsWith(pattern)
    }
  }
  if (pattern instanceof RegExp) {
    return (file) => pattern.test(file)
  }
  throw TypeError('Must provide a string, RegExp, or function')
}
