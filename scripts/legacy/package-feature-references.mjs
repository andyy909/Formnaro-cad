import {featureReleaseSettings} from './feature-release-config.mjs';
Object.assign(process.env,featureReleaseSettings(process.argv.slice(2),process.env));
await import('./package-freecad-python.mjs');
