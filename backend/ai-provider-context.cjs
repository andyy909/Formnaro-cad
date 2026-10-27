// Keep the public local API compatible. Only its provider representation uses
// a reference for the identical legacy schema alias; no tools or notes removed.
function providerContext(context){
 if(context?.commandSchema&&context.requestSchema&&JSON.stringify(context.commandSchema)===JSON.stringify(context.requestSchema))return {...context,requestSchema:{$ref:'#/commandSchema'}};
 return context;
}
module.exports={providerContext};
