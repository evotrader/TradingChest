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
  for(const count of [10000,50000]) {
   const samples=[]
   for(let i=0;i<10;i++)samples.push(await page.evaluate(n=>sample(n),count))
   assert.ok(samples.every(s=>s.subscriptions===0),'subscription leaked')
   result.cases[count]={cold:stats(samples.map(s=>s.cold)),update:stats(samples.flatMap(s=>s.update)),interaction:stats(samples.flatMap(s=>s.interaction)),samples}
   console.log(count,JSON.stringify({...result.cases[count],samples:undefined}))
  }
  writeFileSync(output,JSON.stringify(result)+'\n')
  if(process.env.TC_PERFORMANCE_BASELINE) {
   const baseline=JSON.parse(readFileSync(process.env.TC_PERFORMANCE_BASELINE,'utf8'))
   for(const count of [10000,50000])for(const key of ['cold','update','interaction'])assert.ok(result.cases[count][key].p95<=Math.max(baseline.cases[count][key].p95*1.25,baseline.cases[count][key].p95+(key==='cold'?100:16.7)),`${count} ${key} p95 regression`)
  }
 }
 assert.deepEqual(errors,[])
} finally {await browser.close()}
