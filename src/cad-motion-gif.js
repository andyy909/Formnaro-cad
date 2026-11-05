/** Small bounded GIF89a encoder with a fixed RGB332 palette. Clear codes keep
 * LZW at nine bits, avoiding an unbounded dictionary in the renderer. */
export function encodeMotionGif(frames,{width,height,delayMs=100}={}){
 if(!Array.isArray(frames)||!frames.length||frames.length>160||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>640||height>480||!Number.isFinite(delayMs)||delayMs<20||delayMs>10000)throw Error('GIF: höchstens 160 Bilder mit 640 × 480 Pixeln.');
 const bytes=new Uint8Array(frames.length*(Math.ceil(width*height*1.14)+200)+800);let offset=0;const byte=n=>{if(offset>=bytes.length)throw Error('GIF-Ausgabebudget überschritten.');bytes[offset++]=n&255;},word=n=>{byte(n);byte(n>>8);},text=s=>{for(const c of s)byte(c.charCodeAt(0));};
 text('GIF89a');word(width);word(height);byte(0xf7);byte(0);byte(0);
 for(let i=0;i<256;i++){byte(Math.round((i>>5)*255/7));byte(Math.round(((i>>2)&7)*255/7));byte(Math.round((i&3)*255/3));}
 byte(0x21);byte(0xff);byte(11);text('NETSCAPE2.0');byte(3);byte(1);word(0);byte(0);
 for(const rgba of frames){
  if(!(rgba instanceof Uint8ClampedArray)&&!(rgba instanceof Uint8Array)||rgba.length!==width*height*4)throw Error('GIF: unvollständiges Einzelbild.');
  byte(0x21);byte(0xf9);byte(4);byte(0);word(Math.max(2,Math.round(delayMs/10)));byte(0);byte(0);
  byte(0x2c);word(0);word(0);word(width);word(height);byte(0);byte(8);
  const packed=[];let buffer=0,bits=0;const code=n=>{buffer|=n<<bits;bits+=9;while(bits>=8){packed.push(buffer&255);buffer>>>=8;bits-=8;}};
  for(let i=0;i<width*height;i++){if(i%200===0)code(256);const k=i*4;code((rgba[k]>>5)<<5|(rgba[k+1]>>5)<<2|rgba[k+2]>>6);}code(257);if(bits)packed.push(buffer&255);
  for(let i=0;i<packed.length;i+=255){const length=Math.min(255,packed.length-i);byte(length);for(let k=0;k<length;k++)byte(packed[i+k]);}byte(0);
 }
 byte(0x3b);return bytes.slice(0,offset);
}
