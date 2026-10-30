import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
const legacy=process.env.TC_REPLAY_BASELINE_CAPTURE==='1',output=process.argv[2],diagnostic=process.env.TC_REPLAY_DIAGNOSTIC==='1'
assert.ok(output)
assert.ok(!legacy||!process.argv.includes('--candidate'),'候选验收不能启用基线模式')
const limits=legacy?null:JSON.parse(readFileSync(new URL('./replay-workspace-budgets.json',import.meta.url),'utf8'))
const result={kind:legacy?'baseline':'candidate',syntheticInputs:true,diagnostic,node:process.version,cpuAffinity:'8,9,16,17',viewport:{width:1280,height:1600,deviceScaleFactor:1},cases:[],gates:[],errors:[]}
const save=()=>writeFileSync(output,JSON.stringify(result,null,2)+'\n'),browser=await launchBrowser()
try{
 result.browser=browser.version();const page=await browser.newPage(result.viewport);page.on('pageerror',e=>result.errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/replay-workspace.html`);await page.waitForFunction(()=>window.ready)
 assert.equal(await page.evaluate(()=>PerformanceObserver.supportedEntryTypes.includes('longtask')),true)
 for(const count of diagnostic?[10000]:[10000,50000])for(const layout of diagnostic?[2]:[1,2,4]){
  const entry={count,layout,samples:[]};result.cases.push(entry)
  for(let round=0;round<(diagnostic?1:9);round++){
   await page.evaluate(input=>replayBench.mount(input),{count,layout,legacy})
   let sample
   try{sample=await page.evaluate(()=>replayBench.sample())}catch(error){entry.incomplete=await page.evaluate(()=>window.partialReplaySample);throw error}
   entry.samples.push(sample);save()
   const cleanup=await page.evaluate(()=>replayBench.dispose());assert.deepEqual(cleanup,{subscriptions:0,dom:0});sample.cleanup=cleanup;save()
   console.log(`${result.kind} ${count}x${layout} ${round+1}/9`,Object.fromEntries(Object.entries(sample).filter(([key])=>key!=='cleanup').map(([key,value])=>[key,Math.round(value.latency)])))
  }
  for(const action of ['enter','step','seek-forward','seek-backward','exit','restore']){
   const latency=entry.samples.map(s=>s[action].latency).sort((a,b)=>a-b),longtask=entry.samples.map(s=>s[action].maximumLongTask),p95=latency[Math.ceil(latency.length*.95)-1],maximumLongTask=Math.max(...longtask)
   if(!legacy)for(const [metric,actual]of [['latency',p95],['longtask',maximumLongTask]]){const limit=limits.cases[`${count}x${layout}`][action][metric];result.gates.push({count,layout,action,metric,actual,limit,passed:actual<=limit})}
  }
  save()
 }
 assert.deepEqual(result.errors,[])
 if(!legacy)assert.ok(result.gates.every(g=>g.passed),JSON.stringify(result.gates.filter(g=>!g.passed)))
 result.passed=true
}catch(error){result.failure=String(error);throw error}finally{save();await browser.close()}
