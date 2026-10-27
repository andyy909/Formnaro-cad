import {freeCADDocumentReleaseSettings} from './freecad-document-release-config.mjs';
Object.assign(process.env,freeCADDocumentReleaseSettings(process.argv.slice(2),process.env));
await import('./package-freecad-python.mjs');
