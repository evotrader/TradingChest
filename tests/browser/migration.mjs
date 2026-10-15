import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const old=JSON.parse(readFileSync(new URL('../../src/indicator/__tests__/fixtures/v9-oracle.json',import.meta.url),'utf8'))
const current=JSON.parse(readFileSync(process.argv[2] || '/tmp/tc-v10-oracle.json','utf8'))
assert.equal(current.version,'10.1.0');assert.deepEqual(current.names,old.names)
const close=(a,b,label)=>assert.ok(a===b||(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b))),`${label}: ${a} != ${b}`)
const makeBars=count=>Array.from({length:count},(_,i)=>{const c=100+Math.sin(i/7)*10+i/1000,o=c+Math.cos(i/3);return {timestamp:1700000000000+i*60000,open:o,close:c,high:Math.max(o,c)+2,low:Math.min(o,c)-2,volume:i%17===0?0:100+i%31}})
const bars=makeBars(160)
const inputs={short:bars.slice(0,3),full:bars,same:[...bars.slice(0,-1),{...bars.at(-1),close:bars.at(-1).close+0.1}],append:[...bars,{...bars.at(-1),timestamp:bars.at(-1).timestamp+60000}],prepend:[...makeBars(20).map(b=>({...b,timestamp:b.timestamp-20*60000})),...bars]}
let compared=0,formulas=0
for(const name of old.names)for(const [scenario,rows] of Object.entries(old.indicators[name].cases)) {
 const actual=current.indicators[name].cases[scenario], [parameter,inputName]=scenario.split('/'),input=inputs[inputName]
 const params=old.indicators[name][parameter==='default'?'defaults':'alternate']
 assert.equal(actual.length,rows.length,`${name} ${scenario} length`)
 if(['CR','PVT','ROC','RSI','SAR'].includes(name)) {
  if(name==='SAR') {
   const start=params[0]/100,step=params[1]/100,max=params[2]/100
   // Validate the unchanged recurrence against the recorded oracle, with the corrected reversal AF.
   let af=start,extreme=-100,up=false,sar=0
   input.forEach((bar,i)=>{
    if(up){if(extreme===-100||extreme<bar.high){extreme=bar.high;af=Math.min(af+step,max)}sar+=af*(extreme-sar);if(sar>bar.low){sar=extreme;af=start;extreme=-100;up=false}else sar=Math.min(sar,input[Math.max(0,i-1)].low,bar.low)}
    else {if(extreme===-100||extreme>bar.low){extreme=bar.low;af=Math.min(af+step,max)}sar+=af*(extreme-sar);if(sar<bar.high){sar=extreme;af=start;extreme=-100;up=true}else sar=Math.max(sar,input[Math.max(0,i-1)].high,bar.high)}
    close(actual[i].sar,sar,`SAR ${scenario} ${i}`);assert.equal(actual[i].high,bar.high);assert.equal(actual[i].low,bar.low)
   })
   // On this increasing opening sequence, bar 2 must use AF=start+2*step, not 2*step.
   if(inputName==='full')close(actual[2].sar,input[0].low+(start+2*step)*(input[2].high-input[0].low),`SAR reversal seed ${scenario}`)
  }
  if(name==='PVT'){let sum=0;input.forEach((bar,i)=>{if(i)sum+=(bar.close-input[i-1].close)/input[i-1].close*bar.volume;close(actual[i].pvt,sum,`PVT ${scenario} ${i}`)})}
  if(name==='ROC'){const n=params[0],m=params[1];input.forEach((bar,i)=>{if(i<n)assert.equal(actual[i].roc,undefined);else {const roc=(bar.close/input[i-n].close-1)*100;close(actual[i].roc,roc,`ROC ${scenario} ${i}`);if(i>=n+m-1){const mean=input.slice(i-m+1,i+1).reduce((sum,b,j)=>sum+(b.close/input[i-m+1+j-n].close-1)*100,0)/m;close(actual[i].maRoc,mean,`MAROC ${scenario} ${i}`)}}})}
  if(name==='CR'){const n=params[0],cr=input.map((bar,i)=>{if(i<n-1)return undefined;let up=0,down=0;for(let j=i-n+1;j<=i;j++){const previous=input[Math.max(0,j-1)],mid=(previous.high+previous.low)/2;up+=Math.max(0,input[j].high-mid);down+=Math.max(0,mid-input[j].low)}return down===0?0:up/down*100});cr.forEach((value,i)=>close(actual[i].cr,value,`CR ${scenario} ${i}`));params.slice(1).forEach((m,k)=>{const shift=Math.ceil(m/2.5+1);actual.forEach((point,i)=>{const end=i-shift;if(i>=n+m+shift-3){const window=cr.slice(end-m+1,end+1);if(window.length===m&&window.every(v=>v!==undefined))close(point[`ma${k+1}`],window.reduce((a,b)=>a+b,0)/m,`CRMA ${scenario} ${i}`)}})})}
  if(name==='RSI')params.forEach((n,k)=>{if(input.length<=n)return;const deltas=input.map((b,i)=>i?b.close-input[i-1].close:0);let gain=deltas.slice(1,n+1).reduce((a,x)=>a+Math.max(0,x),0)/n,loss=deltas.slice(1,n+1).reduce((a,x)=>a+Math.max(0,-x),0)/n;input.forEach((_,i)=>{if(i<n){assert.equal(actual[i][`rsi${k+1}`],undefined);return}if(i>n){gain=gain+(Math.max(0,deltas[i])-gain)/n;loss=loss+(Math.max(0,-deltas[i])-loss)/n}close(actual[i][`rsi${k+1}`],loss===0?100:gain===0?0:100-100/(1+gain/loss),`RSI ${scenario} ${i}`)})})
  formulas++;continue
 }
 rows.forEach((row,i)=>{
  let expected=row,point=actual[i]
  if(name==='MA')expected=Object.fromEntries(Object.entries(row).map(([key,value])=>[`ma${old.indicators[name].defaults.indexOf(Number(key.slice(2)))+1}`,value]))
  if(name==='SAR')point={sar:point.sar}
  if(name==='VOL'){const {open,close,...rest}=point;point=rest;assert.equal(open,input[i].open);assert.equal(close,input[i].close)}
  assert.deepEqual(Object.keys(point).sort(),Object.keys(expected).sort(),`${name} ${scenario} keys ${i}`)
  for(const key of Object.keys(expected))if(typeof expected[key]==='object')assert.deepEqual(point[key],expected[key]);else close(point[key],expected[key],`${name} ${scenario} ${i} ${key}`)
 });compared++
}
console.log(JSON.stringify({status:'PASS',originalIndicators:old.names.length,parityCases:compared,independentFormulaCases:formulas,upstreamChanges:['MA keys','SAR/VOL additional data','CR rolling sums','PVT volume multiplier','ROC N-period warmup','RSI Wilder smoothing']}))
