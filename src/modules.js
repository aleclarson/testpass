// TODO: What if a test stops using a module?
// TODO: Detect when a test file is deleted.

const Module = require('module')

const tests = require('./tests')
const ctx = require('./context')

// Keys are filenames of modules used by any loaded tests in/directly.
// Each value is a set of direct parent modules.
const parentTree = Object.create(null)

// Override the module loader of NodeJS core, so we can track
// the parent modules of any module in/directly required by any
// of the loaded test files. Then we can properly reload any
// modules that cache a recently changed module.
const loadModule = Module._load
Module._load = function(request, parent, isMain) {
  const filename = Module._resolveFilename(request, parent, isMain)
  // This ignores node_modules imports within any relative files.
  if (request[0] == '.') {
    const parents = parentTree[filename]
    // Parent must be a test file or used by one in/directly.
    if (parents || parentTree[parent.filename] || ctx.files[parent.filename]) {
      if (parents) {
        parents.add(parent)
      } else {
        parentTree[filename] = new Set([ parent ])
      }
    }
  }
  // Loading the module comes last to ensure parents exist
  // in the `parentTree` before their children are loaded.
  return loadModule(filename, parent, isMain)
}

// Returns false if module is not used by any tests.
exports.reloadModule = function(filename) {
  const module = Module._cache[filename]
  if (module) {
    const parents = parentTree[filename]
    if (parents) {
      delete Module._cache[filename]
      removeFromChildren(module)
      reloadModules(parents)
    }
    return true
  }
  return false
}

// Remove the given module from each child's parent set.
function removeFromChildren(module) {
  module.children.forEach(child => {
    const parents = parentTree[child.filename]
    if (parents) parents.delete(module)
  })
}

// Reload an array/set of modules.
function reloadModules(modules) {
  modules.forEach(module => {
    delete Module._cache[module.filename]
    removeFromChildren(module)

    const parents = parentTree[module.filename]
    if (parents) {
      reloadModules(parents)
    } else {
      tests.reload(module.filename)
    }
  })
}
