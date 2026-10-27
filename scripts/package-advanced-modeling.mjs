import {advancedModelingReleaseSettings} from './advanced-modeling-release-config.mjs';
Object.assign(process.env,advancedModelingReleaseSettings(process.argv.slice(2),process.env));
await import('./package-freecad-python.mjs');
