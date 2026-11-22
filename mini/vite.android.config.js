import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: {outDir: 'dist-android', emptyOutDir: true, target: 'chrome120'},
  worker: {format: 'es'},
});
