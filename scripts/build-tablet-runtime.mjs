import {copyFileSync, mkdirSync, readdirSync, readFileSync} from 'node:fs';
import {findPackageJSON} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {rolldown} from 'rolldown';

const [stage] = process.argv.slice(2);
if (!stage) throw Error('Tablet runtime stage path required.');

for (const [source, output] of [
  ['../src/tablet-project-validator.js', 'tablet-project-validator.cjs'],
  ['../backend/tablet-certificate.cjs', 'tablet-certificate.cjs'],
]) {
  const input = fileURLToPath(new URL(source, import.meta.url));
  const bundle = await rolldown({input, platform:'node'});
  try {
    await bundle.write({file:join(stage, 'backend', output), format:'cjs', codeSplitting:false});
  } finally {
    await bundle.close();
  }
}

// The certificate bundle includes these npm runtime modules. Preserve their notices.
const copied = new Set();
function copyNotices(name, from) {
  const file = findPackageJSON(name, from);
  if (!file) throw Error(`Missing tablet runtime package: ${name}`);
  if (copied.has(file)) return;
  copied.add(file);
  const metadata = JSON.parse(readFileSync(file, 'utf8'));
  const folder = dirname(file);
  const notices = readdirSync(folder).filter(entry => /^(license|copying|notice|copyright)/i.test(entry));
  if (!notices.length) throw Error(`Missing license notice for ${name}`);
  const output = join(stage, 'licenses', 'tablet-tls', `${name}@${metadata.version}`);
  mkdirSync(output, {recursive:true});
  for (const notice of notices) copyFileSync(join(folder, notice), join(output, notice));
  for (const dependency of Object.keys(metadata.dependencies ?? {})) {
    copyNotices(dependency, pathToFileURL(file));
  }
}
copyNotices('selfsigned', new URL('../package.json', import.meta.url));
