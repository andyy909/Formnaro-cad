const string={type:'string'},name={type:'string',minLength:1,maxLength:200},alias={type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,63}$'},vec={type:'array',items:{type:'number'},minItems:3,maxItems:3},positive={...vec,items:{type:'number',exclusiveMinimum:0}},bool={type:'boolean'};
const choice=values=>({type:'string',enum:values});
export const TARGET_SCHEMA={oneOf:[{type:'string',minLength:1},{type:'object',additionalProperties:false,required:['rootId','path'],properties:{rootId:string,path:{type:'array',items:string,maxItems:12}}}]};
const targets={type:'array',items:TARGET_SCHEMA,minItems:2,maxItems:500},params={type:'object',description:'Native parameter keys and constraints are listed per shape in GET /v1/context.'},space=choice(['local','world','plane']),operation=choice(['union','intersection']);
const editable={name,size:positive,pos:vec,rot:vec,mirror:{...vec,items:{type:'number',enum:[-1,1]}},solid:bool,color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},segments:{type:'integer',minimum:3,maximum:512},params,text:{type:'string',minLength:1,maxLength:80}};
const rootTarget={oneOf:[{type:'string',minLength:1},{type:'object',additionalProperties:false,required:['rootId','path'],properties:{rootId:{type:'string',minLength:1},path:{type:'array',maxItems:0}}}]},faceIndex={type:'integer',minimum:1,maximum:20000},modelingVersion={const:1};
const sweepPath={oneOf:[{type:'object',additionalProperties:false,required:['kind','length'],properties:{kind:{const:'line'},length:{type:'number',minimum:.01,maximum:10000}}},{type:'object',additionalProperties:false,required:['kind','radius','angle'],properties:{kind:{const:'arc'},radius:{type:'number',minimum:.01,maximum:10000},angle:{type:'number',minimum:1,maximum:180}}}]};
const faceModeling=[{type:'object',additionalProperties:false,required:['kind','faceIndex','offset'],properties:{kind:{const:'face-offset'},version:modelingVersion,faceIndex,offset:{oneOf:[{type:'number',minimum:-1000,maximum:-.01},{type:'number',minimum:.01,maximum:1000}]}}},{type:'object',additionalProperties:false,required:['kind','faceIndices','thickness'],properties:{kind:{const:'shell'},version:modelingVersion,faceIndices:{type:'array',minItems:1,maxItems:8,uniqueItems:true,items:faceIndex},thickness:{type:'number',minimum:.01,maximum:1000}}}];
const profileModeling=[{type:'object',additionalProperties:false,required:['kind'],properties:{kind:{const:'loft'},version:modelingVersion}},{type:'object',additionalProperties:false,required:['kind','path'],properties:{kind:{const:'sweep'},version:modelingVersion,path:sweepPath}}];
// Native-only additions are appended by cadAIContext. The legacy mesh schema
// must not advertise body tools that its independent command engine cannot run.
export const CAD_MODELING_COMMAND_SCHEMAS=[
 {type:'object',additionalProperties:false,required:['op','target','operation'],properties:{op:{const:'modeling'},target:rootTarget,operation:{oneOf:faceModeling},as:alias}},
 {type:'object',additionalProperties:false,required:['op','target','operation'],properties:{op:{const:'editModeling'},target:rootTarget,operation:{oneOf:[...faceModeling,...profileModeling]},as:alias}},
 {type:'object',additionalProperties:false,required:['op','targets','kind'],properties:{op:{const:'profileModeling'},targets:{type:'array',minItems:1,maxItems:8,uniqueItems:true,items:rootTarget},kind:choice(['loft','sweep']),path:sweepPath,as:alias},oneOf:[{properties:{kind:{const:'loft'},targets:{minItems:2,maxItems:8}},not:{required:['path']}},{properties:{kind:{const:'sweep'},targets:{minItems:1,maxItems:1}},required:['path']}]}
];
const definitions={
 create:[['type'],{...editable,as:alias,type:string,parent:TARGET_SCHEMA,space}],
 update:[['target','set'],{target:TARGET_SCHEMA,set:{type:'object',additionalProperties:false,minProperties:1,properties:{...editable,suppressed:bool,hidden:bool,operation}}}],
 transform:[['target'],{target:TARGET_SCHEMA,translate:vec,position:vec,rotate:vec,scale:positive,space}],
 duplicate:[['target'],{target:TARGET_SCHEMA,as:alias,translate:vec,space}],
 delete:[['target'],{target:TARGET_SCHEMA}],
 group:[['targets'],{targets,as:alias,name,operation}],
 pattern:[['target','kind','count'],{target:TARGET_SCHEMA,kind:choice(['line','grid','circle']),count:{type:'integer',minimum:2,maximum:200},step:vec,rowStep:vec,columns:{type:'integer',minimum:1,maximum:200},radius:{type:'number',exclusiveMinimum:0,maximum:10000},angle:{type:'number',minimum:-360,maximum:360},startAngle:{type:'number'},center:vec,rotateCopies:bool,space,as:alias}],
 align:[['targets','axis','edge'],{targets,reference:TARGET_SCHEMA,axis:{type:'integer',enum:[0,1,2]},edge:choice(['min','center','max']),space}],
 drop:[['target'],{target:TARGET_SCHEMA,space}],
 layer:[['name'],{name,as:alias}],
 folder:[['name'],{name,as:alias,layer:string,parent:string}],
 assign:[['target'],{target:TARGET_SCHEMA,layer:string,folder:{type:['string','null']}}],
 workplane:[['origin','orientation'],{origin:vec,orientation:{type:'array',items:{type:'number'},minItems:4,maxItems:4},coordinateMode:choice(['plane','world'])}]
};
export const COMMAND_SCHEMA={type:'object',additionalProperties:false,required:['revision','commands'],properties:{revision:{type:'string',pattern:'^[0-9a-f]{16}$'},label:name,commands:{type:'array',minItems:1,maxItems:200,items:{oneOf:Object.entries(definitions).map(([op,[required,properties]])=>({type:'object',additionalProperties:false,required:['op',...required],properties:{op:{const:op},...properties}}))}}}};
