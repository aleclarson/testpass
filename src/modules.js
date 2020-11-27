
const Module = require('module')
const path = require('path')
const fs = require('fs')

const ctx = require('./context')

const nodeModulesRE = /\/node_modules\//

// Keys are filenames of modules used by any loaded tests in/directly.
// Each value is a set of direct parent modules.
const loaded = Object.create(null)

// Override the module loader of NodeJS core, so we can track
// the parent modules of any module in/directly required by any
// of the loaded test files. Then we can properly reload any
// modules that cache a recently changed module.
const loadModule = Module._load
Module._load = function(request, parent, isMain) {
  let file = Module._resolveFilename(request, parent, isMain)

  // Ignore built-in modules
  if (path.isAbsolute(file)) {
    file = fs.realpathSync(file)

    // Ignore "node_modules" paths
    if (!nodeModulesRE.test(file)) {
      const parents = loaded[file]
      if (parents) {
        parents.add(parent)
      } else if (loaded[parent.filename] || ctx.files[parent.filename]) {
        loaded[file] = new Set([ parent ])
      }
    }
  }

  // Loading the module comes last to ensure parents exist
  // in `loaded` before their children are loaded.
  return loadModule(file, parent, isMain)
}

const modules = exports

modules.has = function(file) {
  return loaded[file] != null
}

// Unload a module and its parents.
modules.unload = function(file, onUnload) {
  const module = require.cache[file]
  if (module) {
    const visited = new Set()
    ;(function unload(module) {
      if (!visited.has(module)) {
        visited.add(module)
        deleteParent(module)

        const file = module.filename
        delete require.cache[file]
        if (onUnload) onUnload(file)

        // Continue up the parent chain until a test file is reached.
        const parents = loaded[file]
        if (parents) parents.forEach(unload)
      }
    })(module)
  }
}

function deleteParent(parent) {
  parent.children.forEach(child => {
    const parents = loaded[child.filename]
    if (parents) {
      parents.delete(parent)
      if (parents.size == 0) {
        delete loaded[child.filename]
      }
    }
  })
}
