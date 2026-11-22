const fs = require('node:fs');
const path = require('node:path');

function writeEmptyBenchmarkManifests(source) {
  for (const suite of ['benchmark-core-v1.json', 'benchmark-advanced-v2.json', 'benchmark-guided-v1.json']) {
    fs.writeFileSync(path.join(source, 'ai', suite), JSON.stringify({ dependencies: [] }));
  }
}

module.exports = { writeEmptyBenchmarkManifests };
