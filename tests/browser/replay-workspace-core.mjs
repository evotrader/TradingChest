import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const output=process.argv[2],result={syntheticInputs:true,errors:[]},browser=await launchBrowser()
try {
 const page=await browser.newPage({viewport:{width:1280,height:1600},deviceScaleFactor:1});page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/replay-workspace.html`);await page.waitForFunction(()=>window.ready)
 result.mount=await page.evaluate(()=>replayBench.mount({count:2000,layout:2,legacy:false}))
 result.actions=await page.evaluate(()=>replayBench.core())
 result.failures=await page.evaluate(()=>replayBench.faults())
 result.cleanup=await page.evaluate(()=>replayBench.dispose());assert.deepEqual(result.cleanup,{subscriptions:0,dom:0});assert.deepEqual(result.errors,[]);result.passed=true
}catch(error){result.failure=String(error);throw error}finally{writeFileSync(output,JSON.stringify(result,null,2));await browser.close()}
