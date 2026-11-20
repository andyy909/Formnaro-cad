const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { execFile } = require('node:child_process');
const extract = require('node:util').promisify(execFile);
const repository = 'OrcaSlicer/OrcaSlicer';
const versionPattern = /^v\d+\.\d+\.\d+$/;

const versionCache = new Map();
async function systemVersion(exe) {
  if (!exe || process.platform !== 'win32') return null;
  if (versionCache.has(exe)) return versionCache.get(exe);
  const reg = path.join(process.env.SystemRoot, 'System32', 'reg.exe');
  for (const hive of ['HKLM','HKCU']) {
    for (const view of ['32','64']) {
      try {
        const {stdout} = await extract(reg, ['query',hive + '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OrcaSlicer','/reg:'+view], {windowsHide:true,timeout:3000});
        const icon = stdout.match(/DisplayIcon\s+REG_SZ\s+([^\r\n]+)/i)?.[1].trim().replace(/,\d+$/, '').replace(/^"|"$/g,'');
        const version = stdout.match(/DisplayVersion\s+REG_SZ\s+(\d+(?:\.\d+)+)/i)?.[1];
        if (icon?.toLowerCase() === exe.toLowerCase() && version) {
          versionCache.set(exe, version);
          return version;
        }
      } catch { /* Other install scope or registry view. */ }
    }
  }
  versionCache.set(exe,null);
  return null;
}

async function latest(signal) {
  const response = await fetch('https://api.github.com/repos/' + repository + '/releases/latest', {
    headers: { 'User-Agent': 'Formnaro-OrcaSlicer', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  if (!response.ok) throw Error('Orca-Release konnte nicht geladen werden (GitHub ' + response.status + ').');
  const release = await response.json();
  const version = release.tag_name;
  if (!versionPattern.test(version) || release.draft || release.prerelease) throw Error('Kein stabiles Orca-Release gefunden.');
  const arch = { x64: 'x64', arm64: 'arm64' }[process.arch];
  const name = 'OrcaSlicer_Windows_' + version.toUpperCase() + '_' + arch + '_portable.zip';
  const asset = release.assets?.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (!arch || !asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size) || asset.size <= 0 ||
      asset.browser_download_url !== 'https://github.com/' + repository + '/releases/download/' + version + '/' + asset.name)
    throw Error('Kein passendes Windows-Archiv mit SHA-256 für diesen PC.');
  return { version, url: asset.browser_download_url, digest: asset.digest.slice(7), size: asset.size };
}

async function install(root, release, signal, report) {
  await fs.mkdir(root, { recursive: true });
  const destination = path.join(root, release.version);
  const receipt = '.formnaro-release.json';
  try {
    const prior = JSON.parse(await fs.readFile(path.join(destination, receipt), 'utf8'));
    if (prior.digest === release.digest && prior.version === release.version) {
      await fs.access(path.join(destination, 'orca-slicer.exe'));
      return destination;
    }
  } catch { /* First installation. Existing unrelated directories are preserved. */ }
  const temp = await fs.mkdtemp(path.join(root, '.installation-'));
  const archive = path.join(temp, 'release.zip');
  try {
    const download = await fetch(release.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(900000)]) });
    if (!download.ok) throw Error('Download fehlgeschlagen (GitHub ' + download.status + ').');
    let bytes = 0;
    const hash = createHash('sha256');
    const verify = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > release.size) return callback(Error('Archiv überschreitet die angegebene Downloadgröße.'));
      hash.update(chunk);
      report('Download ' + Math.floor(100 * bytes / release.size) + ' %');
      callback(null, chunk);
    } });
    await pipeline(download.body, verify, createWriteStream(archive, { flags: 'wx' }), { signal });
    if (bytes !== release.size || hash.digest('hex') !== release.digest) throw Error('Die Prüfsumme des Orca-Downloads stimmt nicht.');
    report('OrcaSlicer wird entpackt …');
    const unpacked = path.join(temp, 'programm');
    await fs.mkdir(unpacked);
    await extract(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', archive, '-C', unpacked],
      { windowsHide: true, signal, timeout: 300000 });
    let folder = unpacked;
    const children = await fs.readdir(folder, { withFileTypes: true });
    if (children.length === 1 && children[0].isDirectory()) folder = path.join(folder, children[0].name);
    for (const item of ['orca-slicer.exe','OrcaSlicer.dll','resources/profiles']) await fs.access(path.join(folder,item));
    signal.throwIfAborted();
    await fs.writeFile(path.join(folder, receipt), JSON.stringify(release), {flag:'wx'});
    await fs.rename(folder, destination);
    return destination;
  } finally {
    if (path.dirname(temp) === root) await fs.rm(temp, { recursive: true, force: true });
  }
}

function isNewer(candidate, current) {
  if (!current) return true;
  const old = current.slice(1).split('.').map(Number);
  const next = candidate.slice(1).split('.').map(Number);
  const index = next.findIndex((number, i) => number !== old[i]);
  return index >= 0 && next[index] > old[index];
}

module.exports = { latest, install, versionPattern, systemVersion, isNewer };

