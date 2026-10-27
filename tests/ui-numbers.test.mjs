import test from 'node:test';
import assert from 'node:assert/strict';
import {formatUiNumber,roundUiNumber,preserveUiNumber} from '../src/ui-numbers.js';

test('dimensions hide floating-point tails and unnecessary zeros in both UI languages',()=>{
 for(const [value,de,en]of [[41.00000000000001,'41','41'],[40.99999999999999,'41','41'],[12.34567,'12,35','12.35'],[-12.34567,'-12,35','-12.35'],[1.005,'1,01','1.01'],[-1.005,'-1,01','-1.01'],[12345.6,'12345,6','12345.6'],[.1+.2,'0,3','0.3']]){
  assert.equal(formatUiNumber(value,'de'),de);assert.equal(formatUiNumber(value,'en'),en);
 }
});
test('negative zero is displayed and committed as ordinary zero',()=>{
 for(const value of [-0,-.00001,.00001]){assert.equal(formatUiNumber(value),'0');assert.equal(Object.is(roundUiNumber(value),-0),false);}
});
test('reading or accepting an unchanged rounded field preserves precise CAD values',()=>{
 for(const original of [41.00000000000001,23.123456,-31.67891,.125,.001])assert.equal(preserveUiNumber(roundUiNumber(original),original),original);
});
test('intentional edits round to two decimals without changing the other coordinates',()=>{
 const original=[23.123456,31.67891,41.00000000000001],values=[23.12,31.68,42.123456],edited=values.map((value,k)=>preserveUiNumber(value,original[k]));assert.deepEqual(edited,[original[0],original[1],42.12]);assert.deepEqual(original,[23.123456,31.67891,41.00000000000001]);
});
test('nonfinite inputs cannot enter a CAD field through presentation rounding',()=>{
 for(const value of [NaN,Infinity,-Infinity]){assert.throws(()=>formatUiNumber(value));assert.throws(()=>preserveUiNumber(value,41));}
});
