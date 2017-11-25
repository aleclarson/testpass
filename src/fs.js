
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
  fs.readdirSync(dir).forEach(name => {
    const file = path.join(dir, name)
    if (typeof pattern == 'string') {
      if (name.endsWith(pattern)) {
        return paths.push(file)
      }
    } else if (pattern.test(file)) {
      return paths.push(file)
    }
    if (name != 'node_modules') {
      try {
        crawl(file, ext, paths)
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
    fs.watch(dir, (event, file) => {
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
