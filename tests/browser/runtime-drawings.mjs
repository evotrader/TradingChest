import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'

const directory=process.env.TC_BROWSER_EVIDENCE??'/tmp/tradingchest-runtime-drawings'
mkdirSync(directory,{recursive:true})
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1440,height:1100}}),results=[],errors=[]
page.on('pageerror',error=>errors.push(error.message))
const run=async(name,work,fixture='analysis')=>{
 const offset=errors.length
 try{
  await page.goto((process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173')+`/tests/browser/${fixture}.html`)
  await page.waitForFunction(()=>window.ready)
  if(fixture==='analysis'){
   await page.evaluate(()=>{window.commits=[];window.prompts=[];window.selections=[];window.prompt=(...args)=>{prompts.push(args);return 'Text'};setup(undefined,{drawingOwner:()=>window.backendOwner?'backend':'local',onDrawingSelect:id=>selections.push(id),commitDrawing:async change=>{commits.push(change);return {status:'confirmed',snapshot:change.after?{...change.after,backendId:'isolated-id'}:null}}})})
   await page.waitForFunction(()=>test.state.ready===1)
   await page.evaluate(()=>{test.addLayers();test.pane=test.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).find(i=>i.extendData.type==='histogram').paneId})
  }else await page.evaluate(()=>setup())
  const evidence=await work();assert.deepEqual(errors.slice(offset),[]);results.push({name,passed:true,evidence})
 }catch(error){results.push({name,passed:false,error:String(error)});await page.screenshot({path:`${directory}/${name}.png`}).catch(()=>{})}
 finally{await page.evaluate(()=>{if(window.workspace){workspace.dispose();ownedStore.dispose()}else test.chart.dispose()}).catch(()=>{})}
}
const draw=async(index,pane)=>{
 await page.locator('.klinecharts-pro-drawing-bar .item').nth(index).locator('span').first().click()
 const point=await page.evaluate(pane=>{const c=window.test?.chart??workspace.getCells()[0].chart,rect=c.getChart().getDom(pane??test.pane,'main').getBoundingClientRect();return {x:rect.x+rect.width*.6,y:rect.y+rect.height*.5}},pane)
 await page.mouse.move(point.x,point.y);await page.mouse.click(point.x,point.y)
 await page.waitForTimeout(150)
}
try{
 for(const [index,name] of [[0,'line'],[7,'text']])await run(`mouse-${name}-rejects-runtime-pane-before-prompt-or-backend`,async()=>{
  await page.evaluate(()=>window.backendOwner=true);await draw(index)
  const value=await page.evaluate(()=>({drawings:test.chart.getDrawings(),overlays:test.chart.getChart().getOverlays({paneId:test.pane}),state:test.chart.getDrawingHistoryState(),commits:commits.length,prompts:prompts.length,selections}))
  assert.equal(value.drawings.length,0);assert.equal(value.overlays.length,0);assert.equal(value.state.canUndo,false);assert.equal(value.commits,0);assert.equal(value.prompts,0)
  assert.match(await page.locator('[role=alert]').filter({hasText:'临时分析副图'}).innerText(),/主图/)
  assert.ok(value.selections.length===0||value.selections.at(-1)===null)
  await page.evaluate(()=>test.handles.histogram.dispose());assert.equal(await page.evaluate(()=>test.chart.getChart().getOverlays().length),0)
  return value
 })
 await run('main-pane-with-analysis-retains-backend-drawing-history',async()=>{
  await page.evaluate(()=>window.backendOwner=true);await draw(0,'candle_pane')
  const value=await page.evaluate(async()=>{
   const pro=test.chart,original=pro.getDrawings();await pro.undoDrawing();const undone=pro.getDrawings().length;await pro.redoDrawing()
   return {original,undone,redone:pro.getDrawings(),commits:commits.map(c=>c.kind)}
  })
  assert.equal(value.original.length,1);assert.equal(value.original[0].overlay.paneId,'candle_pane');assert.equal(value.undone,0);assert.deepEqual(value.redone,value.original);assert.deepEqual(value.commits,['create','delete','create']);return value
 })
 await run('public-commit-rejects-before-backend-and-allows-legacy-delete',async()=>{
  const value=await page.evaluate(async()=>{
   const pro=test.chart,c=pro.getChart(),overlay={id:'blocked',name:'horizontalStraightLine',paneId:test.pane,points:[{timestamp:test.bars[5].timestamp,value:2}]}
   let error;try{await pro.commitDrawing({kind:'create',logicalId:'blocked',after:{logicalId:'blocked',owner:'backend',overlay},source:'drawing-bar'})}catch(reason){error=reason.message}
   const afterRejected={drawings:pro.getDrawings().length,pending:pro.getDrawingHistoryState().pending,commits:commits.length}
   // Model a previously restored backend annotation before this pane became runtime-owned.
   const binding=runtimeBindings.get(c);binding.paneIds.delete(test.pane)
   try{pro.restoreDrawings('backend',[{logicalId:'legacy',owner:'backend',backendId:'legacy-api-id',overlay:{...overlay,id:'legacy'}}])}finally{binding.paneIds.add(test.pane)}
   const deleted=await pro.commitDrawing({kind:'delete',logicalId:'legacy',after:null,source:'keyboard'})
   let undoError;try{await pro.undoDrawing()}catch(reason){undoError=reason.message}
   return {error,afterRejected,deleted,undoError,commits,remaining:pro.getDrawings()}
  })
  assert.match(value.error,/临时分析副图/);assert.match(value.undoError,/临时分析副图/);assert.deepEqual(value.afterRejected,{drawings:0,pending:0,commits:0});assert.equal(value.deleted.status,'confirmed');assert.equal(value.commits.length,1);assert.equal(value.commits[0].kind,'delete');assert.equal(value.commits[0].before.backendId,'legacy-api-id');assert.deepEqual(value.remaining,[])
  return value
 })
 await run('mixed-restore-rejects-whole-batch-without-changing-existing-annotations',async()=>{
  const value=await page.evaluate(()=>{
   const pro=test.chart,make=(id,paneId,value=3)=>({logicalId:id,owner:'backend',backendId:id+'-api',overlay:{id,name:'horizontalStraightLine',paneId,points:[{timestamp:test.bars[5].timestamp,value}]}})
   pro.restoreDrawings('backend',[make('existing','candle_pane')]);const before=pro.getDrawings();let error
   try{pro.restoreDrawings('backend',[make('new','candle_pane'),make('blocked',test.pane)])}catch(reason){error=reason.message}
   return {error,before,after:pro.getDrawings(),overlays:pro.getChart().getOverlays().map(o=>o.id),commits}
  })
  assert.match(value.error,/临时分析副图/);assert.deepEqual(value.after,value.before);assert.deepEqual(value.overlays,['existing']);assert.deepEqual(value.commits,[]);return value
 })
 await run('low-level-runtime-overlay-capture-fails-explicitly-without-deletion',async()=>{
  const value=await page.evaluate(async()=>{
   const {captureLayout}=await import('/src/persistence/v3.ts'),c=test.chart.getChart();c.createOverlay({id:'injected',name:'horizontalStraightLine',paneId:test.pane,points:[{timestamp:test.bars[5].timestamp,value:2}]})
   let error;try{captureLayout(test.chart,{localDrawingIds:['injected']})}catch(reason){error=reason.message}
   const retained=c.getOverlays({id:'injected'}).map(o=>({id:o.id,paneId:o.paneId})),withoutLocal=captureLayout(test.chart)
   return {error,retained,withoutLocal:withoutLocal.overlayData,commits}
  })
  assert.match(value.error,/临时分析副图/);assert.match(value.error,/删除/);assert.equal(value.retained.length,1);assert.deepEqual(value.withoutLocal,[]);assert.deepEqual(value.commits,[]);return value
 })
 await run('ordinary-pane-mouse-history-and-named-workspace-roundtrip',async()=>{
  await page.evaluate(()=>{const pro=workspace.getCells()[0].chart,c=pro.getChart(),context=pro.getAnalysisContext();window.layer=pro.addAnalysisLayer(context,{id:'transient',label:'临时层',type:'histogram',placement:'sub',valueType:'scalar',data:c.getDataList().map(b=>({timestamp:b.timestamp,value:1}))});window.runtimePane=c.getIndicators({name:'TC_ANALYSIS'}).find(i=>i.extendData.type==='histogram').paneId})
  const pane=await page.evaluate(()=>runtimePane);await draw(0,pane)
  assert.equal(await page.evaluate(()=>workspace.getCells()[0].chart.getDrawings().length),0)
  const normalPane=await page.evaluate(()=>workspace.getCells()[0].chart.getChart().getIndicators({name:'VOL'})[0].paneId);await draw(0,normalPane)
  const value=await page.evaluate(async()=>{
   const pro=workspace.getCells()[0].chart,original=pro.getDrawings();if(original.length!==1)throw Error('Ordinary pane drawing was not confirmed')
   await pro.undoDrawing();const undone=pro.getDrawings().length;await pro.redoDrawing();const redone=pro.getDrawings()
   layer.dispose();const saved=await workspace.saveAs('普通副图绘图');await workspace.load(saved.id)
   const restored=workspace.getCells()[0].chart.getDrawings(),record=await nativeStore.read('ui-isolated',saved.id,new AbortController().signal)
   return {original,undone,redone,restored,stored:record.document.cells[0].chart,barOwners:state.barOwners}
  })
  assert.equal(value.undone,0);assert.deepEqual(value.redone,value.original);assert.equal(value.restored.length,1);assert.equal(value.restored[0].overlay.paneId,value.original[0].overlay.paneId);assert.equal(value.stored.overlayData.length,1);assert.ok(value.stored.panes.every(p=>p.id!==pane));return value
 },'workspace-store')
}finally{await browser.close();writeFileSync(process.argv[2]??`${directory}/evidence.json`,JSON.stringify({results,errors},null,2)+'\n')}
console.log(JSON.stringify({results,errors},null,2));if(results.some(result=>!result.passed)||errors.length)process.exitCode=1
