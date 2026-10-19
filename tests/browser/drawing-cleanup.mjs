import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),result={cycles:100,samples:[],heap:[],errors:[],scope:'owned-resources-with-native-IDB-and-borrowed-sessions'}
try{
 const page=await browser.newPage({viewport:{width:1280,height:1400}});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-performance.html`);await page.waitForFunction(()=>window.ready);const session=await page.context().newCDPSession(page)
 const collect=async()=>{try{await session.send('HeapProfiler.collectGarbage');return {usedSize:(await session.send('Runtime.getHeapUsage')).usedSize}}catch(e){return {unavailable:String(e)}}}
 await page.evaluate(async()=>window.cleanupProbe=(await import('/tests/browser/drawing-cleanup.ts')).installDrawingCleanup());result.heap.push({cycle:0,...await collect()})
 for(let i=0;i<100;i++){
  const before=await page.evaluate(()=>cleanupProbe.start());assert.equal(before.subscribers,2);assert.equal(before.connections,2)
  const root=page.locator('.klinecharts-pro').first()
  if(i%3===0){await page.evaluate(()=>drawingBench.charts[0].executeDrawingCommand({type:'tool',toolId:'textAnnotation'}));const r=await page.evaluate(()=>{const r=drawingBench.charts[0].getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x+r.width*.7,y:r.y+r.height*.6}});await page.mouse.click(r.x,r.y);await page.getByRole('dialog',{name:'编辑绘图文字'}).waitFor()}
  else if(i%3===1){const h=root.getByRole('button',{name:'绘图控制点 1 · 压测 0000',exact:true});const b=await h.boundingBox();await page.mouse.move(b.x+22,b.y+22);await page.mouse.down();await page.mouse.move(b.x+25,b.y+25)}
  else{const r=await root.locator('.klinecharts-pro-widget').boundingBox();await page.mouse.click(r.x+r.width*.7,r.y+r.height*.4,{button:'right'});await page.getByRole('menu',{name:'绘图操作'}).waitFor()}
  const borrowing=await page.evaluate(()=>cleanupProbe.releaseFirst());assert.deepEqual(borrowing,{connections:2,subscribers:1});if(i%3===1)await page.mouse.up()
  const cleanup=await page.evaluate(()=>cleanupProbe.finish()),heap=await collect(),owned=await page.evaluate(hasGC=>cleanupProbe.report(hasGC),heap.usedSize!==undefined);assert.deepEqual(cleanup,{subscriptions:0,dom:0});const {details,...counts}=owned;assert.ok(Object.values(counts).every(n=>n===0),JSON.stringify(owned));result.samples.push({cycle:i+1,borrowing,cleanup,owned:counts});if(i===49||i===99)result.heap.push({cycle:i+1,...heap});writeFileSync(process.argv[2],JSON.stringify(result,null,2))
 }
 assert.deepEqual(result.errors,[]);await page.evaluate(()=>cleanupProbe.restore());result.passed=true;console.log(JSON.stringify({...result,samples:result.samples.length}))
}finally{writeFileSync(process.argv[2],JSON.stringify(result,null,2));await browser.close()}
