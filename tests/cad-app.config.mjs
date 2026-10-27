import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
export default defineConfig({base:'./',plugins:[{name:'cad-app-proof-entry',transformIndexHtml:{order:'pre',handler:html=>html.replace('/src/main.js','/src/cad-main.js')}}],build:{outDir:'work/cad-v011/native-app',emptyOutDir:true}});
