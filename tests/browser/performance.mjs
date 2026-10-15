import {createRequire} from 'node:module'
import {writeFileSync,readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../../../../package.json',import.meta.url))
const {chromium}=require('playwright')
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,chromiumSandbox:true})
const output=process.argv[2] || '/tmp/tradingchest-performance.json'
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto((process.env.TC_BROWSER_BASE || 'http://127.0.0.1:4173')+'/tests/browser/performance.html')
 await page.waitForFunction(()=>window.ready)
 if(process.argv.includes('--oracle')) {
  const oracle=await page.evaluate(()=>captureOracle())
  writeFileSync(output,JSON.stringify(oracle)+'\n');console.log('Oracle captured',oracle.version,oracle.names.length)
 } else {
  if(process.argv.includes('--compare'))await page.evaluate(()=>window.performanceComparison=true)
  const stats=xs=>{const s=[...xs].sort((a,b)=>a-b);return {p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],n:s.length}}
  const result={syntheticInputs:true,browser:browser.version(),viewport:{width:1280,height:900},cases:{}}
  for(const [count,layout] of (process.argv.includes('--workspace')?[10000,50000].flatMap(n=>[2,4].map(layout=>[n,layout])):[[10000,1],[50000,1]])) {
   const samples=[]
   for(let i=0;i<10;i++)samples.push(await page.evaluate(({count,layout})=>layout===1?(window.performanceComparison?sampleComparisons(count):sample(count)):sampleWorkspace(count,layout),{count,layout}))
   assert.ok(samples.every(s=>s.subscriptions===0),'subscription leaked')
   const key=layout===1?(process.argv.includes('--compare')?`${count}x3compare`:count):`${count}x${layout}`
   result.cases[key]={cold:stats(samples.map(s=>s.cold)),update:stats(samples.flatMap(s=>s.update)),interaction:stats(samples.flatMap(s=>s.interaction)),samples}
   console.log(key,JSON.stringify({...result.cases[key],samples:undefined}))
  }
  writeFileSync(output,JSON.stringify(result)+'\n')
  if(process.env.TC_PERFORMANCE_BASELINE) {
   const baseline=JSON.parse(readFileSync(process.env.TC_PERFORMANCE_BASELINE,'utf8'))
   const approvedLongCold=process.env.TC_LONG_HISTORY_COLD_BUDGET_MS===undefined?undefined:Number(process.env.TC_LONG_HISTORY_COLD_BUDGET_MS)
   if(approvedLongCold!==undefined)assert.ok(Number.isFinite(approvedLongCold)&&approvedLongCold>0,'Invalid explicitly approved long-history budget')
   result.gates=Object.entries(result.cases).flatMap(([caseKey,current])=>['cold','update','interaction'].map(metric=>{
    assert.ok(baseline.cases[caseKey],`Missing corresponding performance baseline ${caseKey}`)
    const originalLimit=Math.max(baseline.cases[caseKey][metric].p95*1.25,baseline.cases[caseKey][metric].p95+(metric==='cold'?100:16.7))
    const approved=metric==='cold'&&/^50000(?:x3compare)?$/.test(caseKey)?approvedLongCold:undefined
    const limit=approved===undefined?originalLimit:Math.max(originalLimit,approved)
    return {caseKey,metric,p95:current[metric].p95,originalLimit,approvedLongCold:approved,limit,passed:current[metric].p95<=limit}
   }))
   writeFileSync(output,JSON.stringify(result)+'\n')
   assert.ok(result.gates.every(gate=>gate.passed),result.gates.filter(gate=>!gate.passed).map(gate=>`${gate.caseKey} ${gate.metric} ${gate.p95}ms > ${gate.limit}ms`).join('; '))
  }
 }
 assert.deepEqual(errors,[])
} finally {await browser.close()}
