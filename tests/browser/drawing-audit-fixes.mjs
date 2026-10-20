import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {launchBrowser} from './support.mjs'
const browser=await launchBrowser(),results=[],errors=[]
try{
 const page=await browser.newPage({viewport:{width:1400,height:1050}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 const open=async fixture=>{await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/${fixture}.html?database=tc-deep-fix-${Date.now()}`);await page.waitForFunction(fixture=>fixture==='drawing-sharing'?!!workspace.getCells()[0]?.chart?.getDrawingState().sharing?.host:window.ready,fixture)}
 const shared=async()=>{await open('drawing-sharing');await page.evaluate(()=>{
  window.auditPro=workspace.getCells()[0].chart;window.auditIdentity={namespace:'isolated-shared',symbol:{ticker:'TEST.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'}
  const t=auditPro.getChart().getDataList().at(-10).timestamp
  window.auditMake=(id,scope='chart')=>({logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',lock:false,visible:true,styles:null,extendData:null,points:[{timestamp:t,value:100},{timestamp:t+60000,value:101}]},anchors:[{kind:'market',timestamp:t,value:100},{kind:'market',timestamp:t+60000,value:101}],presentation:{scope}})
 })}
 await shared()
 const restored=await page.evaluate(async()=>{
  const {captureLayout,restoreLayout}=await import('/src/chart.ts'),p=auditPro,v=auditMake('moved')
  await p.commitDrawing({kind:'create',logicalId:v.logicalId,after:v,source:'programmatic'});const old=captureLayout(p)
  const moved=await p.executeDrawingCommand({type:'transfer',ids:['moved'],scope:'workspace'}),before=JSON.stringify(p.getDrawings());let layoutError,directError
  try{await restoreLayout(p,old)}catch(e){layoutError=e.message}
  try{p.restoreDrawings('local',[v])}catch(e){directError=e.message}
  const preserved=JSON.stringify(p.getDrawings())===before,doc=workspace.capture()
  const back=await p.executeDrawingCommand({type:'transfer',ids:['moved'],scope:'chart'}),undo=await p.undoDrawing(),redo=await p.redoDrawing()
  return {moved:moved.status,layoutError,directError,preserved,localIds:doc.cells[0].chart.drawings.map(d=>d.logicalId),sharedIds:doc.sharedDrawings.flatMap(d=>d.drawings.map(d=>d.logicalId)),back:back.status,undo:undo?.status,redo:redo?.status,finalScope:p.getDrawings()[0].presentation.scope}
 })
 assert.match(restored.layoutError,/共享文档/);assert.match(restored.directError,/共享文档/);assert.equal(restored.preserved,true);assert.deepEqual(restored.localIds,[]);assert.deepEqual(restored.sharedIds,['moved']);assert.equal(restored.back,'completed');assert.equal(restored.undo,'confirmed');assert.equal(restored.redo,'confirmed');assert.equal(restored.finalScope,'chart');results.push({scenario:'DA-01 visible restore rejects and normal transfer history survives',...restored})
 const hidden=await page.evaluate(async()=>{
  const session=await auditPro.getDrawingState().sharing.workspace;const registry=new (await import('/src/chart.ts')).DrawingSessionRegistry({scope:'workspace'}),s=await registry.bind({identity:auditIdentity}),v=auditMake('unavailable','workspace');v.anchors=v.anchors.map(a=>({...a,timestamp:auditPro.getChart().getDataList()[0].timestamp-60000}));v.overlay.points=v.anchors.map(({timestamp,value})=>({timestamp,value}));await s.history.submit('create',v.logicalId,v,'programmatic')
  const documentId=auditPro.getDrawingState().sharing.host.documentId;await auditPro.bindDrawingWorkspace(registry,()=>({identity:auditIdentity,documentId}));let error;try{auditPro.restoreDrawings('local',[{...v,presentation:{scope:'chart'}}])}catch(e){error=e.message}
  const out={error,unprojected:auditPro.getChart().getOverlays({id:v.logicalId}).length===0,canonical:s.history.getDrawingIds()};await auditPro.bindDrawingWorkspace(undefined,()=>({reason:'audit complete'}));registry.dispose();return out
 })
 assert.match(hidden.error,/共享文档/);assert.equal(hidden.unprojected,true);assert.deepEqual(hidden.canonical,['unavailable']);results.push({scenario:'DA-01 unavailable shared canonical still owns its ID',...hidden})
 for(const late of [false,true]){
  await shared()
  const target=await page.evaluate(async late=>{
   const {captureLayout,restoreLayout,drawingShareKey}=await import('/src/chart.ts'),{drawingBindings}=await import('/src/drawing/bindings.ts'),p=auditPro
   await p.commitDrawing({kind:'create',logicalId:'target-collision',after:auditMake('target-collision'),source:'programmatic'})
   const original=captureLayout(p),before=JSON.stringify(p.getDrawings()),history=p.getDrawingHistoryState(),hostId=p.getDrawingState().sharing.host.documentId,targetId='target-'+late
   await store.write(auditIdentity.namespace,{documentId:targetId,expectedRevision:null,document:{version:1,key:drawingShareKey(auditIdentity),identity:auditIdentity,drawings:[...late?[]:[auditMake('target-collision','host')],auditMake('referenced-other','host')]}},new AbortController().signal)
   const session=await hostSessions.bind({identity:auditIdentity,documentId:targetId}),binding=drawingBindings.get(p.getChart()),prepare=binding.prepareSharedReferences
   if(late)binding.prepareSharedReferences=async refs=>{const prepared=await prepare(refs);return {...prepared,apply:()=>{session.history.reconcile('local',[...session.history.getDrawings(),auditMake('target-collision','host')]);prepared.apply()}}}
   let error;try{await restoreLayout(p,{...original,sharedDrawingRefs:[{namespace:auditIdentity.namespace,documentId:targetId,logicalId:'referenced-other',identity:auditIdentity}]})}catch(e){error=e.message}finally{binding.prepareSharedReferences=prepare}
   return {error,contentPreserved:JSON.stringify(p.getDrawings())===before,bindingPreserved:p.getDrawingState().sharing.host.documentId===hostId,historyPreserved:p.getDrawingHistoryState().canUndo===history.canUndo&&p.getDrawingHistoryState().canRedo===history.canRedo,externalTargetIds:session.history.getDrawingIds()}
  },late)
  assert.match(target.error,/共享文档/);assert.equal(target.contentPreserved,true);assert.equal(target.bindingPreserved,true);assert.equal(target.historyPreserved,true);assert.ok(target.externalTargetIds.includes('target-collision'));results.push({scenario:late?'DA-01 prepared target changes before adoption rolls back':'DA-01 unreferenced prepared target is preflighted',...target})
 }
 await shared()
 const retry=await page.evaluate(async()=>{
  const p=auditPro,e=p.getChart(),host=await hostSessions.bind({identity:auditIdentity,documentId:p.getDrawingState().sharing.host.documentId});window.auditWrites=0;const write=store.write.bind(store);store.write=(...args)=>{auditWrites++;return write(...args)}
  const v=auditMake('retry-shared','host');e.createOverlay({...v.overlay,name:'rect',lock:true});await host.history.submit('create',v.logicalId,v,'programmatic');const error=p.getDrawingHistoryState().projectionErrors[v.logicalId];e.removeOverlay({id:v.logicalId});return {error}
 })
 assert.match(retry.error,/冲突/);await page.getByRole('alert').filter({hasText:'retry-shared'}).getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>auditPro.getChart().getOverlays({id:'retry-shared'}).length===1&&!auditPro.getDrawingHistoryState().projectionErrors['retry-shared']);assert.equal(await page.evaluate(()=>auditWrites),0);results.push({scenario:'DA-04 real retry reprojects shared drawing without writes',passed:true})
 const detached=await page.evaluate(async()=>{
  const p=auditPro,e=p.getChart(),host=await hostSessions.bind({identity:auditIdentity,documentId:p.getDrawingState().sharing.host.documentId}),v=auditMake('expired','host');e.createOverlay({...v.overlay,name:'rect',lock:true});await host.history.submit('create',v.logicalId,v,'programmatic');const before=p.getDrawingHistoryState().projectionErrors[v.logicalId];await p.bindDrawingWorkspace(undefined,()=>({reason:'sharing disabled'}));return {before,errors:p.getDrawingHistoryState().projectionErrors,objects:p.getDrawings().map(d=>d.logicalId)}
 })
 assert.match(detached.before,/冲突/);assert.deepEqual(detached.errors,{});assert.deepEqual(detached.objects,[]);results.push({scenario:'DA-05 detach clears expired projection error',...detached})
 await shared()
 await page.evaluate(async()=>{
  const {KLineChartPro,ChartWorkspace}=await import('/src/chart.ts'),initial=auditPro,bars=initial.getChart().getDataList(),symbol=initial.getSymbol(),period=initial.getPeriod();workspace.dispose()
  window.auditClients=[];window.deferAuditFeed=false;window.auditMounts=0
  const identity={...auditIdentity,namespace:'replacement-audit'}
  window.auditWorkspace=new ChartWorkspace({container:document.querySelector('#workspace'),context:'replacement-audit',symbols:[symbol],initialSymbol:symbol,initialPeriod:period,getPeriods:async()=>[period],resolveDrawingShareKey:()=>({identity}),mountCell:container=>{
   auditMounts++;let current,listeners=new Set()
   const make=()=>{const host=document.createElement('div');host.style.cssText='height:100%;width:100%';container.appendChild(host);let gate=Promise.resolve();if(deferAuditFeed)gate=new Promise(resolve=>{window.releaseAuditFeed=resolve});const pro=new KLineChartPro({container:host,symbol,period,datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>{await gate;return {bars,basis:'raw',hasMoreBefore:false}},subscribe:()=>{},unsubscribe:()=>{}}});auditClients.push(pro);return pro}
   current=make();if(auditMounts===1)window.replaceAuditCell=()=>{current.dispose();current=make();for(const accept of listeners)accept(current);window.auditReplacement=current}
   return {ready:Promise.resolve(current),subscribeReady:accept=>{listeners.add(accept);accept(current);return()=>listeners.delete(accept)},dispose:()=>{current.dispose()}}
  }})
 })
 await page.waitForFunction(()=>auditWorkspace.getCells()[0]?.chart?.getDrawingState().sharing?.workspace)
 await page.evaluate(async()=>{const p=auditWorkspace.getCells()[0].chart;await p.commitDrawing({kind:'create',logicalId:'survivor',after:auditMake('survivor'),source:'programmatic'});assertResult(await p.executeDrawingCommand({type:'transfer',ids:['survivor'],scope:'workspace'}));function assertResult(r){if(r.status!=='completed')throw Error(JSON.stringify(r))}deferAuditFeed=true;replaceAuditCell()})
 await page.waitForFunction(()=>!!window.releaseAuditFeed);assert.equal(await page.evaluate(()=>auditWorkspace.getCells()[0].chart===undefined),true);await page.evaluate(()=>{deferAuditFeed=false;releaseAuditFeed()});await page.waitForFunction(()=>auditWorkspace.getCells()[0]?.chart===auditReplacement&&auditReplacement.getDrawings().some(d=>d.logicalId==='survivor'));results.push({scenario:'DA-03 successor waits for confirmed context and borrows original registry',passed:true})
 await page.evaluate(()=>{window.auditOriginal=auditWorkspace.getCells()[0].chart;window.auditDocument=auditWorkspace.capture();deferAuditFeed=true;window.auditRestoreDone=false;window.auditRestoreError=undefined;window.releaseAuditFeed=undefined;window.auditRestore=auditWorkspace.restore(auditDocument).then(()=>auditRestoreDone=true,error=>{auditRestoreError=error.message})})
 await page.waitForFunction(()=>!!window.releaseAuditFeed);assert.equal(await page.evaluate(()=>auditRestoreDone),false);assert.equal(await page.evaluate(()=>auditWorkspace.getCells()[0].chart===auditOriginal),true);await page.evaluate(()=>{deferAuditFeed=false;releaseAuditFeed()});await page.waitForFunction(()=>auditRestoreDone||auditRestoreError);assert.equal(await page.evaluate(()=>auditRestoreError),undefined);assert.equal(await page.evaluate(()=>auditWorkspace.getCells()[0].chart.getDrawings().filter(d=>d.logicalId==='survivor').length),1);await page.evaluate(()=>auditWorkspace.dispose());results.push({scenario:'DA-03 strict restore waits for actual confirmed binding',passed:true})
 const prepare=async()=>{
  await open('drawing-workbench');await page.getByRole('button',{name:'全部绘图工具',exact:true}).click();await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill('segment');await page.locator('.tc-drawing-tool-picker button').filter({hasText:/^趋势线/}).click()
  const r=await page.evaluate(()=>{const r=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});await page.mouse.click(r.x+r.width*.25,r.y+r.height*.15);await page.mouse.click(r.x+r.width*.75,r.y+r.height*.85);await page.waitForFunction(()=>pro.getDrawings().length===1);await page.evaluate(()=>pro.executeDrawingCommand({type:'select',ids:[]}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return r
 }
 await prepare();const queued=await page.evaluate(async()=>{const source=pro.getDrawings()[0];await pro.executeDrawingCommand({type:'copy',ids:[source.logicalId]});const pending=pro.executeDrawingCommand({type:'paste'});pro.setSymbol({...pro.getSymbol(),ticker:'OTHER.X'});return {result:await pending,ticker:pro.getSymbol().ticker,drawings:pro.getDrawings()}});assert.equal(queued.result.status,'rejected');assert.match(queued.result.message,/上下文已改变/);assert.equal(queued.ticker,'OTHER.X');assert.deepEqual(queued.drawings,[]);results.push({scenario:'DA-02 old queued paste cannot write to successor symbol',...queued})
 await prepare();await page.evaluate(async()=>{await pro.executeDrawingCommand({type:'presentation',ids:[pro.getDrawings()[0].logicalId],patch:{intervals:{kind:'higher',period:{multiplier:1,timespan:'hour'}}}});pro.setPeriod({multiplier:90,timespan:'minute',text:'90m'})});await page.waitForFunction(()=>pro.getPeriod().multiplier===90&&pro.getChart().getOverlays()[0]?.visible===true);results.push({scenario:'DA-06 90-minute drawing remains visible above one hour',passed:true})
 await prepare();const preference=await page.evaluate(()=>pro.executeDrawingCommand({type:'preferences',patch:{shortcuts:{segment:'alt+shift+t'}}}));assert.equal(preference.status,'completed');await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.press('Alt+Shift+t');await page.waitForFunction(()=>pro.getDrawingState().toolId==='segment');await page.keyboard.press('Escape');results.push({scenario:'DA-07 accepted compound shortcut selects actual tool',passed:true})
 const r=await prepare();await page.keyboard.down('Shift');await page.mouse.move(r.x+r.width*.3,r.y+r.height*.78);await page.mouse.down();await page.mouse.move(r.x+r.width*.42,r.y+r.height*.93,{steps:5});assert.equal(await page.locator('.tc-drawing-box').count(),1);await page.mouse.up();await page.keyboard.up('Shift');results.push({scenario:'DA-08 empty area inside a diagonal bounding box allows real box selection',passed:true})
 await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()});assert.deepEqual(errors,[])
}finally{writeFileSync(process.argv[2],JSON.stringify({results,errors},null,2)+'\n');await browser.close()}
