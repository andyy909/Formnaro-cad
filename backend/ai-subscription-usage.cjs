// Local accounting is not an account balance: other apps and plan weights are unknown.
const MODES=new Set(['chatgpt','mistral-vibe']);
function subscriptionUsage({config,statistics,account}){
 const provider=config.authMode;
 if(!MODES.has(provider))return {subscription:false};
 const available=statistics?.available===true,rows=available?statistics.rows:[];
 const sum=key=>available?rows.reduce((n,row)=>n+(row.subscription[key]??0),0):null;
 return {subscription:true,provider,label:provider==='chatgpt'?'ChatGPT':'Mistral Vibe',period:statistics.period,since:statistics.since,updatedAt:statistics.updatedAt,
  local:{available,requests:sum('requests'),inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),inputMissing:sum('inputMissing'),outputMissing:sum('outputMissing'),estimatedAPICostUSD:sum('pricedRequests')>0?{min:sum('costMinUSD'),max:sum('costMaxUSD')}:null,unpricedRequests:sum('unpricedRequests'),warning:statistics.warning||''},
  account:provider==='mistral-vibe'&&account?account:{status:'not-reported'},quota:{status:'not-reported'},canOpenAccount:true};
}
module.exports={subscriptionUsage};
