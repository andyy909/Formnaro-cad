import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({base:'./',build:{outDir:(process.env.FORMNARO_PYTHON_BROWSER_WORK??'work/python-api')+'/browser-dist',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('./fixtures/python-browser.html',import.meta.url))}}});
