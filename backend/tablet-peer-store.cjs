const {createHash,randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const {mkdirSync,readFileSync,statSync}=require('node:fs');
const {join}=require('node:path');
const {writeTaskAtomicSync}=require('./ai-task-atomic.cjs');

const deviceIdPattern=/^[a-f0-9-]{36}$/;
const deviceKeyPattern=/^[A-Za-z0-9_-]{43}$/;
const keyDigest=key=>createHash('sha256').update(key).digest();

function createTabletPeerStore(directory,protection){
  const file=join(directory,'tablet-freigaben.json');
  function read(){
    try {
      if(statSync(file).size>32768)throw Error();
      const state=JSON.parse(readFileSync(file,'utf8'));
      if(state.version!==1||!Array.isArray(state.devices)||state.devices.length>16||
        state.devices.some(device=>!deviceIdPattern.test(device?.id??'')||
          !/^[0-9a-f]{64}$/.test(device.digest??'')||typeof device.name!=='string'||device.name.length>80||
          typeof device.live!=='boolean'||typeof device.assistant!=='boolean')||
        (state.network!==null&&(typeof state.network!=='string'||!state.network||state.network.length>200))||
        (state.identity!==null&&(typeof state.identity?.cert!=='string'||typeof state.identity?.key!=='string')))
        throw Error();
      return state;
    }catch(error){
      if(error.code==='ENOENT')return {version:1,identity:null,network:null,devices:[]};
      throw Error('Die gespeicherten Tablet-Freigaben konnten nicht gelesen werden.');
    }
  }
  function save(next){
    mkdirSync(directory,{recursive:true});
    writeTaskAtomicSync(file,JSON.stringify(next)+'\n');
  }
  function checkProtection(){
    if(!protection?.isEncryptionAvailable()||protection.getSelectedStorageBackend?.()==='basic_text')
      throw Error('Der Systemschutz für gespeicherte Tablet-Freigaben ist nicht verfügbar.');
  }
  function identity(){
    const entry=read().identity;
    if(!entry)return null;
    checkProtection();
    return {cert:Buffer.from(entry.cert,'utf8'),key:Buffer.from(protection.decryptString(Buffer.from(entry.key,'base64')),'utf8')};
  }
  function saveIdentity({cert,key}){
    checkProtection();
    const state=read();
    if(state.identity)throw Error('Der PC hat bereits eine gespeicherte Identität.');
    save({...state,identity:{cert:cert.toString('utf8'),key:protection.encryptString(key.toString('utf8')).toString('base64')}});
  }
  function grant(name,{live,assistant}){
    const state=read();
    if(state.devices.length>=16)throw Error('Vor einer neuen Kopplung ein bekanntes Tablet entkoppeln.');
    const key=randomBytes(32).toString('base64url'),id=randomUUID();
    const device={id,name,live,assistant,digest:keyDigest(key).toString('hex')};
    save({...state,devices:[...state.devices,device]});
    return {id,key,live,assistant};
  }
  function authorize(key){
    if(typeof key!=='string'||!deviceKeyPattern.test(key))return null;
    const digest=keyDigest(key);
    return read().devices.find(device=>timingSafeEqual(digest,Buffer.from(device.digest,'hex')))??null;
  }
  function revoke(id){
    const state=read(),devices=state.devices.filter(device=>device.id!==id);
    if(devices.length===state.devices.length)return false;
    save({...state,devices});
    return true;
  }
  return {identity,saveIdentity,grant,authorize,revoke,network:()=>read().network,
    has:id=>read().devices.some(device=>device.id===id),
    setNetwork:network=>{const state=read();if(network!==state.network)save({...state,network});},
    list:()=>read().devices.map(({id,name,live,assistant})=>({id,name,live,assistant}))};
}

module.exports={createTabletPeerStore};
