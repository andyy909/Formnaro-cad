import { registerHooks } from 'node:module';

const rendererSource = new URL('../../src/', import.meta.url).href;

export async function importRendererModule(url) {
  const hooks = registerHooks({
    load(url, context, nextLoad) {
      // These tests exercise renderer behavior without applying CSS in Node.
      if (url.startsWith(rendererSource) && new URL(url).pathname.endsWith('.css')) {
        return { format: 'module', source: '', shortCircuit: true };
      }
      return nextLoad(url, context);
    },
  });
  try {
    return await import(url);
  } finally {
    hooks.deregister();
  }
}

export function installTestDocument(document) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: document });
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, 'document', previous);
    } else {
      delete globalThis.document;
    }
  };
}
