export function usageTotals(rows){
 const total={input:0,output:0,cached:0,min:0,max:0,cacheUnknown:false,priceUnknown:false};
 for(const r of rows){total.input+=r.input??0;total.output+=r.output??0;if(r.cached==null)total.cacheUnknown=true;else total.cached+=r.cached;if(r.cost){total.min+=r.cost.min;total.max+=r.cost.max;}else total.priceUnknown=true;}return total;
}
export function usagePrice(raw,rates,at,billing){
 raw??={};
 const input=billing?.inputTokens??raw.input_tokens??raw.prompt_tokens,output=billing?.outputTokens??raw.output_tokens??raw.completion_tokens,cached=billing?.cachedInputTokens??raw.input_tokens_details?.cached_tokens??raw.prompt_tokens_details?.cached_tokens??raw.prompt_cache_hit_tokens??null;
 const value={input,output,cached};
 if(rates&&Number.isFinite(input)&&Number.isFinite(output)){
  const charge=c=>(Math.max(0,input-c)*rates.input+c*(rates.cached??rates.input)+output*rates.output)/1e6;
  const d=new Date(at),hour=d.getUTCHours(),weekday=d.getUTCDay();
  // Peak windows may be exempt on Chinese public holidays. Keep a range there.
  // A five-minute margin avoids assigning boundary-crossing requests a false exact rate.
  const minute=hour*60+d.getUTCMinutes(),offPeak=Number.isFinite(+d)&&(weekday===0||weekday===6||![[55,245],[355,605]].some(([a,b])=>minute>=a&&minute<=b));
  const multiplier=offPeak?1:rates.peakMultiplier??1;
  value.cost={min:charge(cached??input),max:charge(cached??0)*multiplier};
 }return value;
}
