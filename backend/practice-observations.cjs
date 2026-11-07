// Private host-owned observation channel. No new renderer modeling capability.
const subscribers=new WeakMap();
function observePractice(win,callback){let set=subscribers.get(win);if(!set)subscribers.set(win,set=new Set());set.add(callback);return ()=>set.delete(callback);}
function practiceObservers(win){return [...(subscribers.get(win)??[])];}
function validateObservation(v){
 if(!v||Array.isArray(v)||Object.keys(v).some(k=>!['version','index','total','revision','ok','action','actual','error'].includes(k))||v.version!==1||!Number.isInteger(v.index)||!Number.isInteger(v.total)||v.index<0||v.index>=v.total||v.total>50||!/^[a-f0-9]{16}$/.test(v.revision??'')||typeof v.ok!=='boolean'||!v.action||!v.actual||v.error!==undefined&&typeof v.error!=='string'||JSON.stringify(v).length>16000)throw Error('Ungültiger ausgeführter Übungsschritt.');
 return structuredClone(v);
}
const activitySubscribers=new WeakMap();
function observePracticeActivity(win,callback){let set=activitySubscribers.get(win);if(!set)activitySubscribers.set(win,set=new Set());set.add(callback);return ()=>set.delete(callback);}
function notifyPracticeActivity(win,value){for(const callback of activitySubscribers.get(win)??[])try{callback(structuredClone(value));}catch{/* Optional activity logging must not alter playback. */}}
module.exports={observePractice,practiceObservers,validateObservation,observePracticeActivity,notifyPracticeActivity};
