import opentype from 'opentype.js';
import regular from './font.json' with {type:'json'};
import bold from './fonts/helvetiker_bold.typeface.json' with {type:'json'};
import serif from './fonts/optimer_regular.typeface.json' with {type:'json'};
import {FREE_FONT_LOADERS} from './fonts/free-loaders.js';
import {cadFontBytes} from './cad-fonts.js';
const legacy={regular,bold,serif},cache=new Map();
export function parseCadFont(base64){
  const bytes=cadFontBytes(base64);if(bytes.length<12)throw Error('TTF-/OTF-Schriftdatei unvollständig.');const view=new DataView(bytes.buffer),signature=view.getUint32(0),count=view.getUint16(4);
  if(![0x00010000,0x4f54544f,0x74727565].includes(signature)||!count||count>100||12+count*16>bytes.length)throw Error('Nur gültige TTF-/OTF-Schriften mit Vektorkonturen werden unterstützt.');
  for(let i=0;i<count;i++){const offset=view.getUint32(12+i*16+8),length=view.getUint32(12+i*16+12);if(offset>bytes.length||length>bytes.length-offset)throw Error('Schrifttabelle liegt außerhalb der Datei.');}
  let font;try{font=opentype.parse(bytes.buffer);}catch{throw Error('Die TTF-/OTF-Schrift konnte nicht gelesen werden.');}
  if(!Number.isFinite(font.unitsPerEm)||font.unitsPerEm<=0||font.numGlyphs>65535||!font.tables.cmap?.glyphIndexMap)throw Error('Schrift besitzt keine unterstützten Zeichenkonturen.');return font;
}
const localized=value=>value?.en||Object.values(value||{}).find(v=>typeof v==='string')||'';
export async function cadFontInfo(base64){const font=parseCadFont(base64),bytes=cadFontBytes(base64),digest=await crypto.subtle.digest('SHA-256',bytes);const id='custom-'+[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''),family=font.getEnglishName('fontFamily')||localized(font.names.windows?.fontFamily)||localized(font.names.macintosh?.fontFamily),style=font.getEnglishName('fontSubfamily');return {id,name:(family+(style&&!/^(regular|normal)$/i.test(style)?' '+style:'')).trim().slice(0,200)||'Eigene Schrift',base64};}
export async function cadFontSource(id,custom=[]){
  if(Object.hasOwn(legacy,id))return {legacy:legacy[id]};
  let data;if(Object.hasOwn(FREE_FONT_LOADERS,id))data=(await FREE_FONT_LOADERS[id]()).default;else data=custom.find(f=>f.id===id);
  if(!data)throw Error('Diese Schrift ist nicht installiert. Bitte die TTF/OTF importieren oder eine andere Schrift wählen.');return data;
}
export async function cadFontForText(id,text,custom=[]){
  const source=await cadFontSource(id,custom);if(source.legacy)return source.legacy;
  let font=cache.get(source.base64);if(font){cache.delete(source.base64);cache.set(source.base64,font);}else{font=parseCadFont(source.base64);cache.set(source.base64,font);while(cache.size>4)cache.delete(cache.keys().next().value);}
  const glyphs={},kerning={},chars=[...new Set(Array.from(text).filter(c=>c!=='\n'))];let total=0;
  for(const char of chars){const index=font.charToGlyphIndex(char);if(!index&&char!=='\u0000')throw Error(`Die Schrift enthält das Zeichen „${char}“ nicht.`);const glyph=font.glyphs.get(index),tokens=[];let current,start;if(!Number.isFinite(glyph.advanceWidth))throw Error('Schrift besitzt ungültige Zeichenabstände.');
    for(const c of glyph.path.commands){if(++total>100000)throw Error('Textkonturen sind zu komplex.');const coords=Object.entries(c).filter(([k])=>k!=='type').map(([,v])=>v);if(coords.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))throw Error('Schrift besitzt ungültige Konturen.');
      // TTF sources contain redundant zero-length lines between exact Bézier
      // spans. Drop only constant segments in original font units, never small
      // positive edges or curved loops; no outline approximation is introduced.
      if(c.type==='M'){tokens.push('m',c.x,c.y);current=start=[c.x,c.y];}
      else if(['L','Q','C'].includes(c.type)){const points=[[c.x,c.y],...(c.type==='L'?[]:[[c.x1,c.y1]]),...(c.type==='C'?[[c.x2,c.y2]]:[])];if(!current)throw Error('Schriftkontur beginnt nicht mit einem Punkt.');if(!points.every(p=>p[0]===current[0]&&p[1]===current[1])){if(c.type==='L')tokens.push('l',c.x,c.y);else if(c.type==='Q')tokens.push('q',c.x,c.y,c.x1,c.y1);else tokens.push('b',c.x,c.y,c.x1,c.y1,c.x2,c.y2);}current=[c.x,c.y];}
      else if(c.type==='Z'){tokens.push('z');current=start;}else throw Error('Nicht unterstützte originale Schriftkontur.');}
    glyphs[char]={ha:glyph.advanceWidth,o:tokens.join(' ')};
  }
  const characters=Array.from(text);for(let i=1;i<characters.length;i++){const a=characters[i-1],b=characters[i];if(a==='\n'||b==='\n')continue;const amount=font.getKerningValue(font.charToGlyph(a),font.charToGlyph(b));if(Number.isFinite(amount)&&amount)(kerning[a]??={})[b]=amount;}
  return {glyphs,kerning,strictGlyphs:true,resolution:font.unitsPerEm,boundingBox:{yMin:font.descender,yMax:font.ascender},underlineThickness:font.tables.post?.underlineThickness||0};
}
