import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),results=[]
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workbench.html?database=tc-reopen-${Date.now()}`);await page.waitForFunction(()=>window.ready)
 const saved=await page.evaluate(async()=>{
  const c=pro.getChart(),bars=c.getDataList(),sub=c.getIndicators().find(i=>i.name==='VOL').paneId
  const secondary=c.createYAxis({id:'reopen-secondary',paneId:'candle_pane',name:'logarithm',position:'left'})
  const targets=[['main','candle_pane',c.getYAxes({paneId:'candle_pane'})[0].id],['secondary','candle_pane',secondary],['sub',sub,c.getYAxes({paneId:sub})[0].id]]
  pro.restoreDrawings('local',targets.map(([id,paneId,yAxisId])=>({logicalId:id,owner:'local',yAxisId,overlay:{id,paneId,name:'rect',groupId:'drawing_tools',visible:true,lock:false,points:bars.slice(-30,-28).map(b=>({timestamp:b.timestamp,value:b.close}))},anchors:bars.slice(-30,-28).map(b=>({kind:'market',timestamp:b.timestamp,value:b.close}))})))
  return (await import('/src/persistence/v4.ts')).captureLayout(pro)
 })
 await page.reload();await page.waitForFunction(()=>window.ready)
 assert.notEqual(await page.evaluate(()=>pro.getChart().getYAxes({paneId:'candle_pane'})[0].id),saved.drawings[0].yAxisId)
 const restored=await page.evaluate(async value=>{
  const {restoreLayout,captureLayout}=await import('/src/persistence/v4.ts');await restoreLayout(pro,value)
  return {layout:captureLayout(pro),axes:pro.getChart().getPaneOptions().flatMap(p=>pro.getChart().getYAxes({paneId:p.id})),errors:pro.getDrawingHistoryState().projectionErrors}
 },saved)
 assert.equal(restored.layout.drawings.length,3);assert.deepEqual(restored.errors??{},{});
 for(const original of saved.drawings){const d=restored.layout.drawings.find(d=>d.logicalId===original.logicalId);assert.deepEqual(d.anchors,original.anchors);assert.equal(d.overlay.paneId,original.overlay.paneId);assert.ok(restored.axes.some(a=>a.id===d.yAxisId&&a.paneId===d.overlay.paneId))}
 assert.notEqual(restored.layout.drawings[0].yAxisId,saved.drawings[0].yAxisId)
 assert.equal(restored.axes.find(a=>a.id===restored.layout.drawings[1].yAxisId).name,'logarithm')
 results.push({scenario:'new-instance-main-secondary-and-indicator-axis',passed:true})
 const preflight=await page.evaluate(async value=>{const {restoreLayout,captureLayout}=await import('/src/persistence/v4.ts'),before=captureLayout(pro);value.drawings[0].logicalId='alert_protected';value.drawings[0].overlay.id='alert_protected';let error;try{await restoreLayout(pro,value)}catch(e){error=e.message}const after=captureLayout(pro);delete before.timestamp;delete after.timestamp;return {error,unchanged:JSON.stringify(before)===JSON.stringify(after)}},saved)
 assert.match(preflight.error,/宿主管理/);assert.equal(preflight.unchanged,true);results.push({scenario:'target-axis-preflight-preserves-permission-check',passed:true})
 const invalid=await page.evaluate(async value=>{const {restoreLayout,captureLayout}=await import('/src/persistence/v4.ts'),before=captureLayout(pro);value.axes.find(a=>a.id===value.drawings[0].yAxisId).name='logarithm';value.drawings[0].anchors[0].value=-1;let error;try{await restoreLayout(pro,value)}catch(e){error=e.message}const after=captureLayout(pro);delete before.timestamp;delete after.timestamp;return {error,unchanged:JSON.stringify(before)===JSON.stringify(after)}},saved)
 assert.match(invalid.error,/对数轴/);assert.equal(invalid.unchanged,true);results.push({scenario:'target-log-axis-domain-preflight-before-mutation',passed:true})
 const reordered=await page.evaluate(async value=>{const {restoreLayout}=await import('/src/persistence/v4.ts');value.axes.reverse();const d=value.drawings[0];delete d.yAxisId;d.anchors.forEach(a=>a.value=-1);d.overlay.points.forEach(p=>p.value=-1);await restoreLayout(pro,value);return pro.getDrawings().find(o=>o.logicalId===d.logicalId)},saved)
 assert.equal(reordered.yAxisId,undefined);assert.equal(reordered.anchors[0].value,-1);results.push({scenario:'implicit-default-axis-independent-of-serialization-order',passed:true})
 assert.deepEqual(errors,[]);const evidence={passed:true,scope:'native-engine-v4-new-instance',results,errors};if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()})
}finally{await browser.close()}
