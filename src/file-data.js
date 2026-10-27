export const PROJECT_BYTES=50*1024*1024,LIBRARY_BYTES=4*1024*1024;
// Save and import must agree on UTF-8 byte limits, including Unicode names.
export function serializeFile(value,limit,label){
 const json=JSON.stringify(value);
 if(typeof json!=='string'||new TextEncoder().encode(json).length>limit)throw Error(label+' ist zu groß. Anzahl oder Qualität verringern (maximal '+limit/1024/1024+' MB).');
 return json;
}
