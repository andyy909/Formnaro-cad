// Palette data is independent of both CAD construction and legacy geometry.
const definitions=[
  ['box','Quader','#ed6a48',[20,20,20]],['cylinder','Zylinder','#ebac3c',[20,20,20]],
  ['sphere','Kugel','#418db6',[20,20,20]],['cone','Kegel','#79ae72',[20,20,20]],
  ['pyramid','Pyramide','#976ec3',[20,20,20]],['roof','Dach','#c97c56',[20,20,20]],
  ['wedge','Keil','#78aeb7',[20,20,20]],['hexagon','Sechseck','#ba83bd',[20,20,20]],
  ['triangle','Dreieck','#eaa13c',[20,20,20]],['tube','Rohr','#7c9ac5',[20,20,20]],
  ['torus','Ring','#e9819b',[25,25,8]],['capsule','Kapsel','#639f89',[35,20,10]],
  ['star','Stern','#edb146',[25,25,5]],['heart','Herz','#de7785',[25,25,5]],
  ['gear','Zahnrad','#8b9cae',[30,30,6]],['text','Text','#448fba',[40,14,4]],
  ['roundbox','Rundquader','#dc866b',[25,25,10]],['halfSphere','Halbkugel','#9bb36a',[25,25,12.5]],
  ['thread','Gewinde','#7ca6a2',[8,8,16]],['nut','Gewindemutter','#a591ba',[15,13,6]],
  ['countersink','Senkbohrung','#839ba8',[8.4,8.4,10]],['shellbox','Gehäuse','#69a6a4',[60,40,20]],
  ['polygon','Polygon','#b887ba',[20,20,10]],
];
export const CAD_SHAPES=Object.freeze(definitions.map(([type,name,color,size])=>Object.freeze({type,name,color,defaultSize:Object.freeze([...size])})));
