import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import freedom from '../ai/FORMNARO-MODELLIERFREIRAUM.json' with {type:'json'};
import {cadAIContext} from '../src/cad-ai-context.js';
import {validateAIResultChecks} from '../src/cad-ai-result-checks.js';
import {aiStrictnessDecision,aiModellingPolicy} from '../src/ai-model-strictness.js';
import {visualReviewInput} from '../src/cad-ai-visual-review.js';
import {aiFeedback} from '../src/ai-feedback.js';
const require=createRequire(import.meta.url);

test('Both standard MCP initial handshakes supply the shared policy before any model or descriptor request',async()=>{
 const initialized=await require('../backend/mistral-mcp.cjs').handle({jsonrpc:'2.0',method:'initialize',params:{protocolVersion:'2025-11-25'}});
 assert(initialized.instructions.includes(freedom.instructions));
 const python=spawnSync('python',[fileURLToPath(new URL('../scripts/offlinecad_ai.py',import.meta.url)),'--connection','nonexistent-connection-file','--mcp'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}})+'\n',encoding:'utf8',windowsHide:true});
 assert.equal(python.status,0,python.stderr);const reply=JSON.parse(python.stdout.trim());assert(reply.result.instructions.includes(freedom.instructions));
});

test('Shared default design policy reaches ordinary prompts, API agents, Vibe and the public MCP context',async()=>{
 assert.deepEqual(cadAIContext().designFreedom,freedom);
 for(const rules of [require('../backend/ai-working-rules.cjs').workingRules('cad'),require('../backend/ai-mcp-agent.cjs').SYSTEM,require('../backend/mistral-vibe.cjs').AGENT_INSTRUCTIONS])assert(rules.includes(freedom.instructions));
 assert.match(freedom.instructions,/door\/window widths, heights and positions/);
 assert.match(freedom.instructions,/NO dimensions at all/);assert.match(freedom.instructions,/checks:\[\]/);
 let system;
 const value=await require('../backend/ai-provider.cjs').generate({baseUrl:'https://api.mistral.ai/v1',model:'mistral-large-4',authMode:'mistral-vibe',protocol:'chat',rememberKey:false},'',{prompt:'Ein Häuschen 50x50, zwei Fenster und bewegliche Tür.',context:{designFreedom:freedom,modellingPolicy:aiModellingPolicy(100)},scene:{revision:'r'}},undefined,{mistralComplete:async args=>{system=args.system;return {text:JSON.stringify({revision:'r',commands:[],message:'Annahmen: Höhe 35, Fenster 10x12 mm.'})};}});
 assert(system.includes(freedom.instructions));assert(!system.includes('If the user requests a draft or explicitly permits estimates'));assert.match(value.message,/Annahmen/);
});

test('Partial dimension vectors allow only deliberate unspecified axes and retain all numeric constraints',()=>{
 const check={kind:'size',target:'$house',space:'edit',expected:[50,50,null]};assert.deepEqual(validateAIResultChecks([check]),[check]);
 for(const expected of [[null,null,null],[50,50,undefined],[50,50,'free'],[50,50,NaN],[50,0,null]])assert.throws(()=>validateAIResultChecks([{...check,expected}]));
 assert.throws(()=>validateAIResultChecks([{kind:'volume',target:'$house',expected:null}]));
 for(const strictness of [0,1,50,100]){
  const report={...check,actual:[50,50,35],passed:false};assert.equal(aiStrictnessDecision({checks:[report]},strictness).accepted,true);
 }
 assert.equal(aiStrictnessDecision({checks:[{...check,actual:[49,50,35],passed:false}]},100).accepted,false);
 assert.equal(aiStrictnessDecision({checks:[{...check,actual:null,passed:false}]},100).accepted,false);
 assert.equal(aiStrictnessDecision({checks:[{...check,actual:[50,50,NaN],passed:false}]},100).accepted,false);
 assert.deepEqual(aiFeedback({code:'AI_RESULT_MISMATCH',feedback:{checkIndex:1,checkKind:'size',expected:[50,50,null],actual:[49,50,35]}}).expected,[50,50,null]);
 assert.equal(aiFeedback({feedback:{checkIndex:1,checkKind:'volume',expected:[50,50,null]}}).expected,undefined);
});

test('Visual review receives the declared assumptions alongside the complete proposal',()=>{
 const request=visualReviewInput({images:[]},{revision:'r',commands:[],checks:freedom.partialSizeExample?[freedom.partialSizeExample]:[],message:'Annahmen: Wand 2 mm; Tür 14x25 mm, Scharnier links.'},{previewId:'p',revision:'r'},{images:[],views:[],scope:'preview'});
 assert.match(request.visualFeedback.proposal.message,/Tür 14x25/);assert.equal(request.visualFeedback.proposal.checks[0].expected[2],null);
});
