import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const{chromium}=createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON||new URL('../../../../package.json',import.meta.url))('playwright')
const expectDisabled=async page=>assert.equal(await page.locator('.klinecharts-pro-replay-bar input').isDisabled(),true)
const browser=await chromium.launch({chromiumSandbox:true})
try {
 const page=await browser.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const open=async()=>{await page.goto((process.env.TC_BROWSER_BASE||'http://127.0.0.1:4173')+'/tests/browser/lifecycle.html');await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setup());await page.waitForFunction(()=>test.state.subscriptions===1)}
 await open()
 const preserved=await page.evaluate(async()=>{
  const chart=test.chart.getChart(),before=JSON.stringify(chart.getDataList()),range=JSON.stringify(chart.getVisibleRange())
  chart.createOverlay({id:'retained',name:'segment',points:[{timestamp:test.bars[1].timestamp,value:12},{timestamp:test.bars[3].timestamp,value:16}]})
  test.state.failHistory=true
  let rejected=false;try{await test.chart.reloadData()}catch{rejected=true}
  return {rejected,bars:JSON.stringify(chart.getDataList())===before,range:JSON.stringify(chart.getVisibleRange())===range,drawing:chart.getOverlays({id:'retained'}).length===1}
 });assert.deepEqual(preserved,{rejected:true,bars:true,range:true,drawing:true})
 await open()
 const snapshots=await page.evaluate(async()=>{
  const chart=test.chart.getChart(),snapshot=bars=>({symbol:{ticker:'TEST'},period:{multiplier:1,timespan:'minute',text:'1m'},bars})
  const rows=test.bars.map(bar=>({...bar})),last=rows.at(-1)
  last.close+=0.5
  await test.chart.applySnapshot(snapshot([last]))
  const same=chart.getDataList().at(-1).close===last.close
  const next={...last,timestamp:last.timestamp+60000};rows.push(next)
  await test.chart.applySnapshot(snapshot([next]))
  const appended=chart.getDataList().length===21
  const beforeAlerts=test.state.alerts.length
  rows[2].close+=0.5;test.state.historyOverride=rows
  await test.chart.applySnapshot(snapshot(rows))
  const revision=chart.getDataList()[2].close===rows[2].close&&test.state.alerts.length===beforeAlerts
  const confirmed=JSON.stringify(chart.getDataList());test.state.failHistory=true
  let failed=false;try{await test.chart.applySnapshot({...snapshot(rows),basis:'adjusted'})}catch{failed=true}
  const preserved=JSON.stringify(chart.getDataList())===confirmed
  const retainedBasis=test.state.dataStates.at(-1).basis===undefined && !!test.state.dataStates.at(-1).error && !test.state.dataStates.at(-1).restoring
  test.state.failHistory=false;test.state.historyOverride={bars:rows,basis:'adjusted'}
  await test.chart.applySnapshot({...snapshot(rows),basis:'adjusted'})
  const histories=test.state.histories
  await test.chart.applySnapshot({...snapshot([rows.at(-1)]),basis:'adjusted'})
  let wrong=false,duplicates=false
  try{await test.chart.applySnapshot({...snapshot(rows),symbol:{ticker:'OTHER'}})}catch{wrong=true}
  try{await test.chart.applySnapshot(snapshot([last,last]))}catch{duplicates=true}
  test.chart.startReplay(5)
  await test.chart.applySnapshot({...snapshot(rows),basis:'adjusted'})
  const replayUntouched=chart.getDataList().length===5
  test.chart.stopReplay()
  return {same,appended,revision,failed,preserved,retainedBasis,stableBasis:test.state.histories===histories+1,wrong,duplicates,replayUntouched}
 });assert.ok(Object.values(snapshots).every(Boolean),JSON.stringify(snapshots))
 await open()
 await page.evaluate(()=>{test.state.holdResume=true;test.state.holdSymbol='OTHER';test.pending=test.chart.reloadData().catch(error=>{test.state.cancelled=error.name});test.chart.setSymbol({ticker:'OTHER'});test.state.rejectResume(new Error('旧请求已取消'))})
 await page.waitForTimeout(50)
 assert.equal(await page.locator('.klinecharts-pro-loading').count(),1,'old reload closed current loading')
 await page.evaluate(()=>test.state.resolveSymbol(test.bars));await page.waitForFunction(()=>test.state.ready.at(-1)?.symbol.ticker==='OTHER')
 await open()
 await page.evaluate(()=>{test.chart.startReplay(5);test.state.failHistory=true;test.chart.stopReplay()})
 await page.waitForFunction(()=>test.state.errors.some(e=>e.type==='data-reload'))
 assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),5)
 assert.equal(await page.evaluate(()=>test.chart.getReplayEngine().getState().active),true)
 assert.equal(await page.evaluate(async()=>{try{await test.chart.reloadData();return false}catch{return true}}),true)
 await page.evaluate(()=>{test.state.failHistory=false})
 await page.getByRole('button',{name:'重试',exact:true}).click()
 await page.waitForFunction(()=>test.chart.getReplayEngine()===null)
 assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),20)
 assert.equal(await page.evaluate(()=>test.state.subscriptions),2)
 await open()
 await page.evaluate(()=>{test.chart.startReplay(5);test.state.holdResume=true;test.chart.stopReplay()})
 await expectDisabled(page)
 await page.evaluate(()=>{test.chart.getReplayEngine().goToPosition(3);test.state.resolveResume(test.bars)})
 await page.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('恢复已取消'))
 assert.equal(await page.evaluate(()=>test.chart.getReplayEngine().getState().active),true)
 assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),3)
 assert.equal(await page.evaluate(()=>test.state.ready.length),1)
 assert.equal(await page.evaluate(()=>test.state.subscriptions),1)
 await page.evaluate(()=>{test.state.holdResume=false;test.chart.stopReplay()})
 await page.waitForFunction(()=>test.chart.getReplayEngine()===null)
 assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),20)
 await open()
 const layout=await page.evaluate(async()=>{
  const old={version:1,timestamp:1,theme:'dark',locale:'zh-CN',timezone:'UTC',mainIndicators:['MA'],subIndicators:[],styles:{yAxis:{type:'log',reverse:true},candle:{tooltip:{defaultValue:'缺失',text:{size:14},custom:[{title:'价格',value:'{close}'}]}},indicator:{tooltip:{defaultValue:'未知'}}},overlayData:[]}
  const migrated=layoutApi.migrateLayoutToV3(old)
  if(migrated.status!=='ok')throw Error(JSON.stringify(migrated))
  await layoutApi.restoreLayout(test.chart,migrated.value)
  const chart=test.chart.getChart(),axis=chart.getYAxes({paneId:'candle_pane'})[0]
  const main=chart.getIndicators({name:'MA'})[0]
  const ids=[]
  for(const [name,extendData] of [['textAnnotation','现有文字'],['segment',undefined]])ids.push(chart.createOverlay({name,points:[{timestamp:test.bars[3].timestamp,value:14},{timestamp:test.bars[5].timestamp,value:16}],extendData}))
  const snapshot=layoutApi.captureLayout(test.chart,{localDrawingIds:ids})
  if(!layoutApi.isChartLayoutV3(snapshot))throw Error('Invalid actual captured layout '+JSON.stringify(snapshot))
  const saved=layoutApi.saveLayoutV3('acceptance',snapshot),loaded=layoutApi.loadLayoutV3('acceptance')
  if(saved.status!=='ok'||loaded.status!=='ok')throw Error('layout round trip failed')
  for(const id of ids)chart.removeOverlay({id})
  await layoutApi.restoreLayout(test.chart,loaded.value)
  return {axis:axis.name,reverse:axis.reverse,mainPane:main.paneId,text:chart.getOverlays({name:'textAnnotation'})[0].extendData,line:chart.getOverlays({name:'segment'}).length,
    candleDefault:chart.getStyles().candle.tooltip.legend.defaultValue,custom:chart.getStyles().candle.tooltip.legend.template,indicatorDefault:chart.getStyles().indicator.tooltip.legend.defaultValue}
 });assert.equal(layout.axis,'logarithm');assert.equal(layout.reverse,true);assert.equal(layout.mainPane,'candle_pane');assert.equal(layout.text,'现有文字');assert.equal(layout.line,1);assert.equal(layout.candleDefault,'缺失');assert.equal(layout.indicatorDefault,'未知');assert.deepEqual(layout.custom,[{title:'价格',value:'{close}'}])
 await open()
 const drawings=await page.evaluate(()=>{
  const chart=test.chart.getChart(),names=layoutApi.getSupportedOverlays(),created=[]
  for(const name of names){const id=chart.createOverlay({name,extendData:'隔离绘图',points:Array.from({length:8},(_,i)=>({timestamp:test.bars[i+1].timestamp,value:12+i}))});if(typeof id!=='string')throw Error('Cannot create '+name);chart.overrideOverlay({id,lock:true,visible:false});const overlay=chart.getOverlays({id})[0];if(!overlay.lock||overlay.visible)throw Error('Cannot edit '+name);chart.removeOverlay({id});if(chart.getOverlays({id}).length)throw Error('Cannot delete '+name);created.push(name)}
  return created
 });assert.ok(drawings.length>40)
 const lifecycle=await page.evaluate(async()=>{
  test.chart.dispose()
  const originalAdd=window.addEventListener,originalRemove=window.removeEventListener,active=new Set()
  window.addEventListener=function(type,listener,...args){if(type==='resize')active.add(listener);return originalAdd.call(this,type,listener,...args)}
  window.removeEventListener=function(type,listener,...args){if(type==='resize')active.delete(listener);return originalRemove.call(this,type,listener,...args)}
  let subscriptions=0,unsubscribes=0,disposals=0
  try {for(let i=0;i<100;i++){setup();for(let j=0;j<10;j++)await Promise.resolve();test.chart.dispose();subscriptions+=test.state.subscriptions;unsubscribes+=test.state.unsubscribes;disposals+=test.state.feedDisposals}}finally{window.addEventListener=originalAdd;window.removeEventListener=originalRemove}
  return {subscriptions,unsubscribes,disposals,listeners:active.size,dom:document.querySelectorAll('.klinecharts-pro-widget').length}
 });assert.equal(lifecycle.subscriptions,100);assert.equal(lifecycle.unsubscribes,100);assert.equal(lifecycle.disposals,100);assert.equal(lifecycle.listeners,0);assert.equal(lifecycle.dom,0)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',reloadFailurePreserves:true,oldRequestLoadingIsolation:true,replayRetry:true,actualLayoutRoundtrip:true,drawings:drawings.length,lifecycle}))
}finally{await browser.close()}
