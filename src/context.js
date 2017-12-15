
const {getCallsite} = require('./utils')

// The top-level group.
let top = new Group('', null)

// The group being mutated.
let context = null

// Parents of the current context.
const stack = []

// The map of test files.
const files = Object.create(null)

function File(path) {
  this.path = path
  this.group = new Group('', top, this)
  top.tests.push(this.group)
}

function Group(id, parent, file) {
  this.id = id
  this.file = file || (parent ? getFile(parent) : null)
  this.parent = parent
  this.tests = []
}

// Find which file the given group is in.
function getFile(group) {
  while (group) {
    if (group.file) return group.file
    group = group.parent
  }
}

// Create a file if no context exists.
function getContext(i) {
  if (context) {
    return context
  } else {
    const path = getCallsite(i || 2).getFileName()
    const file = files[path] || (files[path] = new File(path))
    return file.group
  }
}

function setContext(group, createTests) {
  stack.push(context)
  context = group
  createTests()
  context = stack.pop()
}

//
// Exports
//

exports.files = files
Object.defineProperty(exports, 'top', {
  enumerable: true,
  get: () => top,
  set(context) {
    top = context
  }
})
exports.get = getContext
exports.set = setContext
exports.Group = Group
