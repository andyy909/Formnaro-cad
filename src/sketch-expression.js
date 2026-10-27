// Bounded arithmetic data parser. Only named dimensions and these two degree
// functions are callable; no JavaScript, properties or other functions.
export function sketchExpression(value,resolve=()=>{throw Error('Unbekanntes Maß.');}){
 if(typeof value==='number')value=String(value);
 if(typeof value!=='string'||!value.trim()||value.length>200)throw Error('Maßformel: 1–200 Zeichen erforderlich.');
 const text=value.replaceAll('−','-'),tokens=text.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/]/g)??[];
 if(tokens.join('')!==text.replace(/\s/g,''))throw Error('Nur Zahlen, Maßnamen, + − * /, Klammern, sind und cosd verwenden.');
 let at=0,depth=0;
 const finite=v=>{if(!Number.isFinite(v)||Math.abs(v)>100000)throw Error('Ungültiges oder zu großes Maßergebnis.');return v;};
 function atom(){if(++depth>32)throw Error('Maßformel zu tief verschachtelt.');const t=tokens[at++];let v;
  if(t==='+'||t==='-')v=(t==='-'?-1:1)*atom();
  else if(t==='('){v=sum();if(tokens[at++]!==')')throw Error('Klammer fehlt.');}
  else if(/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(t??'')){
   if(tokens[at]==='('){if(!['sind','cosd'].includes(t))throw Error('Unbekannte Maßfunktion.');at++;const angle=sum();if(tokens[at++]!==')')throw Error('Klammer fehlt.');v=(t==='sind'?Math.sin:Math.cos)(angle*Math.PI/180);if(Math.abs(v)<1e-14)v=0;}
   else v=resolve(t);
  }else if(t!==undefined&&/^(?:\d|\.)/.test(t))v=Number(t);else throw Error('Unvollständige Maßformel.');
  depth--;return finite(v);
 }
 function product(){let v=atom();while(['*','/'].includes(tokens[at])){const op=tokens[at++],b=atom();if(op==='/'&&b===0)throw Error('Division durch null.');v=finite(op==='*'?v*b:v/b);}return v;}
 function sum(){let v=product();while(['+','-'].includes(tokens[at])){const op=tokens[at++],b=product();v=finite(op==='+'?v+b:v-b);}return v;}
 const result=sum();if(at!==tokens.length)throw Error('Ungültige Maßformel.');return result;
}
