import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
const browser=await launchBrowser(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173'}/tests/browser/drawing-sharing.html?database=tc-sharing-${Date.now()}`)
 await page.waitForFunction(()=>window.workspace?.getCells()[0]?.chart?.getDrawingState().sharing?.workspace)
 console.log('sharing: initial sessions ready')
 await page.getByRole('combobox',{name:'图表布局',exact:true}).selectOption('2')
 await page.waitForFunction(()=>workspace.getCells().length===2&&workspace.getCells().every(c=>c.chart?.getDrawingState().sharing?.workspace))
 console.log('sharing: two cells ready')
 const chart=page.locator('[data-cell-id="primary"]')
 await chart.getByRole('button',{name:'全部绘图工具',exact:true}).click();await chart.getByRole('textbox',{name:'搜索绘图工具'}).fill('趋势线');await chart.locator('.tc-drawing-tool-picker button[title="Alt+T"]').click()
 const rect=await page.evaluate(()=>{const r=workspace.getCells()[0].chart.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y}})
 await page.mouse.click(rect.x+200,rect.y+100);await page.mouse.click(rect.x+300,rect.y+180)
 await page.waitForFunction(()=>workspace.getCells()[0].chart.getDrawings().length===1)
 console.log('sharing: native drawing completed')
 await chart.getByRole('button',{name:'绘图管理',exact:true}).click()
 await chart.getByRole('button',{name:'选择搜索结果',exact:true}).click();await chart.getByRole('button',{name:'移至 工作台',exact:true}).click()
 await page.waitForFunction(()=>workspace.getCells()[1].chart.getDrawings().length===1)
 console.log('sharing: transfer projected')
 assert.equal(await page.evaluate(()=>workspace.capture().sharedDrawings[0].drawings.length),1)
 assert.ok(await page.evaluate(()=>workspace.capture().cells.every(c=>c.chart.drawings.length===0)))
 await page.evaluate(async()=>{const a=workspace.getCells()[1].chart,id=a.getDrawings()[0].logicalId;await a.executeDrawingCommand({type:'update',ids:[id],patch:{presentation:{name:'双图支撑'}}})})
 await page.waitForFunction(()=>workspace.getCells()[0].chart.getDrawings()[0].presentation.name==='双图支撑')
 await page.evaluate(async()=>{await workspace.setLayout(1)})
 assert.equal(await page.evaluate(()=>workspace.getCells()[0].chart.getDrawings().length),1)
 await chart.getByRole('button',{name:'移至 宿主共享',exact:true}).click()
 await page.waitForFunction(()=>workspace.getCells()[0].chart.getDrawingState().sharing.host.status==='saved')
 assert.equal(await page.evaluate(()=>workspace.capture().cells[0].chart.sharedDrawingRefs.length),1)

 const protection=await page.evaluate(async()=>{
   const pro=workspace.getCells()[0].chart,engine=pro.getChart(),identity={namespace:'isolated-shared',symbol:{ticker:'TEST.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'},key=JSON.stringify(['isolated-shared','test','X','TEST.X','USD','raw']),session=await hostSessions.bind({identity,documentId:key}),timestamp=engine.getDataList().at(-10).timestamp
   const make=id=>({logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',lock:false,visible:true,extendData:null,styles:null,points:[{timestamp,value:100},{timestamp:timestamp+60000,value:101}]},anchors:[{kind:'market',timestamp,value:100},{kind:'market',timestamp:timestamp+60000,value:101}],presentation:{scope:'host'}})
   engine.createOverlay({id:'system-collision',name:'rect',points:[{timestamp,value:90},{timestamp:timestamp+60000,value:110}],lock:true})
   await session.history.submit('create','system-collision',make('system-collision'),'programmatic')
   const collision=engine.getOverlays({id:'system-collision'}).map(o=>({name:o.name,lock:o.lock}))
   engine.createOverlay({id:'alert_protected',name:'horizontalStraightLine',points:[{timestamp,value:99}],lock:true})
   await session.history.submit('create','alert_protected',make('alert_protected'),'programmatic')
   pro.setPeriod({multiplier:1,timespan:'day',text:'1D'});await new Promise(r=>setTimeout(r,100))
   const alert=engine.getOverlays({id:'alert_protected'}).map(o=>({name:o.name,lock:o.lock}))
   return {collision,alert}
 })
 assert.deepEqual(protection.collision,[{name:'rect',lock:true}]);assert.deepEqual(protection.alert,[{name:'horizontalStraightLine',lock:true}])
 await page.waitForFunction(()=>workspace.getCells()[0].chart.getDrawingState().sharing?.host)
 const restored=await page.evaluate(async()=>{
   const {captureLayout,restoreLayout}=await import('/src/chart.ts'),pro=workspace.getCells()[0].chart,identity={namespace:'isolated-shared',symbol:{ticker:'TEST.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'},key=JSON.stringify(['isolated-shared','test','X','TEST.X','USD','raw']),host=await hostSessions.bind({identity,documentId:key})
   await host.history.submit('delete','system-collision',null,'programmatic');await host.history.submit('delete','alert_protected',null,'programmatic');await host.save()
   const original=captureLayout(pro),timestamp=pro.getChart().getDataList().at(-10).timestamp,other={logicalId:'alternate-shared',owner:'local',overlay:{id:'alternate-shared',name:'segment',groupId:'drawing_tools',paneId:'candle_pane',lock:false,visible:true,styles:null,extendData:null,points:[{timestamp,value:100},{timestamp:timestamp+60000,value:101}]},anchors:[{kind:'market',timestamp,value:100},{kind:'market',timestamp:timestamp+60000,value:101}],presentation:{scope:'host'}}
   await store.write(identity.namespace,{documentId:'alternate',expectedRevision:null,document:{version:1,key,identity,drawings:[other]}},new AbortController().signal)
   const before=pro.getDrawings().map(d=>d.logicalId),getDrawings=pro.getDrawings.bind(pro);let inject=true,error=''
   pro.getDrawings=()=>{if(inject&&pro.getDrawingState().sharing.host.documentId==='alternate'){inject=false;throw Error('injected after shared adoption')}return getDrawings()}
   try{await restoreLayout(pro,{...original,sharedDrawingRefs:[{namespace:identity.namespace,documentId:'alternate',logicalId:other.logicalId,identity}]})}catch(reason){error=reason.message}finally{pro.getDrawings=getDrawings}
   return {error,before,after:pro.getDrawings().map(d=>d.logicalId),documentId:pro.getDrawingState().sharing.host.documentId,key,refs:captureLayout(pro).sharedDrawingRefs}
 })
 assert.match(restored.error,/injected/);assert.equal(restored.documentId,restored.key);assert.deepEqual(restored.after,restored.before);assert.ok(restored.refs.every(r=>r.documentId===restored.key))

 const guardPage=await browser.newPage({viewport:{width:1400,height:900}});guardPage.setDefaultTimeout(15000);guardPage.on('pageerror',error=>errors.push(error.message));await guardPage.goto(`${process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173'}/tests/browser/drawing-sharing.html?database=tc-sharing-guards-${Date.now()}`);await guardPage.waitForFunction(()=>workspace.getCells()[0]?.chart?.getDrawingState().sharing?.host)
 const guards=await guardPage.evaluate(async()=>{
   const pro=workspace.getCells()[0].chart,engine=pro.getChart(),identity={namespace:'isolated-shared',symbol:{ticker:'TEST.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'},key=JSON.stringify(['isolated-shared','test','X','TEST.X','USD','raw']),host=await hostSessions.bind({identity,documentId:key}),timestamp=engine.getDataList().at(-10).timestamp
   const make=(id,scope)=>({logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',lock:false,visible:true,styles:null,extendData:null,points:[{timestamp,value:100},{timestamp:timestamp+60000,value:101}]},anchors:[{kind:'market',timestamp,value:100},{kind:'market',timestamp:timestamp+60000,value:101}],presentation:{scope}})
   await pro.commitDrawing({kind:'create',logicalId:'permission',after:make('permission','chart'),source:'programmatic'});await pro.executeDrawingCommand({type:'transfer',ids:['permission'],scope:'workspace'});deniedDrawings.add('permission');const undo=await pro.executeDrawingCommand({type:'undo'});const sourcePreserved=workspace.capture().sharedDrawings.some(d=>d.drawings.some(v=>v.logicalId==='permission'));deniedDrawings.clear()
   await host.history.submit('create','cas-source',make('cas-source','host'),'programmatic');await host.save();const row=await store.read(identity.namespace,key,new AbortController().signal);await store.write(identity.namespace,{documentId:key,expectedRevision:row.revision,document:row.document},new AbortController().signal)
   const move=await pro.executeDrawingCommand({type:'transfer',ids:['cas-source'],scope:'chart'}),visible=engine.getOverlays({id:'cas-source'}).map(o=>({id:o.id,name:o.name})),canonical=pro.getDrawings().find(d=>d.logicalId==='cas-source')
   return {undo,sourcePreserved,move,visible,scope:canonical.presentation.scope}
 })
 assert.equal(guards.undo.status,'rejected');assert.equal(guards.sourcePreserved,true);assert.equal(guards.move.status,'rejected');assert.deepEqual(guards.visible,[{id:'cas-source',name:'segment'}]);assert.equal(guards.scope,'host')
 assert.equal(errors.length,0,errors.join('\n'));console.log(JSON.stringify({scenarios:9,errors,passed:true}))
}finally{await browser.close()}
