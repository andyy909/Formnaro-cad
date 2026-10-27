const {createAITaskStore}=require('../../backend/ai-tasks.cjs');
const store=createAITaskStore({directory:JSON.parse(process.argv[2]).directory});
process.on('message',message=>{
 if(message.crash)process.exit(17);
 try{process.send({id:message.id,ok:true,value:store.request(message.args,message.provider)});}
 catch(e){process.send({id:message.id,ok:false,error:e.message,code:e.code});}
});
process.send({ready:true});
