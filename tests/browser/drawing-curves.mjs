import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),results=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:Number(process.env.TC_CURVE_DPR??1)}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workbench.html?database=curves-${Date.now()}`);await page.waitForFunction(()=>window.ready&&pro.getChart().getDom('candle_pane','main').getBoundingClientRect().height>200)
 const bar=page.getByRole('region',{name:'绘图属性'}),manager=page.getByRole('complementary',{name:'绘图管理'})
 const capture=()=>page.evaluate(async()=>{
  const {curveGeometry}=await import('/src/extension/curves.ts')
  const d=pro.getDrawings()[0],chart=pro.getChart(),overlay=chart.getOverlays({id:d.logicalId})[0],draw=overlay.createPointFigures;let figures,geometry
  overlay.createPointFigures=args=>{geometry=curveGeometry(args);figures=draw(args);return figures};chart.resize();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));overlay.createPointFigures=draw
  const previous=window.curveGeometryProbe;window.curveGeometryProbe=geometry
  const bars=chart.getDataList(),pane=chart.getDom('candle_pane','main').getBoundingClientRect()
  const points=d.anchors.map(anchor=>{let index;if(anchor.kind==='market'){const time=anchor.timestamp+(anchor.interpolation?(anchor.interpolation.nextTimestamp-anchor.timestamp)*anchor.interpolation.fraction:0);let low=0;while(low<bars.length&&bars[low].timestamp<time)low++;index=bars[low]?.timestamp===time?low:low-1+(time-bars[low-1].timestamp)/(bars[low].timestamp-bars[low-1].timestamp)}else index=bars.findIndex(b=>b.timestamp===anchor.referenceTimestamp)+anchor.offsetBars;return chart.convertToPixel({dataIndex:index,value:anchor.value},{paneId:'candle_pane',yAxisId:d.yAxisId})})
  return {figures,points,drawing:d,geometryReused:previous===geometry,nativeRetained:!window.curveNativeBefore||window.curveNativeBefore===overlay,pane:{x:pane.x,y:pane.y,width:pane.width,height:pane.height},handles:[...document.querySelectorAll('.tc-drawing-handle')].map(h=>{const r=h.getBoundingClientRect();return {x:r.x+r.width/2-pane.x,y:r.y+r.height/2-pane.y}})}
 })
 const distance=(p,a,b)=>{const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y)||0));return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y)}
 for(const [name,label,count] of [['curve','曲线',3],['doubleCurve','双控制点曲线',4],['arc','圆弧',3]]){
  await page.getByRole('button',{name:'全部绘图工具',exact:true}).click();await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(name);await page.locator('.tc-drawing-tool-picker').getByText(label,{exact:true}).click()
  const r=await page.evaluate(()=>{const r=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y}}),clicks=[{x:250,y:250},{x:550,y:250},{x:360,y:140},{x:450,y:360}]
  for(const point of clicks.slice(0,count))await page.mouse.click(r.x+point.x,r.y+point.y)
  await page.waitForFunction(count=>pro.getDrawings().length===1&&pro.getDrawings()[0].anchors.length===count&&pro.getDrawingHistoryState().pending===0,count)
  const id=await page.evaluate(()=>pro.getDrawings()[0].logicalId);await page.evaluate(id=>pro.executeDrawingCommand({type:'select',ids:[id]}),id)
  const actual=await capture(),line=actual.figures.find(f=>f.type==='line'&&!f.ignoreEvent)?.attrs.coordinates;assert.ok(line?.length>=2);assert.ok(line.length-1<=2048);assert.equal(actual.handles.length,count)
  for(const [index,point] of actual.points.entries()){assert.ok(Math.hypot(point.x-actual.handles[index].x,point.y-actual.handles[index].y)<1)}
  assert.deepEqual(line[0],actual.points[0]);assert.deepEqual(line.at(-1),actual.points[1]);if(name==='arc')assert.ok(line.some(p=>Math.hypot(p.x-actual.points[2].x,p.y-actual.points[2].y)<1e-6))
  if(name!=='arc'){
   const [a,b,c,d]=actual.points,t=.5,p=name==='curve'?{x:(a.x+2*c.x+b.x)/4,y:(a.y+2*c.y+b.y)/4}:{x:(a.x+3*c.x+3*d.x+b.x)/8,y:(a.y+3*c.y+3*d.y+b.y)/8};assert.ok(Math.min(...line.slice(1).map((q,i)=>distance(p,line[i],q)))<=.500001)
   assert.equal(actual.figures.filter(f=>f.type==='line'&&f.ignoreEvent===true).length,1)
  }
  const toolbar=await bar.boundingBox(),body=line.find((point,index)=>index>1&&index<line.length-2&&actual.points.every(control=>Math.hypot(control.x-point.x,control.y-point.y)>32)&&!(actual.pane.x+point.x>=toolbar.x&&actual.pane.x+point.x<=toolbar.x+toolbar.width&&actual.pane.y+point.y>=toolbar.y&&actual.pane.y+point.y<=toolbar.y+toolbar.height))
  assert.ok(body,'需要一个不被控制点或工具条遮挡的真实曲线位置')
  await page.mouse.move(actual.pane.x+body.x,actual.pane.y+body.y);await page.mouse.down();await page.mouse.move(actual.pane.x+body.x+25,actual.pane.y+body.y+12,{steps:4});await page.mouse.up()
  await page.waitForFunction(before=>pro.getDrawings()[0].anchors.every((anchor,index)=>JSON.stringify(anchor)!==JSON.stringify(before[index])),actual.drawing.anchors)
  await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(before=>JSON.stringify(pro.getDrawings()[0].anchors)===JSON.stringify(before),actual.drawing.anchors)
  const handle=page.getByRole('button',{name:new RegExp('^绘图控制点 1 ·')}),box=await handle.boundingBox();await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.mouse.move(box.x+55,box.y+38,{steps:4});await page.mouse.up();await page.waitForFunction(before=>JSON.stringify(pro.getDrawings()[0].anchors)!==JSON.stringify(before),actual.drawing.anchors)
  await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(before=>JSON.stringify(pro.getDrawings()[0].anchors)===JSON.stringify(before),actual.drawing.anchors)
  await handle.focus();await page.keyboard.press('Shift+ArrowRight');await page.waitForFunction(before=>JSON.stringify(pro.getDrawings()[0].anchors)!==JSON.stringify(before),actual.drawing.anchors);await page.getByRole('button',{name:'撤销绘图',exact:true}).click()
  await bar.getByRole('combobox',{name:'线宽',exact:true}).selectOption('3');await page.waitForFunction(()=>pro.getDrawings()[0].overlay.styles.line.size===3)
  await page.evaluate(()=>window.curveNativeBefore=pro.getChart().getOverlays({id:pro.getDrawings()[0].logicalId})[0]);await capture()
  await bar.getByRole('button',{name:'绘图设置',exact:true}).click()
  await manager.getByLabel('起点标记',{exact:true}).selectOption('arrow');await manager.getByLabel('终点标记',{exact:true}).selectOption('circle');await manager.getByRole('checkbox',{name:'填充曲线背景',exact:true}).check();await manager.getByLabel('背景透明度',{exact:true}).selectOption('0.2');await manager.getByRole('button',{name:'确认修改',exact:true}).click()
  await page.waitForFunction(()=>pro.getDrawings()[0].parameters?.background===true);await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
  const decorated=await capture(),fill=decorated.figures.find(f=>f.type==='polygon'&&f.ignoreEvent===true),arrow=decorated.figures.find(f=>f.type==='polygon'&&!f.ignoreEvent),circle=decorated.figures.find(f=>f.type==='circle'&&!f.ignoreEvent),curve=decorated.figures.find(f=>f.type==='line'&&!f.ignoreEvent).attrs.coordinates
  assert.equal(decorated.geometryReused,true);assert.equal(decorated.nativeRetained,true);await page.evaluate(()=>window.curveNativeBefore=undefined)
  assert.deepEqual(fill.attrs.coordinates,curve);assert.deepEqual(arrow.attrs.coordinates[0],curve[0]);assert.deepEqual({x:circle.attrs.x,y:circle.attrs.y},curve.at(-1));assert.equal(circle.attrs.r,4.5);assert.deepEqual(decorated.drawing.anchors,actual.drawing.anchors)
  await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings()[0].parameters?.background!==true);assert.ok(!(await capture()).figures.some(f=>f.type==='circle'))
  await page.getByRole('button',{name:'重做绘图',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings()[0].parameters?.background===true)
  for(const action of ['scroll','zoom','axis']){
   await page.evaluate(action=>{const c=pro.getChart();if(action==='scroll')c.scrollByDistance(20);else if(action==='zoom')c.zoomAtCoordinate(.2,{x:400,y:200});else c.overrideYAxis({id:c.getYAxes({paneId:'candle_pane'})[0].id,paneId:'candle_pane',name:'logarithm'});c.resize()},action)
   const projected=await capture(),path=projected.figures.find(f=>f.type==='line'&&!f.ignoreEvent)?.attrs.coordinates;assert.deepEqual(path[0],projected.points[0]);assert.deepEqual(path.at(-1),projected.points[1])
  }
  await page.evaluate(()=>{const c=pro.getChart();c.overrideYAxis({id:c.getYAxes({paneId:'candle_pane'})[0].id,paneId:'candle_pane',name:'normal'});c.setBarSpace(10);c.scrollToRealTime(0);c.resize()})
  const combinationAnchors=(await capture()).drawing.anchors
  for(const start of ['none','arrow','circle'])for(const end of ['none','arrow','circle']){
   await bar.getByRole('button',{name:'绘图设置',exact:true}).click();await manager.getByLabel('起点标记',{exact:true}).selectOption(start);await manager.getByLabel('终点标记',{exact:true}).selectOption(end);await manager.getByRole('button',{name:'确认修改',exact:true}).click();await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
   const actual=await capture(),path=actual.figures.find(figure=>figure.type==='line'&&!figure.ignoreEvent).attrs.coordinates,markers=actual.figures.filter(figure=>['polygon','circle'].includes(figure.type)&&!figure.ignoreEvent)
   assert.equal(markers.length,Number(start!=='none')+Number(end!=='none'));assert.deepEqual(actual.drawing.anchors,combinationAnchors)
   let index=0
   for(const [kind,tip] of [[start,path[0]],[end,path.at(-1)]])if(kind!=='none'){
    const marker=markers[index++];assert.equal(marker.type,kind==='arrow'?'polygon':'circle')
    assert.deepEqual(kind==='arrow'?marker.attrs.coordinates[0]:{x:marker.attrs.x,y:marker.attrs.y},tip)
   }
  }
  await page.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('button',{name:'克隆',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings().length===2)
  await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings().length===1)
  const saved=await page.evaluate(async()=>{const {captureLayout,restoreLayout}=await import('/src/persistence/v4.ts'),layout=captureLayout(pro);await pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)});await restoreLayout(pro,layout);return {anchors:layout.drawings[0].anchors,parameters:layout.drawings[0].parameters}})
  assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0].anchors),saved.anchors)
  assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0].parameters),saved.parameters)
  await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
  await page.evaluate(()=>pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)}));await page.waitForFunction(()=>pro.getDrawings().length===0)
  results.push({name,create:true,actualFigure:true,bodyDrag:true,controlDrag:true,keyboard:true,style:true,zoomScrollAxis:true,cloneUndo:true,v4:true})
 }
 await page.evaluate(async()=>{const bars=pro.getChart().getDataList(),id='degenerate-arc',anchors=[-40,-25,-30].map(i=>({kind:'market',timestamp:bars.at(i).timestamp,value:bars.at(-40).close}));pro.restoreDrawings('local',[{logicalId:id,owner:'local',anchors,overlay:{id,name:'arc',paneId:'candle_pane',groupId:'drawing_tools',points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),visible:true,lock:false,styles:null,extendData:null}}]);await pro.executeDrawingCommand({type:'select',ids:[id]})})
 const degenerate=await capture();assert.equal(degenerate.handles.length,3);assert.ok(degenerate.figures.some(f=>f.type==='rectText'&&JSON.stringify(f.attrs).includes('共线')));assert.ok(!degenerate.figures.some(f=>f.type==='line'&&!f.ignoreEvent))
 const control=page.getByRole('button',{name:/^绘图控制点 3 ·/}),point=await control.boundingBox();await page.mouse.move(point.x+22,point.y+22);await page.mouse.down();await page.mouse.move(point.x+22,point.y-30,{steps:4});await page.mouse.up();await page.waitForFunction(()=>!pro.getDrawingHistoryState().pending)
 assert.ok((await capture()).figures.some(f=>f.type==='line'&&!f.ignoreEvent));results.push({scenario:'degenerate-arc-keeps-definition-handles-and-can-be-repaired',passed:true})
 const missing=await page.evaluate(async()=>{const {KLineChartPro,builtinDrawingCatalog}=await import('/src/chart.ts'),container=document.createElement('div');container.textContent='原容器';document.body.append(container);let message;try{new KLineChartPro({container,symbol:pro.getSymbol(),period:pro.getPeriod(),datafeed:{},drawingCatalog:[{...builtinDrawingCatalog[0],toolId:'missing',overlayName:'EXAMPLE/Missing'}]})}catch(error){message=error.message}const result={message,html:container.innerHTML,classes:container.className};container.remove();return result})
 assert.match(missing.message,/尚未注册/);assert.equal(missing.html,'原容器');assert.equal(missing.classes,'');results.push({scenario:'missing-template-rejected-before-dom-mutation',passed:true})
 assert.deepEqual(errors,[]);const evidence={passed:true,scope:'isolated-native-engine',results,errors};if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2));await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()});console.log(JSON.stringify(evidence))
}finally{await browser.close()}
