import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {workflowBudgets as budgets,mixedTargets} from './drawing-workflow-limits.mjs'

assert.ok(process.env.TC_DW_BASELINE,'TC_DW_BASELINE is required')
const baseline=JSON.parse(readFileSync(process.env.TC_DW_BASELINE,'utf8')),mixed=JSON.parse(readFileSync(path.resolve(process.argv[2],'../../performance-drawing-expressiveness/evidence.json'),'utf8'))
const result={mode:'formal',syntheticInputs:true,budgets,cases:[],gates:mixedTargets(baseline,mixed),errors:[]},save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n'),browser=await launchBrowser()
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});page.on('pageerror',error=>result.errors.push(error.message));result.browser=browser.version();result.node=process.version
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workflow-performance.html`);await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>PerformanceObserver.supportedEntryTypes.includes('longtask')),true)
 for(const history of budgets.histories)for(const tool of budgets.tools){
  const entry={history,tool,mounts:[]};result.cases.push(entry)
  for(let round=1;round<=budgets.mounts;round++){
   const geometry=await page.evaluate(({history,tool})=>workflowBench.mount(history,tool),{history,tool});assert.deepEqual(geometry,{count:history,objects:1,native:1,levels:64});const mount={round,geometry,samples:[]};entry.mounts.push(mount)
   for(let move=0;move<budgets.moves;move++){
    const direction=move%2?1:-1,target=await page.evaluate(direction=>workflowBench.arm(direction),direction),handle=page.getByRole('button',{name:new RegExp('^绘图控制点 1 · '+tool+'$')});await handle.waitFor();const box=await handle.boundingBox();assert.ok(box)
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:3});await page.mouse.up();await page.waitForFunction(()=>workflowBench.sample()?.complete,{},{timeout:30000})
    const sample=await page.evaluate(()=>workflowBench.sample());assert.equal(sample.trusted,true);assert.equal(sample.observerSupported,true);assert.equal(sample.levels,64);assert.equal(sample.texts,64);assert.equal(sample.rows.length,64);assert.equal(new Set(sample.rows.map(row=>row.id)).size,64);assert.equal(sample.geometry.length,64);assert.ok(sample.rows.every(row=>typeof row.text==='string'&&row.text.length));assert.ok(Number.isFinite(sample.latency)&&sample.latency>=0);assert.ok(Number.isFinite(sample.renderCPU));assert.ok(Number.isFinite(sample.maximumLongTask));assert.equal(sample.anchor.timestamp,sample.expected.timestamp);assert.ok(Math.abs(sample.anchor.value-sample.expected.value)<1e-8);assert.ok(Math.abs(sample.nativePoint.value-sample.expected.value)<1e-8);assert.equal(sample.history.pending,0);assert.equal(sample.history.uncertainLogicalIds.length,0);assert.deepEqual(sample.history.projectionErrors,{});assert.equal(sample.confirmed.length,1);assert.equal(sample.confirmed[0].status,'confirmed');mount.samples.push({move,direction,...sample});save()
   }
   mount.cleanup=await page.evaluate(()=>workflowBench.dispose());assert.deepEqual(mount.cleanup,{subscriptions:0,dom:0});save()
  }
  const values=entry.mounts.flatMap(mount=>mount.samples.map(sample=>sample.latency)).sort((a,b)=>a-b);assert.equal(values.length,200);const p95=values[Math.ceil(values.length*.95)-1];result.gates.push({history,tool,metric:'64-level-trusted-control-drag',n:values.length,p95,maximum:values.at(-1),limit:budgets.dragP95,passed:p95<=budgets.dragP95});save()
 }
 assert.deepEqual(result.errors,[]);assert.equal(result.gates.length,6);result.passed=result.gates.every(gate=>gate.passed);save();console.log(JSON.stringify({passed:result.passed,gates:result.gates}));assert.ok(result.passed,'Drawing workflow performance targets failed')
}finally{save();await browser.close()}
