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
  const stats=xs=>{const s=[...xs].sort((a,b)=>a-b);return {p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],n:s.length}}
  const result={syntheticInputs:true,browser:browser.version(),viewport:{width:1280,height:900},cases:{}}
  for(const [count,layout] of (process.argv.includes('--workspace')?[10000,50000].flatMap(n=>[2,4].map(layout=>[n,layout])):[[10000,1],[50000,1]])) {
   const samples=[]
   for(let i=0;i<10;i++)samples.push(await page.evaluate(({count,layout})=>layout===1?sample(count):sampleWorkspace(count,layout),{count,layout}))
   assert.ok(samples.every(s=>s.subscriptions===0),'subscription leaked')
   const key=layout===1?count:`${count}x${layout}`
   result.cases[key]={cold:stats(samples.map(s=>s.cold)),update:stats(samples.flatMap(s=>s.update)),interaction:stats(samples.flatMap(s=>s.interaction)),samples}
   console.log(key,JSON.stringify({...result.cases[key],samples:undefined}))
  }
  writeFileSync(output,JSON.stringify(result)+'\n')
  if(process.env.TC_PERFORMANCE_BASELINE) {
   const baseline=JSON.parse(readFileSync(process.env.TC_PERFORMANCE_BASELINE,'utf8'))
   for(const [caseKey,current] of Object.entries(result.cases))for(const key of ['cold','update','interaction']){
    assert.ok(baseline.cases[caseKey],`Missing corresponding performance baseline ${caseKey}`)
    assert.ok(current[key].p95<=Math.max(baseline.cases[caseKey][key].p95*1.25,baseline.cases[caseKey][key].p95+(key==='cold'?100:16.7)),`${caseKey} ${key} p95 regression`)
   }
  }
 }
 assert.deepEqual(errors,[])
} finally {await browser.close()}
