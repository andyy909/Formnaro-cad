const { Module, registerHooks } = require('node:module');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const preloadPath = require.resolve('../../preload.cjs');
const desktopPath = require.resolve('../../backend/desktop-ai.cjs');
const targets = new Set([preloadPath, desktopPath].map(file => pathToFileURL(file).href));
const stubPath = join(__dirname, '.electron-test-module.cjs');
const stubUrl = pathToFileURL(stubPath).href;

function loadDesktopTestModules(electron) {
  const cached = [preloadPath, desktopPath, stubPath].map(file => [file, require.cache[file]]);
  const stub = new Module(stubPath);
  stub.exports = electron;
  stub.loaded = true;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'electron' && targets.has(context.parentURL)) {
        return { url: stubUrl, format: 'commonjs', shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
  });
  try {
    delete require.cache[preloadPath];
    delete require.cache[desktopPath];
    require.cache[stubPath] = stub;
    require(preloadPath);
    return require(desktopPath);
  } finally {
    hooks.deregister();
    for (const [file, previous] of cached) {
      if (previous) require.cache[file] = previous;
      else delete require.cache[file];
    }
  }
}

module.exports = { loadDesktopTestModules };
