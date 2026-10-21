import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),results=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workbench.html?database=audit-${Date.now()}`);await page.waitForFunction(()=>window.ready)
 const seed=async(name='segment',owner='local',axisId)=>page.evaluate(async({name,owner,axisId})=>{
   await pro.executeDrawingCommand({type:'select',ids:[]});await pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)})
   const chart=pro.getChart(),paneId='candle_pane',filter={paneId,yAxisId:axisId},pixels=name==='horizontalSegment'?[{x:280,y:150},{x:500,y:150}]:name==='verticalSegment'?[{x:280,y:150},{x:280,y:240}]:[{x:280,y:150},{x:500,y:240}],points=chart.convertFromPixel(pixels,filter),id=`audit-${name}`
   const drawing={logicalId:id,owner,backendId:owner==='backend'?'audit-backend':undefined,yAxisId:axisId??chart.getYAxes({paneId})[0].id,anchors:points.map(p=>({kind:'market',timestamp:p.timestamp,value:p.value})),overlay:{id,name,paneId,groupId:'drawing_tools',points,visible:true,lock:false,extendData:null,styles:null}}
   pro.restoreDrawings(owner,[drawing]);await pro.executeDrawingCommand({type:'select',ids:[id]});return pro.getDrawings()[0]
 },{name,owner,axisId})
 const handle=()=>page.getByRole('button',{name:/^绘图控制点 1 ·/})
 const drag=async(dx,dy,cancel=false)=>{const h=await handle().boundingBox();await page.mouse.move(h.x+22,h.y+22);await page.mouse.down();await page.mouse.move(h.x+22+dx,h.y+22+dy,{steps:4});if(cancel)await handle().dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});await page.mouse.up()}
 for(const name of ['segment','horizontalSegment','verticalSegment']){
  const before=await seed(name);await drag(60,20);await page.waitForFunction(before=>JSON.stringify(pro.getDrawings()[0].anchors)!==JSON.stringify(before.anchors),before)
  const after=await page.evaluate(()=>pro.getDrawings()[0]);assert.notEqual(after.anchors[0].timestamp,before.anchors[0].timestamp);assert.notEqual(after.anchors[0].value,before.anchors[0].value)
  if(name==='horizontalSegment')assert.equal(after.anchors[0].value,after.anchors[1].value)
  if(name==='verticalSegment')assert.equal(after.anchors[0].timestamp,after.anchors[1].timestamp)
  await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(before=>JSON.stringify(pro.getDrawings()[0].anchors)===JSON.stringify(before.anchors),before)
  results.push({scenario:`control-point-${name}-xy-constraint-single-undo`,passed:true})
 }
 for(const owner of ['local','backend']){
  const before=await seed('segment',owner);await page.evaluate(()=>{const chart=pro.getChart(),old=chart.scrollByDistance.bind(chart);window.panCalls=[];chart.scrollByDistance=(...args)=>{panCalls.push(args);return old(...args)}});const body=await page.evaluate(()=>{const d=pro.getDrawings()[0],chart=pro.getChart(),r=chart.getDom('candle_pane','main').getBoundingClientRect(),ps=d.overlay.points.map(p=>chart.convertToPixel(p,{paneId:'candle_pane',yAxisId:d.yAxisId}));return {x:r.x+(ps[0].x+ps[1].x)/2,y:r.y+(ps[0].y+ps[1].y)/2,range:chart.getVisibleRange(),writes:commits.length}})
  await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.down('Space');await page.mouse.move(body.x,body.y);await page.mouse.down();await page.mouse.move(body.x+45,body.y+20,{steps:5});await page.mouse.up();await page.keyboard.up('Space')
  const actual=await page.evaluate(()=>({drawing:pro.getDrawings()[0],range:pro.getChart().getVisibleRange(),writes:commits.length,panCalls,scroll:pro.getChart().isScrollEnabled(),focus:document.activeElement?.className}));assert.deepEqual(actual.drawing.anchors,before.anchors);assert.equal(actual.writes,body.writes);assert.notEqual(actual.range.realFrom,body.range.realFrom)
  results.push({scenario:`space-body-pan-${owner}-no-content-write`,passed:true})
 }
 const before=await seed('segment'),h=await handle().boundingBox();await page.mouse.move(h.x+22,h.y+22);await page.mouse.down();await page.mouse.move(h.x+42,h.y+42)
 const canonical=await page.evaluate(()=>{const d=pro.getDrawings()[0];d.anchors=d.anchors.map(a=>({...a,value:a.value+3}));d.overlay.points=d.overlay.points.map(p=>({...p,value:p.value+3}));pro.restoreDrawings('local',[d]);return pro.getDrawings()[0]})
 await handle().dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});await page.mouse.up()
 assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0].anchors),canonical.anchors)
 assert.equal(await page.evaluate(()=>pro.getChart().getOverlays({id:pro.getDrawings()[0].logicalId})[0].points[0].value),canonical.anchors[0].value)
 results.push({scenario:'cancel-after-canonical-update-retains-current-projection',passed:true})
 await seed('segment');await page.evaluate(()=>pro.executeDrawingCommand({type:'view',hidden:true}));await page.keyboard.down('Shift');const pane=await page.evaluate(()=>{const r=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y}});await page.mouse.move(pane.x+200,pane.y+100);await page.mouse.down();await page.mouse.move(pane.x+600,pane.y+300,{steps:4});await page.mouse.up();await page.keyboard.up('Shift');await page.waitForFunction(()=>pro.getDrawingState().selectedIds.length===0)
 await page.evaluate(()=>pro.executeDrawingCommand({type:'view',hidden:false}));results.push({scenario:'hidden-projections-excluded-from-canvas-box-selection',passed:true})
 await seed('segment');const keyboardBefore=await page.evaluate(()=>pro.getDrawings()[0]);await handle().focus();await page.keyboard.press('Shift+ArrowRight');await page.waitForFunction(before=>JSON.stringify(pro.getDrawings()[0].anchors)!==JSON.stringify(before.anchors),keyboardBefore);assert.equal(await handle().evaluate(e=>e===document.activeElement),true);results.push({scenario:'focused-control-point-keyboard-edit-keeps-focus',passed:true})
 const axisId=await page.evaluate(()=>{const chart=pro.getChart(),id=chart.createYAxis({id:'drawing-audit-axis',name:'normal',paneId:'candle_pane',position:'left',createRange:({defaultRange})=>({...defaultRange,from:0,to:1000,range:1000,realFrom:0,realTo:1000,realRange:1000,displayFrom:0,displayTo:1000,displayRange:1000})});chart.resize();return id});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 const own=await seed('segment','local',axisId);const label=page.locator(`[data-drawing-axis-label="${own.logicalId}:y:0"]`);await label.waitFor()
 const ownProjection=await page.evaluate(id=>{const d=pro.getDrawings()[0],chart=pro.getChart(),r=chart.getDom('candle_pane','main').getBoundingClientRect(),axis=chart.getYAxes({id})[0],defaultAxis=chart.getYAxes({paneId:'candle_pane'})[0],actual=chart.getOverlays({id:d.logicalId})[0];return {y:r.y+axis.convertToPixel(d.anchors[0].value),defaultY:r.y+defaultAxis.convertToPixel(d.anchors[0].value),nativeDefault:actual.needDefaultYAxisFigure}},axisId)
 await page.waitForFunction(({id,axisId})=>{const label=document.querySelector(`[data-drawing-axis-label="${id}:y:0"]`),r=label?.getBoundingClientRect(),chart=pro.getChart(),d=pro.getDrawings().find(d=>d.logicalId===id),pane=chart.getDom('candle_pane','main').getBoundingClientRect(),axis=chart.getYAxes({id:axisId})[0];return !!r&&r.width>0&&r.height>0&&Math.abs(r.y+r.height/2-pane.y-axis.convertToPixel(d.anchors[0].value))<1},{id:own.logicalId,axisId});const labelBox=await label.evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});assert.ok(Math.abs(labelBox.y+labelBox.height/2-ownProjection.y)<1);assert.ok(Math.abs(ownProjection.y-ownProjection.defaultY)>20);assert.equal(ownProjection.nativeDefault,false)
 await drag(30,10);const ownAfter=await page.evaluate(()=>pro.getDrawings()[0]);assert.notEqual(ownAfter.anchors[0].timestamp,own.anchors[0].timestamp);assert.notEqual(ownAfter.anchors[0].value,own.anchors[0].value)
 results.push({scenario:'secondary-axis-control-and-own-price-label',passed:true})
 await page.getByRole('button',{name:'趋势线',exact:true}).first().focus();await page.keyboard.press('Space');await page.waitForFunction(()=>pro.getDrawingState().toolId==='segment');await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.press('Escape');results.push({scenario:'favorite-button-space-uses-native-activation',passed:true})
 await seed('segment');const timeLabel=page.locator('[data-drawing-axis-label$=":x:0"]');await timeLabel.waitFor({state:'visible'});assert.equal(await page.locator('[data-drawing-axis-label*=":x:"]').count(),2)
 await page.evaluate(()=>{const drawing=pro.getDrawings()[0],bars=pro.getChart().getDataList(),index=bars.findIndex(bar=>bar.timestamp===drawing.anchors[0].timestamp);drawing.anchors[0].interpolation={nextTimestamp:bars[index+1].timestamp,fraction:.35};pro.restoreDrawings('local',[drawing])})
 await page.waitForFunction(()=>document.querySelector('[data-drawing-axis-label$=":x:0"]')?.textContent.includes('35.0%'))
 const checkTimePosition=()=>page.waitForFunction(()=>{const drawing=pro.getDrawings()[0],chart=pro.getChart(),bars=chart.getDataList(),anchor=drawing.anchors[0],index=anchor.kind==='logical'?bars.findIndex(bar=>bar.timestamp===anchor.referenceTimestamp)+anchor.offsetBars:bars.findIndex(bar=>bar.timestamp===anchor.timestamp)+(anchor.interpolation?.fraction??0),pixel=chart.convertToPixel({dataIndex:index,value:anchor.value},{paneId:'candle_pane',yAxisId:drawing.yAxisId}),pane=chart.getDom('candle_pane','main').getBoundingClientRect(),label=document.querySelector('[data-drawing-axis-label$=":x:0"]')?.getBoundingClientRect();return label&&label.width>0&&Math.abs(label.x+label.width/2-pane.x-pixel.x)<1})
 await checkTimePosition();await page.evaluate(()=>pro.getChart().scrollByDistance(30));await checkTimePosition();await page.evaluate(()=>pro.getChart().zoomAtCoordinate(.2,{x:350,y:150}));await checkTimePosition()
 await page.evaluate(()=>{const before=pro.getDrawings()[0],chart=pro.getChart(),last=chart.getDataList().at(-1),anchor={kind:'logical',referenceTimestamp:last.timestamp,offsetBars:2.5,period:{multiplier:1,timespan:'minute'},value:last.close},id='future-label';pro.restoreDrawings('local',[{...before,logicalId:id,anchors:[anchor],overlay:{...before.overlay,id,name:'priceLabel',points:[{dataIndex:chart.getDataList().length+1.5,value:last.close}]}}]);chart.scrollToRealTime(0);return pro.executeDrawingCommand({type:'select',ids:[id]})})
 await page.waitForFunction(()=>document.querySelector('[data-drawing-axis-label$=":x:0"]')?.textContent==='后续根数 2.50');await checkTimePosition();assert.doesNotMatch(await timeLabel.textContent(),/20\d{2}-/)
 results.push({scenario:'market-fractional-logical-time-labels-scroll-and-zoom',passed:true})
 const numeric=await page.evaluate(async()=>{
  const chart=pro.getChart(),axisId=chart.createYAxis({id:'drawing-audit-log',name:'logarithm',paneId:'candle_pane'}),axis=chart.getYAxes({id:axisId})[0],bars=chart.getDataList(),time=bars.at(-50).timestamp
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  const result=[]
  const capture=async overlay=>{let figures;const original=overlay.createPointFigures;overlay.createPointFigures=args=>{figures=original(args);return figures};chart.resize();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));overlay.createPointFigures=original;if(!figures)throw Error('真实绘图回调未执行');return figures}
  for(const name of ['fibonacciLine','fibonacciSegment','fibonacciExtension','gannBox']){
   const id=`log-${name}`,points=[{timestamp:time,value:100},{timestamp:bars.at(-40).timestamp,value:200},...(name==='fibonacciExtension'?[{timestamp:bars.at(-30).timestamp,value:100}]:[])],snapshot={logicalId:id,owner:'local',yAxisId:axisId,parameters:{levels:[name==='gannBox'?-2:3]},anchors:points.map(p=>({kind:'market',...p})),overlay:{id,name,paneId:'candle_pane',groupId:'drawing_tools',points,visible:true,lock:false,extendData:null,styles:null}}
   if(name==='fibonacciExtension'){snapshot.overlay.points[0].value=200;snapshot.overlay.points[1].value=100;snapshot.anchors[0].value=200;snapshot.anchors[1].value=100}pro.restoreDrawings('local',[snapshot]);const overlay=chart.getOverlays({id})[0];if(!overlay)throw Error(JSON.stringify({name,state:pro.getDrawingHistoryState()}));const figures=await capture(overlay);result.push({name,figures:JSON.stringify(figures)})
  }
  await pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)})
  const regressionBars=[5,2,3,1].map((close,index)=>({timestamp:1700000000000+index*60000,open:close,high:close+.1,low:close-.1,close,volume:1}))
  window.fixtureBars=regressionBars;await pro.applySnapshot({symbol:pro.getSymbol(),period:pro.getPeriod(),bars:regressionBars,basis:'isolated-raw'})
  chart.scrollToRealTime(0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  for(const name of ['regressionTrend','regressionChannel']){
    const id=`log-${name}`,points=[{timestamp:regressionBars[0].timestamp,value:5},{timestamp:regressionBars[3].timestamp,value:1}],snapshot={logicalId:id,owner:'local',yAxisId:axisId,parameters:{source:'close',extend:name==='regressionTrend',...(name==='regressionChannel'?{deviations:2}:{})},anchors:points.map(p=>({kind:'market',...p})),overlay:{id,name,paneId:'candle_pane',groupId:'drawing_tools',points,visible:true,lock:false,extendData:null,styles:null}}
    pro.restoreDrawings('local',[snapshot]);const overlay=chart.getOverlays({id})[0];if(!overlay)throw Error(JSON.stringify({name,state:pro.getDrawingHistoryState()}));const figures=await capture(overlay);result.push({name,figures:JSON.stringify(figures)})
  }
  return result
 })
 for(const item of numeric)assert.ok(/不能显示|调整级别|线性轴/.test(item.figures),`${item.name}: expected a domain error, got ${item.figures.slice(0,200)}`)
 results.push({scenario:'real-logarithmic-axis-rejects-derived-nonpositive-fib-gann',tools:numeric.map(n=>n.name)})
 assert.deepEqual(errors,[]);const evidence={passed:true,scope:'isolated-native-engine-review-counterexamples',results,errors};if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2));await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()});console.log(JSON.stringify(evidence))
}finally{await browser.close()}
