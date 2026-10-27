import {surfacesReleaseSettings} from './surfaces-release-config.mjs';
Object.assign(process.env,surfacesReleaseSettings(process.argv.slice(2),process.env));
await import('./package-freecad-python.mjs');
