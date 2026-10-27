import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import opentype from 'opentype.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CAD_FONTS,CAD_FONT_KEY,createCadFontLibrary} from '../src/cad-fonts.js';
import {cadFontForText,cadFontInfo,parseCadFont} from '../src/cad-font-outline.js';
import {nativeRecipeForInput} from '../src/cad-form-runtime.js';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {buildCadContours,cadRecipeVolume} from '../src/cad-recipes.js';
import {cadContourSignedArea,originalFontSubpaths} from '../src/cad-original-contours.js';
const sources=JSON.parse(fs.readFileSync('licenses/fonts/sources.json','utf8'));
test('Every bundled free font is the original pinned OFL font with its original license and usable outline',async()=>{
 assert.equal(CAD_FONTS.length,64);for(const f of sources.fonts){const bytes=fs.readFileSync(f.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);assert.equal(createHash('sha256').update(fs.readFileSync(f.license)).digest('hex'),f.licenseSha256);assert.ok((await cadFontForText(f.id,'A')).glyphs.A.o.length>0);}
});
test('TTF and CFF OTF retain original quadratic/cubic contours and reject invalid files or absent glyphs',async()=>{
 const file=sources.fonts.find(f=>f.id==='free-lato'),base64=fs.readFileSync(file.file).toString('base64'),info=await cadFontInfo(base64),font=parseCadFont(base64),data=await cadFontForText(info.id,'ÄÖÜß ABO8',[info]);
 assert.match(info.id,/^custom-[a-f0-9]{64}$/);assert.ok(data.glyphs.Ä.o);const glyph=font.charToGlyph('O').path.commands.find(c=>c.type==='Q'),paths=originalFontSubpaths(data,'O',font.unitsPerEm)[0].subpaths.flat(),q=paths.find(c=>c.kind==='bezier'&&c.points[1][0]===glyph.x1&&c.points[1][1]===glyph.y1);assert.ok(q);assert.deepEqual(q.points.at(-1),[glyph.x,glyph.y]);
 await assert.rejects(cadFontForText('free-lato','\u{10ffff}'),/Zeichen/);assert.throws(()=>parseCadFont(Buffer.from('fake TTF').toString('base64')),/unvollständig/);assert.throws(()=>parseCadFont('https://example.com/font.ttf'),/Ungültige/);
});
test('Font library persistence is independent of the model and failed writes retain the prior library',async()=>{
 let stored=null,fail=false;const storage={getItem:()=>stored,setItem:(key,value)=>{assert.equal(key,CAD_FONT_KEY);if(fail)throw Error('Disk full');stored=value;}},library=createCadFontLibrary(storage),font=await cadFontInfo(fs.readFileSync(sources.fonts[0].file).toString('base64'));
 library.add(font);library.add(font);assert.equal(library.resources().length,1);assert.equal(createCadFontLibrary(storage).resources()[0].id,font.id);fail=true;assert.throws(()=>library.remove(font.id),/Disk full/);assert.equal(library.resources().length,1);fail=false;library.remove(font.id);assert.equal(library.resources().length,0);
});
test('A real generated CFF OTF imports by its family name and preserves original cubic controls',async()=>{
 const path=new opentype.Path();path.moveTo(0,0);path.curveTo(0,500,500,500,500,0);path.lineTo(0,0);path.close();const font=new opentype.Font({familyName:'Formnaro CFF Test',styleName:'Regular',unitsPerEm:1000,ascender:800,descender:-200,glyphs:[new opentype.Glyph({name:'.notdef',advanceWidth:600,path:new opentype.Path()}),new opentype.Glyph({name:'A',unicode:65,advanceWidth:600,path})]}),base64=Buffer.from(font.toArrayBuffer()).toString('base64'),info=await cadFontInfo(base64),data=await cadFontForText(info.id,'A',[info]);assert.equal(info.name,'Formnaro CFF Test');assert.ok(data.glyphs.A.o.includes('b 500 0 0 500 500 500'));assert.equal(parseCadFont(base64).outlinesFormat,'cff');
});
test('Every new bundled face produces native CAD preserving its analytic original contours',async(t)=>{
 for(const f of sources.fonts){const child=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/cad-font-native.mjs',import.meta.url)),f.id],{encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(child.status,0,f.id+' '+child.stderr);t.diagnostic(f.name);}
});
