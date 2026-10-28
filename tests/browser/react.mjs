import assert from 'node:assert/strict'
import {writeFileSync,readFileSync} from 'node:fs'
import {launchBrowser} from './support.mjs'
const browser=await launchBrowser(),output=process.argv[2]||'/tmp/tc09-react.json',performanceOnly=process.argv.includes('--performance')
const result={syntheticInputs:true,cases:{},gates:[]}
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.goto((process.env.TC_BROWSER_BASE||'http://127.0.0.1:4173')+'/tests/browser/react.html');await page.waitForFunction(()=>window.reactReady)
 if(performanceOnly){
  const budgets=JSON.parse(readFileSync(new URL('./performance-budgets.json',import.meta.url),'utf8')).cases
  for(const count of [10000,50000])for(const layout of [1,2,4]){
   const samples={native:[],react:[]},key=layout===1?String(count):`${count}x${layout}`
   for(let i=0;i<10;i++)for(const enabled of(i%2?[true,false]:[false,true])){
    const sample=await page.evaluate(({count,layout,enabled})=>sampleReactCold(count,layout,enabled),{count,layout,enabled})
    assert.equal(sample.initialized,layout);assert.equal(sample.activeSubscriptions,layout);assert.equal(sample.created,sample.disposed);assert.equal(sample.subscriptions,0);assert.equal(sample.dom,0)
    samples[enabled?'react':'native'].push(sample)
   }
   const stats=values=>{const sorted=values.map(v=>v.cold).sort((a,b)=>a-b);return {p50:sorted[4],p95:sorted[9],n:10}}
   result.cases[key]={native:stats(samples.native),react:stats(samples.react),samples}
   for(const group of ['native','react'])result.gates.push({key,group,p95:result.cases[key][group].p95,limit:budgets[key].cold,passed:result.cases[key][group].p95<=budgets[key].cold})
   writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(key,JSON.stringify({native:result.cases[key].native,react:result.cases[key].react,limit:budgets[key].cold}))
  }
  result.errors=errors;writeFileSync(output,JSON.stringify(result,null,2)+'\n');assert.deepEqual(errors,[])
  assert.ok(result.gates.every(g=>g.passed),JSON.stringify(result.gates.filter(g=>!g.passed)))
 }else{
  await page.evaluate(()=>{window.ownedReactResources=trackReactResources()})
  result.drawingAlerts=await page.evaluate(()=>reactDrawingAlertCallbacks());assert.deepEqual(result.drawingAlerts,{reused:true,liveA:1,liveB:1,replayB:1,replayC:1,stateHandoff:true})
  result.lifecycle=await page.evaluate(()=>reactLifecycle())
  // These are real React wrappers and real Canvas; each sample checks every owned feed and DOM.
  for(let cycle=0;cycle<100;cycle++){
   const sample=await page.evaluate(()=>sampleReactCold(20,2,true));assert.equal(sample.created,2);assert.equal(sample.disposed,2);assert.equal(sample.subscriptions,0);assert.equal(sample.dom,0)
  }
  result.cycles=100;result.resources=await page.evaluate(()=>ownedReactResources());assert.deepEqual(result.resources,{listeners:0,timers:0,frames:0,observers:0,dom:0})
 }
 assert.deepEqual(errors,[]);result.errors=errors;writeFileSync(output,JSON.stringify(result,null,2)+'\n')
 console.log(performanceOnly?'React/native cold performance PASS':'React real-engine portal and 100-cycle ownership PASS')
}finally{await browser.close()}
