import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import path from 'node:path'

const browser=await launchBrowser(),result={syntheticInputs:true,scope:'isolated-real-engine',scenarios:[],errors:[]}
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}})
 page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workbench.html?database=audit-fix-${Date.now()}`)
 await page.waitForFunction(()=>window.ready)
 await page.evaluate(async()=>{
  const {builtinDrawingCatalog}=await import('/src/chart.ts'),{analysisZoneDescriptor}=await import('/examples/drawing-workbench/analysis-zone.mjs'),{registerOverlay}=await import('/tests/browser/drawing-refinement-audit-peer.mjs')
  window.auditCatalog=[...builtinDrawingCatalog,analysisZoneDescriptor]
  for(const [suffix,type,styles,controls]of [
   ['Circle','circle',{circle:{borderColor:'#f44336',borderSize:5,borderStyle:'dashed',borderDashedValue:[1,3]}},['stroke','lineWidth','lineStyle']],
   ['Text','text',{text:{color:'#112233',size:18}},['textColor','fontSize']],
   ['Multi','line',{line:{color:'#123456',size:2,style:'dashed',dashedValue:[6,4]},polygon:{borderColor:'#f44336',borderSize:5,borderStyle:'dashed',borderDashedValue:[1,3]}},['stroke','lineWidth','lineStyle']]
  ]){
   const name='AUDIT/'+suffix
   registerOverlay({name,totalStep:3,styles,createPointFigures:({coordinates})=>coordinates.length<2?[]:suffix==='Multi'?[{type:'line',attrs:{coordinates}},{type:'polygon',styles:{style:'stroke_fill'},attrs:{coordinates:[coordinates[0],{x:coordinates[1].x,y:coordinates[0].y},coordinates[1]]}}]:[{type,ignoreEvent:type==='text',attrs:type==='text'?{...coordinates[0],text:'第三方正文'}:{...coordinates[0],r:25}}]})
   auditCatalog.push({...analysisZoneDescriptor,toolId:'audit-'+suffix,overlayName:name,styleControls:controls,parameters:[]})
  }
  window.auditMake=(id,name,styles=null,parameters={})=>{
   const bars=pro.getChart().getDataList(),count=name==='textAnnotation'?1:name==='doubleCurve'?4:['curve','arc'].includes(name)?3:name==='xabcd'?5:2
   const anchors=Array.from({length:count},(_,i)=>{const b=bars.at(-40+i*4);return {kind:'market',timestamp:b.timestamp,value:b.close+(i%2?2:-2)}})
   return {logicalId:id,owner:'local',anchors,parameters,overlay:{id,name,paneId:'candle_pane',groupId:'drawing_tools',points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),styles,extendData:name==='callout'?'气泡正文':null,lock:false,visible:true}}
  }
  window.auditReadFigures=async id=>{
   const chart=pro.getChart(),overlay=chart.getOverlays({id})[0],draw=overlay.createPointFigures;let figures=[]
   overlay.createPointFigures=args=>{figures=draw(args);return figures};chart.resize();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));overlay.createPointFigures=draw
   return figures.map(figure=>({type:figure.type,styles:{...chart.getStyles().overlay[figure.type],...overlay.styles?.[figure.type],...figure.styles}}))
  }
 })
 const mount=async(styles)=>{
  await page.evaluate(styles=>{
   const KLineChartPro=pro.constructor;pro.dispose();window.auditReady=false
   window.pro=new KLineChartPro({container:document.querySelector('#chart'),drawingCatalog:auditCatalog,styles,drawingPreferencesStore:preferenceStore,drawingPreferencesScope:'audit-fix',symbol:{ticker:'TEST.X',pricePrecision:2},period:{multiplier:1,timespan:'minute',text:'1m'},mainIndicators:[],subIndicators:[],onDataReady:()=>window.auditReady=true,datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:fixtureBars,basis:'isolated-raw',hasMoreBefore:false}),subscribe:()=>{},unsubscribe:()=>{}}})
  },styles)
  await page.waitForFunction(()=>window.auditReady&&pro.getDrawingState().preferences.status!=='loading')
 }
 const restore=async(name,styles=null,parameters={})=>{
  await page.evaluate(async({name,styles,parameters})=>{pro.restoreDrawings('local',[auditMake('subject',name,styles,parameters)]);await pro.executeDrawingCommand({type:'select',ids:['subject']});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},{name,styles,parameters})
 }
 const properties=page.getByRole('region',{name:'绘图属性'}),manager=page.getByRole('complementary',{name:'绘图管理'})
 for(const name of ['curve','doubleCurve','arc']){
  await mount();await restore(name)
  assert.equal(await properties.getByRole('combobox',{name:'线宽',exact:true}).inputValue(),'2')
  assert.equal(await properties.getByRole('combobox',{name:'线型',exact:true}).inputValue(),'solid')
  await properties.getByRole('button',{name:'绘图设置',exact:true}).click()
  const width=manager.getByRole('combobox',{name:'线宽',exact:true});assert.equal(await width.inputValue(),'2')
  await width.selectOption('4');assert.equal(await width.inputValue(),'4')
  assert.equal(await page.evaluate(()=>pro.getDrawings()[0].overlay.styles),null)
  await manager.getByRole('button',{name:'取消修改',exact:true}).click();await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
  assert.equal(await page.evaluate(()=>pro.getDrawingHistoryState().canUndo),false)
  await properties.getByRole('button',{name:'绘图设置',exact:true}).click();assert.equal(await width.inputValue(),'2')
  await width.selectOption('4');await manager.getByRole('button',{name:'确认修改',exact:true}).click()
  const state=await page.evaluate(()=>({drawing:pro.getDrawings()[0],native:pro.getChart().getOverlays({id:'subject'})[0].styles}))
  assert.equal(state.native.line.size,4);assert.deepEqual(state.drawing.overlay.styles,{line:{size:4},arc:{size:4},polygon:{borderSize:4},rect:{borderSize:4},circle:{borderSize:4}})
  await page.evaluate(()=>pro.undoDrawing());assert.equal(await page.evaluate(()=>pro.getDrawings()[0].overlay.styles),null)
  assert.equal(await page.evaluate(()=>pro.getDrawingHistoryState().canUndo),false)
  result.scenarios.push({scenario:`${name}-resolved-default-draft-cancel-confirm-once-undo`,passed:true})
 }
 await mount({overlay:{line:{size:2.5,color:'#123456',style:'dashed',dashedValue:[1,3]}}});await restore('segment')
 assert.equal(await properties.getByRole('combobox',{name:'线宽',exact:true}).inputValue(),'2.5')
 await properties.getByRole('button',{name:'绘图设置',exact:true}).click();assert.equal(await manager.getByRole('combobox',{name:'线宽',exact:true}).inputValue(),'2.5')
 assert.equal(await manager.getByRole('combobox',{name:'线型',exact:true}).inputValue(),'dotted')
 result.scenarios.push({scenario:'host-global-style-defaults-agree',passed:true})

 for(const name of ['EXAMPLE/AnalysisZone','AUDIT/Circle','AUDIT/Text']){
  await mount()
  const observed=await page.evaluate(async name=>{
   const text=name.endsWith('Text'),group=name.endsWith('Circle')?'circle':'polygon',source=text?{text:{color:'#112233',size:18}}:{[group]:{borderColor:'#f44336',borderSize:5,borderStyle:'dashed',borderDashedValue:[1,3]}},target=text?'textAnnotation':'segment',initial=text?{text:{color:'#abcdef',size:12}}:{line:{color:'#123456',size:2,style:'solid'}}
   pro.restoreDrawings('local',[auditMake('source',name,source,name==='EXAMPLE/AnalysisZone'?{midline:false}:{}),auditMake('target',target,initial)])
   const saved=await pro.executeDrawingCommand({type:'template',action:'save',ids:['source'],name}),preset=pro.getDrawingState().preferences.value.templates.at(-1),applied=await pro.executeDrawingCommand({type:'template',action:'apply',templateId:preset.id,ids:['target'],styleOnly:true})
   const after=pro.getDrawings().find(d=>d.logicalId==='target'),native=pro.getChart().getOverlays({id:'target'})[0].styles
   const undo=await pro.executeDrawingCommand({type:'undo'}),restored=pro.getDrawings().find(d=>d.logicalId==='target').overlay.styles,redo=await pro.executeDrawingCommand({type:'redo'})
   window.auditSavedTemplate=preset.id
   return {text,saved,applied,after,native,undo,restored,initial,redo,drawings:pro.getDrawings(),sourceFigures:await auditReadFigures('source'),targetFigures:await auditReadFigures('target')}
  },name)
  assert.equal(observed.saved.status,'completed');assert.equal(observed.applied.status,'completed')
  if(observed.text){assert.equal(observed.native.text.color,'#112233');assert.equal(observed.native.text.size,18)}
  else{assert.equal(observed.native.line.color,'#f44336');assert.equal(observed.native.line.size,5);assert.deepEqual(observed.native.line.dashedValue,[1,3])}
  const sourceFigure=observed.sourceFigures.find(f=>f.type===(observed.text?'text':name.endsWith('Circle')?'circle':'polygon')),targetFigure=observed.targetFigures.find(f=>observed.text?['text','rectText'].includes(f.type):f.type==='line')
  assert.ok(sourceFigure&&targetFigure)
  if(observed.text){assert.equal(sourceFigure.styles.color,'#112233');assert.equal(targetFigure.styles.color,'#112233');assert.equal(targetFigure.styles.size,18)}
  else{assert.equal(sourceFigure.styles.borderColor,'#f44336');assert.equal(sourceFigure.styles.borderSize,5);assert.equal(targetFigure.styles.color,'#f44336');assert.equal(targetFigure.styles.size,5)}
  assert.deepEqual(observed.restored,observed.initial);assert.equal(observed.undo.status,'completed');assert.equal(observed.redo.status,'completed')
  await page.waitForFunction(()=>pro.getDrawingState().preferences.status==='saved')
  const templateId=await page.evaluate(()=>auditSavedTemplate)
  await mount();assert.equal(await page.evaluate(id=>pro.getDrawingState().preferences.value.templates.some(t=>t.id===id),templateId),true)
  await page.evaluate(drawings=>pro.restoreDrawings('local',JSON.parse(JSON.stringify(drawings))),observed.drawings)
  assert.deepEqual(await page.evaluate(()=>pro.getDrawings().find(d=>d.logicalId==='target').overlay.styles),observed.after.overlay.styles)
  result.scenarios.push({scenario:`${name}-common-template-native-IDB-reopen-once-history`,passed:true})
 }
 await mount();await restore('AUDIT/Multi')
 assert.equal(await page.evaluate(async()=>(await auditReadFigures('subject')).find(f=>f.type==='polygon').styles.style),'stroke_fill')
 assert.equal(await properties.getByRole('combobox',{name:'线宽',exact:true}).inputValue(),'')
 assert.equal(await properties.getByRole('combobox',{name:'线型',exact:true}).inputValue(),'')
 await properties.getByRole('button',{name:'绘图设置',exact:true}).click()
 assert.equal(await manager.getByRole('combobox',{name:'线型',exact:true}).inputValue(),'')
 assert.equal(await manager.getByRole('button',{name:'描边颜色',exact:true}).textContent(),'混合或未设置')
 assert.equal(await page.evaluate(()=>pro.getDrawings()[0].overlay.styles),null)
 result.scenarios.push({scenario:'multiple-real-figure-groups-remain-mixed-without-canonical-writes',passed:true})
 await mount();await restore('regressionChannel',{line:{color:'#f44336',size:4}})
 assert.equal(await properties.getByRole('combobox',{name:'线宽',exact:true}).inputValue(),'4')
 await properties.getByRole('button',{name:'绘图设置',exact:true}).click()
 assert.equal(await manager.getByRole('combobox',{name:'线宽',exact:true}).inputValue(),'4')
 assert.equal(await manager.getByRole('button',{name:'描边颜色',exact:true}).textContent(),'#f44336')
 result.scenarios.push({scenario:'fill-only-channel-polygon-does-not-pollute-line-only-overrides',passed:true})
 await mount();await restore('callout')
 await properties.getByRole('button',{name:'绘图设置',exact:true}).click()
 assert.equal(await manager.getByRole('button',{name:'填充颜色',exact:true}).textContent(),'rgba(22, 119, 255, 0.15)')
 assert.equal(await page.evaluate(()=>pro.getDrawings()[0].overlay.styles),null)
 result.scenarios.push({scenario:'callout-body-default-background-excludes-fixed-anchor-dot',passed:true})
 await mount();await restore('fixedRangeVolumeProfile')
 await page.waitForFunction(()=>pro.getDrawingState().analytics.subject?.status==='ready')
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
 await properties.getByRole('button',{name:'绘图设置',exact:true}).click()
 assert.equal(await manager.getByRole('button',{name:'描边颜色',exact:true}).textContent(),'#1677ff')
 result.scenarios.push({scenario:'profile-computed-bars-read-the-original-line-color-input',passed:true})
 await mount()
 const partialDash=await page.evaluate(async()=>{
  const source={line:{style:'dashed',dashedValue:[6,4]},polygon:{borderDashedValue:[1,3]}},before={line:{style:'solid'},polygon:{borderStyle:'dashed',borderDashedValue:[8,2]}}
  pro.restoreDrawings('local',[auditMake('source','AUDIT/Multi',source),auditMake('target','AUDIT/Multi',before)])
  await pro.executeDrawingCommand({type:'template',action:'save',ids:['source'],name:'Partial dash'})
  const preset=pro.getDrawingState().preferences.value.templates.at(-1),result=await pro.executeDrawingCommand({type:'template',action:'apply',templateId:preset.id,ids:['target'],styleOnly:true}),after=pro.getDrawings().find(d=>d.logicalId==='target').overlay.styles
  const figures=await auditReadFigures('target');await pro.executeDrawingCommand({type:'undo'});const undone=pro.getDrawings().find(d=>d.logicalId==='target').overlay.styles;await pro.executeDrawingCommand({type:'redo'})
  return {result,source,before,after,figures,undone,redone:pro.getDrawings().find(d=>d.logicalId==='target').overlay.styles}
 })
 assert.equal(partialDash.result.status,'completed');assert.deepEqual(partialDash.after.polygon.borderDashedValue,[1,3]);assert.deepEqual(partialDash.after.line.dashedValue,[6,4])
 assert.deepEqual(partialDash.figures.find(f=>f.type==='polygon').styles.borderDashedValue,[1,3]);assert.deepEqual(partialDash.undone,partialDash.before);assert.deepEqual(partialDash.redone,partialDash.after)
 result.scenarios.push({scenario:'partial-explicit-dash-fields-native-figure-and-once-history',passed:true})
 for(const [name,control,value]of [['regressionChannel','填充颜色','#4caf50'],['xabcd','文字颜色','#f44336'],['trendAngle','文字颜色','#2196f3']]){
  await mount();await restore(name)
  await properties.getByRole('button',{name:control,exact:true}).click();await properties.getByRole('button',{name:value,exact:true}).click()
  await page.waitForFunction(({name,value})=>{const styles=pro.getDrawings()[0].overlay.styles;return name==='regressionChannel'?styles?.polygon?.color===value:styles?.text?.color===value},{name,value})
  const actual=await page.evaluate(async()=>{
   const chart=pro.getChart(),overlay=chart.getOverlays({id:'subject'})[0],draw=overlay.createPointFigures;let figures
   overlay.createPointFigures=args=>{figures=draw(args);return figures};chart.resize();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));overlay.createPointFigures=draw
   return {figures,styles:overlay.styles}
  })
  assert.ok(actual.figures.some(f=>f.type===(name==='regressionChannel'?'polygon':'text')&&f.ignoreEvent===true))
  await properties.getByRole('button',{name:'绘图设置',exact:true}).click()
  assert.equal(await manager.getByRole('button',{name:control,exact:true}).textContent(),value)
  result.scenarios.push({scenario:`${name}-noninteractive-real-style-consumer`,passed:true})
 }
 for(const action of ['update','delete','undo','redo']){
  await mount()
  const permission=await page.evaluate(async action=>{
   const KLineChartPro=pro.constructor;pro.dispose();window.auditEditable=true;window.auditWrites=0;window.auditRevokeAt=null;window.auditArmed=false;window.auditReady=false
   window.pro=new KLineChartPro({container:document.querySelector('#chart'),symbol:{ticker:'TEST.X',pricePrecision:2},period:{multiplier:1,timespan:'minute',text:'1m'},mainIndicators:[],subIndicators:[],isDrawingEditable:()=>auditEditable,onDataReady:()=>window.auditReady=true,onOverlayUpdate:confirmed,onOverlayDelete:confirmed,datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:fixtureBars,basis:'isolated-raw',hasMoreBefore:false}),subscribe:()=>{},unsubscribe:()=>{}}})
   function confirmed(){if(!auditArmed)return;auditWrites++;if(auditWrites===1){setTimeout(()=>{auditEditable=false;auditRevokeAt=auditWrites},0);const end=performance.now()+150;while(performance.now()<end){}}}
   while(!auditReady)await new Promise(r=>setTimeout(r,1))
   const drawings=Array.from({length:130},(_,i)=>auditMake('policy-'+i,'segment')),ids=drawings.map(d=>d.logicalId),patch={overlay:{styles:{line:{color:'#f44336'}}}}
   pro.restoreDrawings('local',drawings)
   if(action==='undo'||action==='redo')await pro.executeDrawingCommand({type:'update',ids,patch})
   if(action==='redo')await pro.executeDrawingCommand({type:'undo'})
   auditArmed=true;const result=await pro.executeDrawingCommand(action==='update'?{type:action,ids,patch}:action==='delete'?{type:action,ids}:{type:action})
   const changed=pro.getDrawings().filter(d=>d.overlay.styles?.line?.color==='#f44336').length,count=pro.getDrawings().length
   auditArmed=false;auditEditable=true
   if(action==='update'||action==='delete')await pro.executeDrawingCommand({type:'undo'})
   return {result,changed,count,revokedAt:auditRevokeAt,writes:auditWrites,pending:pro.getDrawingHistoryState().pending,undoCount:pro.getDrawings().length,undoRemaining:pro.getDrawingHistoryState().canUndo}
  },action)
  assert.equal(permission.revokedAt,1);assert.equal(permission.writes,1);assert.equal(permission.result.status,'partial')
  assert.deepEqual(permission.result.items.map(i=>i.status),['confirmed','rejected',...Array(128).fill('not-attempted')]);assert.equal(permission.pending,0)
  if(action==='delete')assert.equal(permission.count,129);else assert.equal(permission.changed,action==='undo'?129:1)
  if(action==='delete'||action==='update'){assert.equal(permission.undoCount,130);assert.equal(permission.undoRemaining,false)}
  result.scenarios.push({scenario:`${action}-policy-change-in-real-cooperative-yield`,passed:true})
 }
 assert.deepEqual(result.errors,[]);result.passed=true
 await page.screenshot({path:path.join(path.dirname(process.argv[2]),'completed.png')})
 await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()})
}finally{writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');await browser.close()}
