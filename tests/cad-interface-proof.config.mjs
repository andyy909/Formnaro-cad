import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const fixture=fileURLToPath(new URL('../work/cad-v011/ui-fixture.html',import.meta.url));
fs.mkdirSync(fileURLToPath(new URL('../work/cad-v011',import.meta.url)),{recursive:true});
const authored=fs.readFileSync(fileURLToPath(new URL('../index.html',import.meta.url)),'utf8');
fs.writeFileSync(fixture,authored.replace(/<script type="module" src="[^"]+"><\/script>/,'<script type="module" src="/tests/fixtures/cad-interface-browser.js"></script>'));
export default defineConfig({base:'./',build:{outDir:'work/cad-v011/ui-dist',emptyOutDir:true,rollupOptions:{input:fixture}}});
