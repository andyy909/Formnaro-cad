import {aiTaskReleaseSettings} from './ai-task-release-config.mjs';
Object.assign(process.env,aiTaskReleaseSettings(process.argv.slice(2),process.env));
await import('./package-freecad-python.mjs');
