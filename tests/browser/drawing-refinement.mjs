import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),results=[]
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workbench.html?database=refinement-${Date.now()}`)
 await page.waitForFunction(()=>window.ready)
 const seed=mode=>page.evaluate(async mode=>{
  await pro.executeDrawingCommand({type:'select',ids:[]})
  await pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)})
  const chart=pro.getChart(),bars=chart.getDataList(),index=bars.length-35,first={kind:'market',timestamp:bars[index].timestamp,value:bars[index].close}
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
  return {...probe,expected,handle:handle?{x:handle.x+handle.width/2-pane.x,y:handle.y+handle.height/2-pane.y}:null}
 })
 for(const mode of ['exact','interpolation','between']){
  await seed(mode)
  for(const action of ['initial','scroll','zoom']){
   if(action==='scroll')await page.evaluate(()=>pro.getChart().scrollByDistance(30))
   if(action==='zoom')await page.evaluate(()=>pro.getChart().zoomAtCoordinate(.2,{x:350,y:150}))
   const actual=await inspect();assert.ok(actual.coordinates?.length>=2,JSON.stringify(actual))
   assert.ok(Math.abs(actual.coordinates[0].x-actual.expected.x)<.01,JSON.stringify(actual));assert.ok(Math.abs(actual.coordinates[0].y-actual.expected.y)<.01)
   assert.ok(actual.handle&&Math.abs(actual.handle.x-actual.expected.x)<1);assert.ok(Math.abs(actual.handle.y-actual.expected.y)<1,JSON.stringify({mode,action,...actual}))
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
 assert.deepEqual(errors,[])
 const evidence={passed:true,scope:'isolated-native-engine',results,errors}
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2))
 await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()})
 console.log(JSON.stringify(evidence))
} finally {await browser.close()}
