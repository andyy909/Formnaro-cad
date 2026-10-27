// Compatibility entry: current packaging generates its own acceptance evidence.
process.argv.splice(2, 0, 'package');
await import('./current-release.mjs');
