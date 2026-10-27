// Human-facing dimensions use two decimals. CAD transforms and saved sources
// retain their original precision until a user actually changes a field.
const formats={
  de:new Intl.NumberFormat('de-DE',{maximumFractionDigits:2,useGrouping:false}),
  en:new Intl.NumberFormat('en-GB',{maximumFractionDigits:2,useGrouping:false}),
};
export function roundUiNumber(value){
  if(!Number.isFinite(value))throw Error('Bitte einen gültigen Zahlenwert eingeben.');
  const rounded=Number(formats.en.format(value));return rounded===0?0:rounded;
}
export function formatUiNumber(value,language='de'){
  return formats[language==='en'?'en':'de'].format(roundUiNumber(value));
}
export function preserveUiNumber(value,original){
  const rounded=roundUiNumber(value);
  return rounded===roundUiNumber(original)||Math.abs(value-original)<1e-6?original:rounded;
}
