export const meshColorsEnabled=node=>!!(node?.meshSource?.appearance?.multicolor??node?.meshSource?.node?.multicolor);
export function setMeshColors(node,value){
 if(node?.kind!=='mesh'||!node.meshSource||typeof value!=='boolean')throw Error('Eine Netzquelle für Quellenfarben auswählen.');
 node.meshSource={...node.meshSource,version:3,appearance:{multicolor:value}};
}
export function keepMeshAppearance(original,source){return original?.meshSource?.appearance?{...source,version:3,appearance:structuredClone(original.meshSource.appearance)}:source;}
