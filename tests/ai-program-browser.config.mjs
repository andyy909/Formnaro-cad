import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({base:'./',build:{outDir:'work/ai-program/browser-dist',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('./fixtures/ai-program-browser.html',import.meta.url))}}});
