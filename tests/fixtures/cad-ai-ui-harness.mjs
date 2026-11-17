import {registerHooks} from 'node:module';
import {importRendererModule,installTestDocument} from './renderer-test-support.mjs';

const uiURL=new URL('../../src/cad-ai-ui.js',import.meta.url).href;
const inputLimitsURL=new URL('../../backend/ai-input-limits.json',import.meta.url).href;
const substitutions=new Map([
  ['./cad-ai-chat.js','createCadAIChat'],
  ['./cad-ai-task-journal.js','createAITaskJournal'],
  ['./cad-ai-task-ui.js','mountAITaskUI'],
  ['./cad-ai-diagnostics.js','mountAIDiagnostics'],
  ['./cad-ai-agent.js','createAIAgentChat'],
]);

let onSend;
export function createCadAIChat(options){
  onSend=options.onSend;
  return {state:()=>({featureReferences:[]}),setBusy(){},setUsage(){},setProposal(){},status(){},reportActivity(){},open(){},dispose(){}};
}
export function createAITaskJournal(){
  return {begin:async()=>{},checkpoint:async()=>{},close:async()=>null,lastCheckpoint:()=>null};
}
export function mountAITaskUI(){
  return {requirements:prompt=>({purpose:'technical',objective:prompt,assumptions:[],checks:[],protectedTargets:[]}),setBusy(){},dispose(){}};
}
export const mountAIDiagnostics=()=>({dispose(){}});
export const createAIAgentChat=()=>({dispose(){}});

function element(tag){
  return {
    tag,children:[],dataset:{},classList:{toggle(){}},textContent:'',
    querySelector:()=>element('button'),querySelectorAll:()=>[],
    before(){},
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;},
  };
}

async function importChatWrapper(){
  const hooks=registerHooks({
    resolve(specifier,context,nextResolve){
      const name=context.parentURL===uiURL?substitutions.get(specifier):undefined;
      if(!name)return nextResolve(specifier,context);
      const stub=`export {${name}} from ${JSON.stringify(import.meta.url)};`;
      return {url:'data:text/javascript,'+encodeURIComponent(stub),shortCircuit:true};
    },
    load(url,context,nextLoad){
      // Vite accepts the renderer's JSON import without Node's import attribute.
      if(url===inputLimitsURL)return nextLoad(url,{...context,importAttributes:{type:'json'}});
      return nextLoad(url,context);
    },
  });
  try{return (await importRendererModule(uiURL)).createCadAIUI;}
  finally{hooks.deregister();}
}

export async function exerciseCadAIUI({desktop,...options},exercise){
  const create=await importChatWrapper();
  const result=element('result'),proposal=element('div');
  const restoreDocument=installTestDocument({
    createElement:element,querySelector:()=>null,
    getElementById:id=>id==='ai-result'?result:id==='ai-chat-proposal'?proposal:null,
  });
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  try{
    Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{offlinecadDesktop:desktop}});
    create({language:()=>'de',showPreview:()=>{},clearPreview:()=>{},...options});
    return await exercise({send:onSend,result});
  }finally{
    onSend=undefined;
    if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);
    else delete globalThis.window;
    restoreDocument();
  }
}
