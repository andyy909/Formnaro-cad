// Compatibility entry: use the current version and acceptance pipeline.
process.argv.splice(2, 0, 'test');
await import('./current-release.mjs');
