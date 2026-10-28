import {launchBrowser} from './support.mjs'
import {writeFileSync,readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const browser=await launchBrowser(),budgets=JSON.parse(readFileSync(new URL('./performance-budgets.json',import.meta.url))),diagnostic=process.env.TC_DA_DIAGNOSTIC==='1',rounds=diagnostic?1:10
const result={syntheticInputs:true,mode:diagnostic?'diagnostic':'formal',rounds,samples:[],gates:[],errors:[]},save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
const p95=values=>{assert.ok(values.length&&values.every(value=>Number.isFinite(value)&&value>=0));return [...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]}
const gate=(name,actual,limit,extra={})=>result.gates.push({name,actual,limit,passed:actual<=limit,...extra})
// Original limits: implementation R4; zero-rule 10k limit: separately approved audit-fix R2 proposal.
// Same-bar and incremental gates remain unchanged.
const approvedAppendUpdates=budgets.drawingAlertAppendUpdates
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',error=>result.errors.push(error.message));result.browser=browser.version()
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-alerts-performance.html`);await page.waitForFunction(()=>window.ready)
 for(const count of [10000,50000])for(const append of [false,true])for(let round=1;round<=rounds;round++)for(const rules of [0,100]){
  const sample=await page.evaluate(options=>sampleDrawingAlerts(options),{count,rules,append});assert.equal(sample.actualRules,rules);assert.equal(sample.sourceCount,1);assert.equal(sample.confirmedBars,count+(append?100:0));assert.equal(sample.updates.length,100);assert.equal(sample.batches.length,rules?100:0);assert.deepEqual(sample.cleanup,{subscriptions:0,dom:0});result.samples.push({...sample,round});save();console.log(JSON.stringify({count,append,rules,round,updateP95:p95(sample.updates),batchP95:sample.batches.length?p95(sample.batches):undefined,events:sample.events}))
 }
 for(const count of [10000,50000])for(const append of [false,true]){
  const samples=rules=>result.samples.filter(sample=>sample.count===count&&sample.append===append&&sample.rules===rules)
  for(const rules of [0,100]){const values=samples(rules),originalLimit=budgets.cases[String(count)].update,limit=append?(approvedAppendUpdates[`${count}:${rules}`]??originalLimit):originalLimit;assert.equal(values.length,rounds);gate(`update-${count}-${append?'append':'same'}-${rules}`,p95(values.flatMap(sample=>sample.updates)),limit,{n:rounds*100,...(limit!==originalLimit?{originalLimit,approvedOn:'2026-10-29'}:{})})}
  const control=p95(samples(0).flatMap(sample=>sample.updates)),candidate=p95(samples(100).flatMap(sample=>sample.updates))
  gate(`increment-${count}-${append?'append':'same'}`,candidate-control,10,{control,candidate,n:rounds*100})
  gate(`batch100-${count}-${append?'append':'same'}`,p95(samples(100).flatMap(sample=>sample.batches)),10,{n:rounds*100})
 }
 assert.equal(result.samples.length,2*2*2*rounds);assert.deepEqual(result.errors,[]);result.passed=result.gates.every(gate=>gate.passed);save();assert.ok(result.passed,JSON.stringify(result.gates.filter(gate=>!gate.passed)))
}finally{save();await browser.close()}
