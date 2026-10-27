import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {launchBrowser} from './support.mjs'

const browser=await launchBrowser(),result={passed:false,results:[],errors:[]},pages=[]
const save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
const open=async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});pages.push(page)
 page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workflow.html`)
 await page.waitForLoadState('networkidle');await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext())
 return page
}
const choose=async(page,id)=>{
 await page.getByRole('button',{name:'全部绘图工具',exact:true}).click()
 await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(id)
 await page.locator('.tc-drawing-tool-choice').click()
}
const pane=page=>page.evaluate(()=>{const r=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y}})
const settled=page=>page.waitForFunction(()=>pro.getDrawingHistoryState().pending===0)
const scenario=async(name,run)=>{if(process.env.TC_AUDIT_CASE&&process.env.TC_AUDIT_CASE!==name)return;result.results.push({scenario:name,...await run(),passed:true});save()}

try{
 await scenario('calculator-replacement',async()=>{
  const page=await open()
  await page.evaluate(async()=>{
   await pro.executeDrawingCommand({type:'preferences',patch:{ui:{snapping:{ohlc:false,indicators:true,weakSensitivity:8}}}})
   await pro.executeDrawingCommand({type:'view',magnet:'weak_magnet'});window.reuseWorkflowSnap=true;prepareWorkflowSnap()
  });await page.waitForFunction(()=>pro.getChart().getIndicators({name:'TC_WORKFLOW_SNAP'})[0].result.length===fixtureBars.length)
  await page.evaluate(()=>{
   const chart=pro.getChart();window.auditShared=chart.getIndicators({name:'TC_WORKFLOW_SNAP'})[0].result
   window.holdWorkflowSnap=true;chart.overrideIndicator({name:'TC_WORKFLOW_SNAP',calcParams:[11]})
  });await page.waitForFunction(()=>workflowSnapJobs.length===1)
  await page.evaluate(()=>pro.getChart().overrideIndicator({name:'TC_WORKFLOW_SNAP',calc:data=>{auditShared.splice(0,auditShared.length,...data.map(bar=>({value:bar.close+17})));return auditShared}}))
  await page.waitForFunction(()=>pro.getChart().getIndicators({name:'TC_WORKFLOW_SNAP'})[0].result.at(-1).value===fixtureBars.at(-1).close+17)
  const seed=()=>page.evaluate(async()=>{
   await pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)})
   const chart=pro.getChart(),bars=chart.getDataList(),a={timestamp:bars.at(-1).timestamp,value:bars.at(-1).close},b={timestamp:bars.at(-10).timestamp,value:bars.at(-10).close},id='audit-snap'
   pro.restoreDrawings('local',[{logicalId:id,owner:'local',yAxisId:chart.getYAxes({paneId:'candle_pane'})[0].id,anchors:[{kind:'market',...a},{kind:'market',...b}],overlay:{id,name:'segment',paneId:'candle_pane',groupId:'drawing_tools',points:[a,b],lock:false,visible:true,styles:null,extendData:null}}])
   await pro.executeDrawingCommand({type:'select',ids:[id]});await frame();return bars.at(-1).close
  })
  const drag=async value=>{
   const target=await page.evaluate(value=>{const chart=pro.getChart(),d=pro.getDrawings()[0],r=chart.getDom('candle_pane','main').getBoundingClientRect(),p=chart.convertToPixel({...d.overlay.points[0],value},{paneId:'candle_pane',yAxisId:d.yAxisId});return {x:r.x+p.x,y:r.y+p.y+2}},value)
   const handle=page.getByRole('button',{name:'绘图控制点 1 · segment',exact:true});await handle.waitFor();const box=await handle.boundingBox()
   await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:4});await page.mouse.up();await settled(page);await page.evaluate(()=>frame())
   return page.evaluate(()=>({actual:pro.getDrawings()[0].anchors[0].value,hint:document.querySelector('.tc-drawing-input-status')?.textContent}))
  }
  const close=await seed(),before=await drag(close+17);assert.ok(Math.abs(before.actual-close-17)<1e-8)
  await page.evaluate(()=>releaseWorkflowSnapJob(0));await page.waitForFunction(()=>pro.getChart().getIndicators({name:'TC_WORKFLOW_SNAP'})[0].result.at(-1).value===fixtureBars.at(-1).close+11)
  await seed();const stale=await drag(close+11);assert.ok(Math.abs(stale.actual-close-11)>1e-6,'A replaced calculator must not authorize its aliased late result');assert.doesNotMatch(stale.hint??'',/吸附测试线/)
  await page.evaluate(()=>pro.getChart().overrideIndicator({name:'TC_WORKFLOW_SNAP',calcParams:[19]}));await page.waitForFunction(()=>pro.getChart().getIndicators({name:'TC_WORKFLOW_SNAP'})[0].result.at(-1).value===fixtureBars.at(-1).close+17)
  await seed();const recovered=await drag(close+17);assert.ok(Math.abs(recovered.actual-close-17)<1e-8)
  assert.deepEqual(await page.evaluate(()=>destroy()),{subscriptions:0,dom:0});await page.close();return {close,before,stale,recovered}
 })

 await scenario('binding-cancels-preview',async()=>{
  const page=await open();await page.evaluate(()=>destroy())
  await page.evaluate(async()=>{
   const {KLineChartPro,DrawingSessionRegistry,createIndexedDBDrawingDocumentStore}=await import('/src/chart.ts')
   window.auditDB='tc-binding-audit-'+crypto.randomUUID();window.auditStore=createIndexedDBDrawingDocumentStore({databaseName:auditDB});window.auditRegistry=new DrawingSessionRegistry({scope:'host',store:auditStore});window.auditTarget='copy'
   const symbol={ticker:'AUDIT.X',market:'test',exchange:'X',priceCurrency:'USD',pricePrecision:4};window.auditIdentity={namespace:'audit',symbol:{ticker:symbol.ticker,market:symbol.market,exchange:symbol.exchange,priceCurrency:symbol.priceCurrency},priceBasisKey:'raw'}
   window.auditReady=false;window.pro=new KLineChartPro({container:document.querySelector('#chart'),symbol,period:{multiplier:1,timespan:'minute',text:'1m'},mainIndicators:[],subIndicators:[],drawingHostSessions:auditRegistry,resolveDrawingShareKey:()=>({identity:auditIdentity,documentId:'source'}),createDrawingDocumentId:async()=>auditTarget,onDataReady:()=>window.auditReady=true,datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:fixtureBars,basis:'raw',hasMoreBefore:false}),subscribe:()=>{},unsubscribe:()=>{}}})
  });await page.waitForFunction(()=>auditReady&&pro.getDrawingState().sharing?.host?.documentId==='source')
  const manager=page.getByRole('complementary',{name:'绘图管理',exact:true})
  await page.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('combobox',{name:'新绘图作用域',exact:true}).selectOption('host');await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
  await choose(page,'fibonacciLine');const area=await pane(page);await page.mouse.click(area.x+280,area.y+150)
  const old=await page.evaluate(()=>{window.auditOldPreview=pro.getChart().getOverlays().find(o=>o.currentStep!==-1);return {id:auditOldPreview.id,step:auditOldPreview.currentStep}});assert.equal(old.step,2)
  await page.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('button',{name:'另存共享草稿',exact:true}).click()
  await page.waitForFunction(()=>pro.getDrawingState().sharing.host.documentId==='copy'&&pro.getDrawingState().sharing.host.status==='saved')
  assert.deepEqual(await page.evaluate(()=>({tool:pro.getDrawingState().toolId,previews:pro.getChart().getOverlays().filter(o=>o.currentStep!==-1).map(o=>o.id)})),{tool:null,previews:[]})
  await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click();await page.mouse.click(area.x+430,area.y+250);await page.evaluate(()=>frame());assert.equal(await page.evaluate(()=>pro.getDrawings().length),0)
  await choose(page,'fibonacciLine');await page.mouse.click(area.x+270,area.y+140)
  const next=await page.evaluate(()=>pro.getChart().getOverlays().find(o=>o.currentStep!==-1).id)
  // Deliver a removed engine object's delayed callback while the successor is drawing.
  await page.evaluate(()=>auditOldPreview.onDrawEnd({overlay:auditOldPreview}))
  assert.equal(await page.evaluate(()=>pro.getChart().getOverlays().find(o=>o.currentStep!==-1).id),next);assert.equal(await page.evaluate(()=>pro.getDrawings().length),0)
  await page.mouse.click(area.x+440,area.y+260);await page.waitForFunction(()=>pro.getDrawings().length===1&&pro.getDrawingHistoryState().pending===0)
  assert.equal(await page.evaluate(()=>pro.getDrawings()[0].logicalId),next);assert.notEqual(next,old.id)
  await page.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('button',{name:'保存共享绘图',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingState().sharing.host.status==='saved');await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
  const stored=await page.evaluate(async()=>({source:(await auditRegistry.bind({identity:auditIdentity,documentId:'source'})).capture().drawings,copy:(await auditStore.read('audit','copy',new AbortController().signal)).document.drawings}));assert.equal(stored.source.length,0);assert.deepEqual(stored.copy.map(d=>d.logicalId),[next])
  await page.evaluate(async()=>{
   const {captureLayout}=await import('/src/chart.ts');window.auditLayout=captureLayout(pro)
   const target=await auditRegistry.bind({identity:auditIdentity,documentId:'restored'}),value=structuredClone(pro.getDrawings()[0]);value.logicalId=value.overlay.id='restored-drawing';await target.history.submit('create',value.logicalId,value,'programmatic');await target.save()
  })
  await choose(page,'fibonacciLine');await page.mouse.click(area.x+290,area.y+160)
  await page.evaluate(async()=>{
   const {restoreLayout}=await import('/src/chart.ts');window.auditRestorePreview=pro.getChart().getOverlays().find(o=>o.currentStep!==-1)
   await restoreLayout(pro,{...auditLayout,sharedDrawingRefs:[{namespace:'audit',documentId:'restored',logicalId:'restored-drawing',identity:auditIdentity}]})
  });await page.waitForFunction(()=>pro.getDrawingState().sharing.host.documentId==='restored')
  assert.deepEqual(await page.evaluate(()=>({tool:pro.getDrawingState().toolId,previews:pro.getChart().getOverlays().filter(o=>o.currentStep!==-1).map(o=>o.id)})),{tool:null,previews:[]})
  await page.evaluate(()=>auditRestorePreview.onDrawEnd({overlay:auditRestorePreview}));await page.evaluate(()=>frame());assert.deepEqual(await page.evaluate(()=>pro.getDrawings().map(d=>d.logicalId)),['restored-drawing'])
  await page.evaluate(()=>pro.executeDrawingCommand({type:'scope',scope:'host'}));await choose(page,'fibonacciLine');await page.mouse.click(area.x+260,area.y+150)
  await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.down('Space')
  const space=await page.evaluate(async()=>{window.auditTarget='space-copy';return pro.executeDrawingCommand({type:'shared',scope:'host',action:'save-as'})});assert.equal(space.status,'completed');await page.keyboard.up('Space')
  assert.deepEqual(await page.evaluate(()=>({tool:pro.getDrawingState().toolId,previews:pro.getChart().getOverlays().filter(o=>o.currentStep!==-1).map(o=>o.id),ids:pro.getDrawings().map(d=>d.logicalId)})),{tool:null,previews:[],ids:['restored-drawing']})
  await choose(page,'textAnnotation');await page.mouse.click(area.x+320,area.y+180)
  await page.getByRole('dialog',{name:'编辑绘图文字',exact:true}).waitFor()
  const text=await page.evaluate(async()=>{window.auditTarget='text-copy';return pro.executeDrawingCommand({type:'shared',scope:'host',action:'save-as'})});assert.equal(text.status,'completed')
  assert.equal(await page.getByRole('dialog',{name:'编辑绘图文字',exact:true}).count(),0)
  assert.deepEqual(await page.evaluate(()=>({tool:pro.getDrawingState().toolId,ids:pro.getDrawings().map(d=>d.logicalId),native:pro.getChart().getOverlays().map(o=>o.id)})),{tool:null,ids:['restored-drawing'],native:['restored-drawing']})
  await page.evaluate(async()=>{pro.dispose();auditRegistry.dispose();auditStore.dispose();await frame();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(auditDB);r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Owned drawing database is still open'))})})
  await page.close();return {cancelled:old.id,successor:next,persisted:stored.copy.map(d=>d.logicalId),layoutRestored:true,lateCallbacksRejected:true,spaceCancelled:true,pendingTextCancelled:true}
 })

 await scenario('catalog-preview-authority',async()=>{
  const page=await open();await page.evaluate(()=>destroy());const cases=[]
  for(const toolId of ['fibonacciLine','fibonacciExtension'])for(const customParameter of [false,true]){
   await page.evaluate(async({toolId,customParameter})=>{
    const {KLineChartPro,builtinDrawingCatalog}=await import('/src/chart.ts');if(window.auditMounted)pro.dispose();document.querySelector('#chart').replaceChildren();window.auditReady=false
    const catalog=structuredClone(builtinDrawingCatalog),tool=catalog.find(t=>t.toolId===toolId)
    tool.parameters=tool.parameters.map(p=>({...p,...(p.key==='calculationMode'?{defaultValue:'log'}:p.key==='extendRight'||p.key==='extendLeft'?{defaultValue:false}:{})}));if(customParameter)tool.parameters.push({key:'hostValue',label:'宿主参数',kind:'number',defaultValue:2})
    window.pro=new KLineChartPro({container:document.querySelector('#chart'),symbol:{ticker:'AUDIT',pricePrecision:4},period:{multiplier:1,timespan:'minute',text:'1m'},mainIndicators:[],subIndicators:[],drawingCatalog:catalog,onDataReady:()=>window.auditReady=true,datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:fixtureBars,basis:'raw',hasMoreBefore:false}),subscribe:()=>{},unsubscribe:()=>{}}});window.auditMounted=true
   },{toolId,customParameter});await page.waitForFunction(()=>auditReady&&pro.getAnalysisContext())
   if(customParameter)await page.evaluate(toolId=>pro.executeDrawingCommand({type:'preferences',patch:{templates:[{id:'host-preset',name:'宿主模板',toolId,styles:{},parameters:{hostValue:2}}]}}),toolId)
   await page.getByRole('button',{name:'全部绘图工具',exact:true}).click();await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(toolId)
   if(customParameter){await page.getByRole('combobox',{name:/绘前模板$/}).selectOption('host-preset');await page.getByRole('button',{name:'使用模板绘制',exact:true}).click()}else await page.locator('.tc-drawing-tool-choice').click()
   await page.getByRole('button',{name:'连续绘制',exact:true}).click()
   const area=await pane(page),count=toolId==='fibonacciLine'?2:3
   for(const path of ['initial','continuous','space-restored']){
    if(path==='space-restored'){
     await page.mouse.click(area.x+260,area.y+120);await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.down('Space');await page.keyboard.up('Space')
    }
    await page.evaluate(()=>{const overlay=pro.getChart().getOverlays().find(o=>o.currentStep!==-1),draw=overlay.createPointFigures;window.auditPreviewDraws=[];overlay.createPointFigures=args=>{const figures=draw(args);auditPreviewDraws.push({figures,points:structuredClone(args.overlay.points)});return figures}})
    for(let index=path==='space-restored'?1:0;index<count-1;index++)await page.mouse.click(area.x+260+index*100,area.y+120+index*80)
    const x=area.x+260+(count-1)*100,y=area.y+120+(count-1)*80;await page.mouse.move(x,y,{steps:3});await page.evaluate(()=>frame())
    const before=await page.evaluate(()=>auditPreviewDraws.at(-1)),previous=await page.evaluate(()=>pro.getDrawings().map(d=>d.logicalId))
    await page.mouse.click(x,y);await page.waitForFunction(n=>pro.getDrawings().length===n+1&&pro.getDrawingHistoryState().pending===0&&pro.getChart().getOverlays().some(o=>o.currentStep!==-1),previous.length)
    const after=await page.evaluate(async({toolId,previous})=>{
     const chart=pro.getChart(),drawing=pro.getDrawings().find(d=>!previous.includes(d.logicalId)),overlay=chart.getOverlays({id:drawing.logicalId})[0],draw=overlay.createPointFigures;let figures
     overlay.createPointFigures=args=>{figures=draw(args);return figures};chart.resize();await frame();overlay.createPointFigures=draw
     const [a,b,c]=drawing.anchors.map(p=>p.value),expected=toolId==='fibonacciLine'?Math.sqrt(a*b):Math.exp(Math.log(c)+(Math.log(b)-Math.log(a))*.5),axis=chart.getYAxes({paneId:'candle_pane'})[0]
     return {figures,drawing,expectedY:axis.convertToPixel(expected)}
    },{toolId,previous})
    const halfId=after.drawing.parameters.levels.items.find(level=>level.value===.5).id,half=figures=>figures.find(f=>f.key==='fibonacci-level:'+halfId)?.attrs.coordinates
    assert.deepEqual(before.figures.filter(f=>f.key==='fibonacci-warning'),[]);assert.deepEqual(after.figures.filter(f=>f.key==='fibonacci-warning'),[])
    const a=half(before.figures),b=half(after.figures);assert.ok(a&&b,JSON.stringify({toolId,customParameter,path,before,after}));assert.deepEqual(a,b);assert.equal(b[0].y,after.expectedY);assert.ok(b[0].x>0&&b[1].x<988)
    assert.deepEqual(before.points.map(({timestamp,value})=>({timestamp,value})),after.drawing.anchors.map(({timestamp,value})=>({timestamp,value})))
    if(customParameter)assert.equal(after.drawing.parameters.hostValue,2)
    cases.push({toolId,customParameter,path,half:b,expectedY:after.expectedY})
   }
   await page.keyboard.press('Escape')
  }
  await page.evaluate(()=>pro.dispose());await page.close();return {cases}
 })
 assert.deepEqual(result.errors,[]);result.passed=true;save();console.log(JSON.stringify({passed:true,scenarios:result.results.length}))
}catch(error){result.failure=error.stack;for(const page of pages)if(!page.isClosed())await page.screenshot({path:process.env.TC_BROWSER_EVIDENCE+'/failure.png'}).catch(()=>{});save();throw error}
finally{await browser.close()}
