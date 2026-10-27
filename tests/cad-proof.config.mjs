import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({base:'./',build:{outDir:'work/cad-v011/browser-dist',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('./fixtures/cad-worker-browser.html',import.meta.url))}}});
