import {volumeRefinement} from './volume-refinement-cases.mjs'
import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),results=[]
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workbench.html?database=refinement-${Date.now()}`)
 await page.waitForFunction(()=>window.ready)
 await page.waitForFunction(()=>{const c=pro.getChart(),b=c.getDataList().at(-35),r=c.getDom('candle_pane','main')?.getBoundingClientRect(),p=b&&c.convertToPixel({timestamp:b.timestamp,value:b.close},{paneId:'candle_pane'});return r?.height>200&&p.y>30&&p.y<r.height-30})
 const seed=mode=>page.evaluate(async mode=>{
  await pro.executeDrawingCommand({type:'select',ids:[]})
  await pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)})
  const chart=pro.getChart();chart.setBarSpace(10);chart.scrollToRealTime(0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const bars=chart.getDataList(),index=bars.length-35,first={kind:'market',timestamp:bars[index].timestamp,value:bars[index].close}
  if(mode==='interpolation')first.interpolation={nextTimestamp:bars[index+1].timestamp,fraction:.35}
  if(mode==='between')first.timestamp+=(bars[index+1].timestamp-first.timestamp)*.35
  const anchors=[first,{kind:'market',timestamp:bars[index+7].timestamp,value:bars[index+7].close}],id='refinement-projection'
  pro.restoreDrawings('local',[{logicalId:id,owner:'local',anchors,overlay:{id,name:'segment',paneId:'candle_pane',groupId:'drawing_tools',points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),visible:true,lock:false,extendData:null,styles:null}}])
  await pro.executeDrawingCommand({type:'select',ids:[id]})
  window.probe={}
  const overlay=chart.getOverlays({id})[0],original=overlay.createPointFigures
  overlay.createPointFigures=args=>{const figures=original(args),line=(Array.isArray(figures)?figures:[figures]).find(f=>f.type==='line');probe={coordinates:line?.attrs.coordinates,native:line?.attrs.coordinates===args.coordinates};return figures}
  chart.resize()
 },mode)
 const inspect=()=>page.evaluate(async()=>{
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
  const chart=pro.getChart(),drawing=pro.getDrawings()[0],anchor=drawing.anchors[0],bars=chart.getDataList()
  const timestamp=anchor.timestamp+(anchor.interpolation?(anchor.interpolation.nextTimestamp-anchor.timestamp)*anchor.interpolation.fraction:0)
  let i=bars.findIndex(b=>b.timestamp>=timestamp),index=i
  if(bars[i].timestamp!==timestamp)index=i-1+(timestamp-bars[i-1].timestamp)/(bars[i].timestamp-bars[i-1].timestamp)
  const expected=chart.convertToPixel({dataIndex:index,value:anchor.value},{paneId:'candle_pane'}),pane=chart.getDom('candle_pane','main').getBoundingClientRect(),handle=document.querySelector('button[aria-label^="绘图控制点 1 ·"]')?.getBoundingClientRect()
  return {...probe,expected,pane:{height:pane.height,width:pane.width},size:chart.getSize(),connected:chart.getDom().isConnected,body:chart.getDom().isConnected?undefined:document.body.innerText,axis:chart.getYAxes({paneId:'candle_pane'})[0].getRange(),handle:handle?{x:handle.x+handle.width/2-pane.x,y:handle.y+handle.height/2-pane.y}:null}
 })
 for(const mode of ['exact','interpolation','between']){
  await seed(mode)
  for(const action of ['initial','scroll','zoom']){
   if(action==='scroll')await page.evaluate(()=>pro.getChart().scrollByDistance(30))
   if(action==='zoom')await page.evaluate(()=>pro.getChart().zoomAtCoordinate(.2,{x:350,y:150}))
   const actual=await inspect();assert.ok(actual.coordinates?.length>=2,JSON.stringify(actual))
   assert.ok(Math.abs(actual.coordinates[0].x-actual.expected.x)<.01,JSON.stringify(actual));assert.ok(Math.abs(actual.coordinates[0].y-actual.expected.y)<.01)
   assert.ok(actual.handle&&Math.abs(actual.handle.x-actual.expected.x)<1,JSON.stringify({mode,action,...actual}));assert.ok(Math.abs(actual.handle.y-actual.expected.y)<1,JSON.stringify({mode,action,...actual}))
   assert.equal(actual.native,mode==='exact')
  }
  results.push({scenario:`actual-figure-control-point-${mode}-zoom-scroll`,passed:true})
 }
 await seed('exact');await inspect()
 const handle=page.getByRole('button',{name:/^绘图控制点 1 ·/}),box=await handle.boundingBox()
 await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.mouse.move(box.x+57.5,box.y+34,{steps:4})
 const preview=await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const r=pro.getChart().getDom('candle_pane','main').getBoundingClientRect(),h=document.querySelector('button[aria-label^="绘图控制点 1 ·"]').getBoundingClientRect();return {...probe,handle:{x:h.x+h.width/2-r.x,y:h.y+h.height/2-r.y}}})
 assert.equal(preview.native,false);assert.ok(Math.abs(preview.coordinates[0].x-preview.handle.x)<1,JSON.stringify(preview));assert.ok(Math.abs(preview.coordinates[0].y-preview.handle.y)<1)
 await page.mouse.up();results.push({scenario:'real-pointer-preview-keeps-figure-and-control-point-aligned',passed:true})

 await seed('exact')
 await page.evaluate(()=>{const base=pro.getDrawings()[0],b=structuredClone(base);b.logicalId='second';b.overlay.id='second';b.overlay.styles={line:{color:'#2196f3',size:2},text:{color:'#111111'}};base.overlay.styles={line:{color:'#f44336',size:1},text:{color:'#222222'}};pro.restoreDrawings('local',[base,b]);return pro.executeDrawingCommand({type:'select',ids:[base.logicalId,b.logicalId]})})
 const bar=page.getByRole('region',{name:'绘图属性'}),colorButton=bar.getByRole('button',{name:'描边颜色',exact:true})
 assert.match(await colorButton.innerText(),/混合/)
 await colorButton.focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter')
 await page.waitForFunction(()=>pro.getDrawings().every(d=>d.overlay.styles.line.color==='#d1d4dc'))
 assert.equal(await colorButton.evaluate(el=>el===document.activeElement),true,await page.evaluate(()=>document.activeElement?.outerHTML))
 assert.deepEqual(await page.evaluate(()=>pro.getDrawings().map(d=>d.overlay.styles.text.color)),['#222222','#111111'])
 await bar.getByRole('combobox',{name:'线宽',exact:true}).selectOption('3')
 await page.waitForFunction(()=>pro.getDrawings().every(d=>d.overlay.styles.line.size===3))
 await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings()[0].overlay.styles.line.size===1&&pro.getDrawings()[1].overlay.styles.line.size===2)
 results.push({scenario:'full-selection-mixed-values-keyboard-color-and-one-undo',passed:true})
 await page.evaluate(()=>{const d=pro.getDrawings()[0];d.overlay.name='rect';d.overlay.styles={polygon:{color:'transparent'}};pro.restoreDrawings('local',[d,...pro.getDrawings().slice(1)]);return pro.executeDrawingCommand({type:'select',ids:[d.logicalId]})})
 await bar.getByRole('button',{name:'填充颜色',exact:true}).click();await bar.getByRole('button',{name:'#f44336',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings()[0].overlay.styles.polygon.color==='#f44336')
 await bar.getByRole('button',{name:'填充颜色',exact:true}).click();await bar.getByRole('button',{name:'transparent',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings()[0].overlay.styles.polygon.color==='transparent')
 results.push({scenario:'fill-from-transparent-and-clear-through-common-editor',passed:true})
 await bar.getByRole('button',{name:'绘图设置',exact:true}).click()
 const manager=page.getByRole('complementary',{name:'绘图管理'})
 await manager.getByRole('textbox',{name:'对象名称',exact:true}).fill('保留的草稿')
 assert.equal(await bar.getByRole('combobox',{name:'线宽',exact:true}).isDisabled(),true)
 await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 await manager.getByRole('button',{name:'保留草稿',exact:true}).click()
 assert.equal(await manager.getByRole('textbox',{name:'对象名称',exact:true}).inputValue(),'保留的草稿')
 await manager.getByRole('button',{name:'对象',exact:true}).click();await manager.getByRole('button',{name:'编辑 趋势线',exact:true}).click()
 await manager.getByRole('button',{name:'保留草稿',exact:true}).click()
 assert.equal(await manager.getByRole('textbox',{name:'对象名称',exact:true}).inputValue(),'保留的草稿')
 await manager.getByRole('button',{name:'取消修改',exact:true}).click();await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 assert.equal(await page.evaluate(()=>pro.getDrawings()[0].presentation?.name),undefined)
 results.push({scenario:'settings-draft-keep-on-close-and-change-target-without-history',passed:true})
 await page.evaluate(()=>pro.executeDrawingCommand({type:'update',ids:pro.getDrawingState().selectedIds,patch:{overlay:{lock:true}}}))
 assert.equal(await bar.getByRole('button',{name:'描边颜色',exact:true}).isDisabled(),true)
 await bar.getByRole('button',{name:'解锁绘图',exact:true}).click();await page.waitForFunction(()=>!pro.getDrawings()[0].overlay.lock)
 await page.setViewportSize({width:390,height:840});await page.evaluate(()=>{document.querySelector('#chart').style.width='100%';pro.getChart().resize()})
 await page.waitForFunction(()=>document.querySelector('.tc-drawing-property-docked'))
 const narrow=await bar.boundingBox();assert.ok(narrow.x>=0&&narrow.x+narrow.width<=390)
 await bar.getByRole('button',{name:'填充颜色',exact:true}).click()
 const target=await bar.getByRole('button',{name:'#f44336',exact:true}).boundingBox();assert.ok(target.width>=44&&target.height>=44)
 await bar.getByRole('button',{name:'#f44336',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings()[0].overlay.styles.polygon.color==='#f44336');await bar.getByRole('combobox',{name:'线宽',exact:true}).selectOption('4')
 await page.waitForFunction(()=>pro.getDrawings()[0].overlay.styles.polygon.borderSize===4)
 results.push({scenario:'locked-selection-explicit-unlock-and-narrow-44px-controls',passed:true})
 await page.screenshot({path:`${process.env.TC_BROWSER_EVIDENCE}/drawing-refinement-narrow.png`})
 await volumeRefinement(page,results)

 await page.evaluate(async()=>{
  await pro.executeDrawingCommand({type:'select',ids:[]});await pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)})
  const b=pro.getChart().getDataList().at(-35),id='nonpreset',anchors=[{kind:'market',timestamp:b.timestamp,value:b.close}]
  pro.restoreDrawings('local',[{logicalId:id,owner:'local',anchors,overlay:{id,name:'note',paneId:'candle_pane',groupId:'drawing_tools',points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),visible:true,lock:false,extendData:'字号回归',styles:{text:{size:18,backgroundColor:'#abcdef80'}}}}]);await pro.executeDrawingCommand({type:'select',ids:[id]})
 })
 assert.equal(await bar.getByRole('combobox',{name:'字号',exact:true}).inputValue(),'18')
 await bar.getByRole('button',{name:'绘图设置',exact:true}).click()
 assert.equal(await manager.getByRole('combobox',{name:'字号',exact:true}).count(),1);assert.equal(await manager.getByRole('combobox',{name:'字号',exact:true}).inputValue(),'18')
 assert.equal(await manager.locator('input[type=color]').count(),0)
 assert.match(await manager.getByRole('button',{name:'填充颜色',exact:true}).innerText(),/#abcdef80/)
 await manager.getByRole('combobox',{name:'字号',exact:true}).selectOption('20');await manager.getByRole('button',{name:'填充颜色',exact:true}).click();await manager.getByRole('button',{name:'transparent',exact:true}).click()
 await manager.getByRole('button',{name:'取消修改',exact:true}).click();await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0].overlay.styles.text),{size:18,backgroundColor:'#abcdef80'})
 await page.evaluate(async()=>{const drawing=pro.getDrawings()[0],bar=pro.getChart().getDataList().at(-28);drawing.overlay.name='segment';drawing.overlay.styles={line:{size:2.5}};drawing.anchors.push({kind:'market',timestamp:bar.timestamp,value:bar.close});drawing.overlay.points=drawing.anchors.map(a=>({timestamp:a.timestamp,value:a.value}));pro.restoreDrawings('local',[drawing]);await pro.executeDrawingCommand({type:'select',ids:[drawing.logicalId]})})
 assert.equal(await bar.getByRole('combobox',{name:'线宽',exact:true}).inputValue(),'2.5');await bar.getByRole('button',{name:'绘图设置',exact:true}).click();assert.equal(await manager.getByRole('combobox',{name:'线宽',exact:true}).inputValue(),'2.5')
 await manager.getByRole('button',{name:'取消修改',exact:true}).click();await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 results.push({scenario:'review-nonpreset-style-current-values-single-entry-and-cancel',passed:true})
 assert.deepEqual(errors,[])
 const evidence={passed:true,scope:'isolated-native-engine',results,errors}
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2))
 await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()})
 console.log(JSON.stringify(evidence))
} finally {await browser.close()}
