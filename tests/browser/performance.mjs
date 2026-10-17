import {launchBrowser} from './support.mjs'
import {writeFileSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
const budgets=JSON.parse(readFileSync(new URL('./performance-budgets.json',import.meta.url),'utf8'))
const limits=budgets.cases
const recheckIndex=process.argv.indexOf('--recheck-analysis')
const output=recheckIndex>=0?process.argv[recheckIndex+2]:(process.argv.slice(2).find(arg=>!arg.startsWith('--')) || '/tmp/tradingchest-performance.json')
const stats=xs=>{const s=[...xs].sort((a,b)=>a-b);return {p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],n:s.length}}
const summarize=samples=>({cold:stats(samples.map(s=>s.cold)),update:stats(samples.flatMap(s=>s.update)),interaction:stats(samples.flatMap(s=>s.interaction)),samples})
let result={syntheticInputs:true,viewport:{width:1280,height:900},cases:{},gates:[]}
const save=()=>writeFileSync(output,JSON.stringify(result,null,2)+'\n')
const gate=(caseKey,metric,p95,limit,group='original',provenance={})=>{result.gates.push({caseKey,metric,p95,limit,group,passed:p95<=limit,...provenance})}
const analysisGates=(key,control,analysis)=>{
 for(const metric of ['cold','update','interaction'])gate(key,metric,control[metric].p95,limits[key][metric],'control')
 const originalLimit=Math.max(control.cold.p95*1.25,control.cold.p95+100)
 const approval=budgets.analysisColdOverrides?.[key]
 gate(key,'cold',analysis.cold.p95,approval?.limit??originalLimit,'analysis',approval?{originalLimit,approval}:undefined)
 const originalUpdateLimit=Math.max(control.update.p95*1.25,control.update.p95+16.7)
 const updateApproval=budgets.analysisUpdateOverrides?.[key]
 gate(key,'update',analysis.update.p95,updateApproval?.limit??originalUpdateLimit,'analysis',updateApproval?{originalLimit:originalUpdateLimit,approval:updateApproval}:undefined)
 gate(key,'interaction',analysis.interaction.p95,limits[key].interaction,'analysis')
}
const check=()=>{save();assert.ok(result.gates.every(g=>g.passed),result.gates.filter(g=>!g.passed).map(g=>`${g.group} ${g.caseKey} ${g.metric} ${g.p95}ms > ${g.limit}ms`).join('; '))}
if(recheckIndex>=0) {
 const source=process.argv[recheckIndex+1]
 assert.ok(source&&output,'Usage: performance.mjs --recheck-analysis SOURCE OUTPUT')
 assert.notEqual(resolve(source),resolve(output),'Recheck must preserve the original evidence')
 result=JSON.parse(readFileSync(source,'utf8'))
 assert.deepEqual(Object.keys(result.cases).sort(),['10000','10000x2','50000','50000x2'])
 const previousGates=result.gates
 result.gates=[]
 for(const [key,{control,analysis}] of Object.entries(result.cases)) {
  for(const group of [control,analysis]) {
   assert.equal(group.samples.length,10,'Incomplete cold sampling')
   for(const sample of group.samples) {
    assert.equal(sample.update.length,100);assert.equal(sample.interaction.length,100)
    assert.equal(sample.subscriptions,0);assert.equal(sample.dom,0)
    assert.deepEqual(sample.runtime,{indicators:0,panes:0,axes:0})
    assert.ok([sample.cold,...sample.update,...sample.interaction].every(n=>Number.isFinite(n)&&n>=0))
   }
   const measured=summarize(group.samples)
   for(const metric of ['cold','update','interaction'])assert.deepEqual(measured[metric],group[metric],'Recorded statistics must match raw samples')
  }
  analysisGates(key,control,analysis)
 }
 const {heap,...owned}=result.cleanup
 assert.deepEqual(owned,{cycles:100,subscriptions:0,listeners:0,timers:0,frames:0,observers:0,dom:0,indicators:0,panes:0,axes:0})
 result.recheck={source:resolve(source),resampled:false,previousGates}
 check()
 console.log('Analysis budget recheck passed; original measured samples retained',result.gates.length)
} else {
const browser=await launchBrowser()
try {
 const page=await browser.newPage({viewport:result.viewport}),errors=[]
 result.browser=browser.version()
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto((process.env.TC_BROWSER_BASE || 'http://127.0.0.1:4173')+'/tests/browser/performance.html')
 await page.waitForFunction(()=>window.ready)
 if(process.argv.includes('--oracle')) {
  const oracle=await page.evaluate(()=>captureOracle());writeFileSync(output,JSON.stringify(oracle)+'\n');console.log('Oracle captured',oracle.version,oracle.names.length)
 } else if(process.argv.includes('--analysis')) {
  for(const count of [10000,50000])for(const layout of [1,2]) {
   const samples={control:[],analysis:[]},key=layout===1?`${count}`:`${count}x${layout}`
   for(let i=0;i<10;i++)for(const enabled of (i%2?[true,false]:[false,true])) {
    const sample=await page.evaluate(({count,layout,enabled})=>sampleAnalysis(count,layout,enabled),{count,layout,enabled})
    assert.equal(sample.subscriptions,0,'subscription leaked');assert.equal(sample.dom,0,'owned chart DOM leaked');assert.deepEqual(sample.runtime,{indicators:0,panes:0,axes:0},'analysis runtime leaked')
    samples[enabled?'analysis':'control'].push(sample)
   }
   const control=summarize(samples.control),analysis=summarize(samples.analysis)
   result.cases[key]={control,analysis}
   analysisGates(key,control,analysis)
   console.log(key,JSON.stringify({control:{...control,samples:undefined},analysis:{...analysis,samples:undefined}}));save()
  }
  const session=await page.context().newCDPSession(page)
  await page.exposeFunction('collectAnalysisHeap',async()=>{try{await session.send('HeapProfiler.collectGarbage');return {usedSize:(await session.send('Runtime.getHeapUsage')).usedSize}}catch(error){return {unavailable:String(error)}}})
  result.cleanup=await page.evaluate(()=>analysisCleanup())
  const {heap,...owned}=result.cleanup
  assert.deepEqual(owned,{cycles:100,subscriptions:0,listeners:0,timers:0,frames:0,observers:0,dom:0,indicators:0,panes:0,axes:0})
  check()
 } else {
  const compare=process.argv.includes('--compare')
  if(compare)await page.evaluate(()=>window.performanceComparison=true)
  const cases=process.argv.includes('--workspace')?[10000,50000].flatMap(n=>[2,4].map(layout=>[n,layout])):[[10000,1],[50000,1]]
  const baseline=process.env.TC_PERFORMANCE_BASELINE?JSON.parse(readFileSync(process.env.TC_PERFORMANCE_BASELINE,'utf8')):undefined
  for(const [count,layout] of cases) {
   const samples=[]
   for(let i=0;i<10;i++)samples.push(await page.evaluate(({count,layout})=>layout===1?(window.performanceComparison?sampleComparisons(count):sample(count)):sampleWorkspace(count,layout),{count,layout}))
   assert.ok(samples.every(s=>s.subscriptions===0),'subscription leaked')
   const key=layout===1?(compare?`${count}x3compare`:`${count}`):`${count}x${layout}`
   result.cases[key]=summarize(samples)
   // Legacy baselines remain accepted as provenance, never as a wider budget.
   if(baseline)assert.ok(baseline.cases[key],`Missing corresponding performance baseline ${key}`)
   for(const metric of ['cold','update','interaction'])gate(key,metric,result.cases[key][metric].p95,limits[key][metric])
   console.log(key,JSON.stringify({...result.cases[key],samples:undefined}));save()
  }
  for(const variable of ['TC_LONG_HISTORY_COLD_BUDGET_MS','TC_10K_COMPARISON_COLD_BUDGET_MS'])if(process.env[variable]!==undefined)assert.equal(Number(process.env[variable]),500,`${variable} must preserve the approved 500ms ceiling`)
  check()
 }
 assert.deepEqual(errors,[])
} finally {await browser.close()}
}
