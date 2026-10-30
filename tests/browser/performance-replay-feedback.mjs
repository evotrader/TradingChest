import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {launchBrowser} from './support.mjs'
const output=process.argv[2],result={samples:[],errors:[],limit:100},browser=await launchBrowser()
try{
 const page=await browser.newPage({viewport:{width:1280,height:1600},deviceScaleFactor:1});page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/replay-workspace.html`);await page.waitForFunction(()=>window.ready)
 await page.evaluate(()=>replayBench.mount({count:10000,layout:2,legacy:false,ui:true}))
 // A second animation frame runs after a real rendering opportunity. Start at
 // the input event, before the product handler, and observe visible busy state.
 await page.evaluate(()=>{
  window.feedback=[];document.addEventListener('click',event=>{
   const action=event.target.closest('[data-replay-action]')?.dataset.replayAction;if(!['start','resume','stop'].includes(action))return
   const started=event.timeStamp,dispatchedAt=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>{const root=document.querySelector('.tc-workspace'),overlay=document.querySelector('.tc-workspace-replay-busy');feedback.push({action,latency:performance.now()-started,dispatchDelay:dispatchedAt-started,phase:root.dataset.replayPhase,visible:!!overlay&&overlay.getBoundingClientRect().height>0||['idle','paused'].includes(root.dataset.replayPhase)})}))
  },true)
 })
 for(let round=0;round<9;round++){
  await page.locator(`[data-replay-action=${round?'resume':'start'}]`).click();await page.waitForFunction(()=>replayBench.workspace.getReplayState().phase==='paused')
  await page.locator('[data-replay-action=stop]').click();await page.waitForFunction(()=>replayBench.workspace.getReplayState().phase==='idle')
 }
 await page.waitForFunction(()=>feedback.length===18);result.samples=await page.evaluate(()=>feedback)
 assert.ok(result.samples.every(sample=>sample.visible));assert.deepEqual(result.errors,[])
 result.p95=Math.max(...result.samples.map(sample=>sample.latency));assert.ok(result.p95<=result.limit,JSON.stringify(result));result.cleanup=await page.evaluate(()=>replayBench.dispose());assert.deepEqual(result.cleanup,{subscriptions:0,dom:0});result.passed=true
}catch(error){result.failure=String(error);throw error}finally{writeFileSync(output,JSON.stringify(result,null,2));await browser.close()}
