export const CAD_DRILL_SCALAR_FIELDS=Object.freeze([
 {field:'drill.diameter',label:'Bohrung Ø',unit:'mm'},
 {field:'drill.depth',label:'Feste Bohrtiefe',unit:'mm'},
 {field:'drill.headDiameter',label:'Kopf / Senkung Ø',unit:'mm'},
 {field:'drill.headDepth',label:'Kopftiefe',unit:'mm'},
 {field:'drill.angle',label:'Senkwinkel',unit:'°'},
 {field:'drill.gap',label:'Spiel je Seite',unit:'mm'}
]);
export const isCadDrillScalarField=field=>CAD_DRILL_SCALAR_FIELDS.some(item=>item.field===field);
