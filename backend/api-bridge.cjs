const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const routes={'POST /v1/ui':'ui','POST /v1/assembly':'assembly','GET /v1/context':'context','POST /v1/context':'context','GET /v1/command_info':'command_info','POST /v1/command_info':'command_info','GET /v1/scene':'scene','POST /v1/scene':'scene','GET /v1/project':'project','GET /v1/screenshot':'screenshot','POST /v1/preview':'preview','POST /v1/analysis':'analysis','POST /v1/discard':'discard','POST /v1/apply':'apply','POST /v1/export':'export','POST /v1/save':'save','GET /v1/status':'status','POST /v1/status':'status','POST /v1/cancel':'cancel','POST /v1/preview/start':'preview_start','POST /v1/preview/result':'preview_result'};
function fail(message,status=400){return Object.assign(new Error(message),{status});}
async function startBridge({rpc,directory,port=0}){const token=crypto.randomBytes(32).toString('hex'),descriptorPath=path.join(directory,'ai-bridge.json');const jobs=require('./automation-jobs.cjs').createAutomationJobs({rpc});
 const server=http.createServer(async(req,res)=>{const cancellation=new AbortController(),abort=()=>{if(!res.writableFinished)cancellation.abort(Object.assign(Error('CAD client disconnected.'),{name:'AbortError',code:'ABORTED'}));};req.once('aborted',abort);res.once('close',abort);const send=(status,value)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};try{
  if(req.headers.origin!==undefined)throw fail('Browser origins are not allowed.',403);
  const supplied=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from('Bearer '+token);if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))throw fail('Unauthorized.',401);
  if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||''))throw fail('Invalid host.',403);
  const method=routes[req.method+' '+req.url];if(!method)throw fail('Unknown endpoint.',404);
  let body={},size=0;if(req.method==='POST'){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail('JSON content type required.',415);const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw fail('Command request exceeds 2 MB.',413);chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('Invalid JSON.');}}
  cancellation.signal.throwIfAborted();const value=await jobs.request(method,body,{signal:cancellation.signal});send(200,method==='context'?{...value,workingContext:require('./ai-working-rules.cjs').sharedAgentContext()}:method==='ui'&&body.action==='state'?{...value,workingContext:require('./ai-working-rules.cjs').sharedAgentContext('practice')}:value);
 }catch(e){const code=typeof e.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(e.code)?e.code:undefined;send(e.status||(code==='STALE_REVISION'||/STALE_REVISION/.test(e.message)?409:400),{error:e.message,...(code?{code}:{}),...(e.feedback?{feedback:e.feedback}:{})});}finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}});
 server.requestTimeout=30000;server.headersTimeout=10000;
 // Some hosts allocate ephemeral ports below 49152, including Fetch-blocked
 // ports such as 6000/10080. The default bridge must work with Fetch clients.
 // Keep explicit caller ports; auto-select within the dynamic/private range
 // and retry collisions or Windows reserved ranges without changing the OS.
 try{
  for(let attempt=0;;attempt++){
   const candidate=port===0?crypto.randomInt(49152,65536):port;
   try{
    await new Promise((resolve,reject)=>{
     const failed=error=>{server.removeListener('listening',ready);reject(error);};
     const ready=()=>{server.removeListener('error',failed);resolve();};
     server.once('error',failed);server.once('listening',ready);server.listen(candidate,'127.0.0.1');
    });
    break;
   }catch(error){if(port!==0||attempt>=15||!['EADDRINUSE','EACCES'].includes(error.code))throw error;}
  }
 }catch(error){jobs.close();throw error;}
 const descriptor={application:'Formnaro',apiVersion:1,url:'http://127.0.0.1:'+server.address().port,token,pid:process.pid,started:new Date().toISOString()};try{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(descriptorPath,JSON.stringify(descriptor,null,2),{mode:0o600});}catch(e){server.close();throw e;}
 return {descriptor,descriptorPath,observeState:value=>jobs.observe(value),close:async()=>{jobs.close();try{const current=JSON.parse(fs.readFileSync(descriptorPath,'utf8'));if(current.token===token)fs.unlinkSync(descriptorPath);}catch{}server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
module.exports={startBridge,routes};
