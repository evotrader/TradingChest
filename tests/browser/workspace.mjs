import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
const browser = await launchBrowser()
try{
 const page=await browser.newPage({viewport:{width:1280,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto((process.env.TC_BROWSER_BASE||'http://127.0.0.1:4173')+'/tests/browser/workspace.html');await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setupWorkspace())
 await page.getByLabel('标的 secondary-1',{exact:true}).selectOption('B.X')
 await page.getByLabel('周期 secondary-1',{exact:true}).selectOption({label:'1h'})
 await page.waitForFunction(()=>workspace.getCells().every(c=>c.chart)&&workspace.getCells()[1].chart.getPeriod().timespan==='hour')
 assert.equal(await page.evaluate(()=>workspace.getCells()[1].symbol.ticker),'B.X')
 for(let i=0;i<20;i++)await page.getByLabel('左右宽度').press('ArrowRight')
 await page.getByText('同步十字线',{exact:true}).click();await page.getByRole('button',{name:'活动窗格 primary',exact:true}).click()
 const mouse=await page.evaluate(()=>{
  const source=charts.primary.getChart(),target=charts['secondary-1'].getChart();source.setBarSpace(6);source.scrollToDataIndex(1000,0);target.scrollToDataIndex(20,0)
  const rect=source.getDom('candle_pane','main').getBoundingClientRect(),pixel=source.convertToPixel({dataIndex:960},{paneId:'candle_pane'})
  return {x:rect.x+pixel.x,y:rect.y+80,timestamp:source.getDataList()[960].timestamp}
 })
 await page.mouse.move(mouse.x,mouse.y)
 await page.waitForFunction(timestamp=>{const c=charts['secondary-1'].getChart().getChartStore().getCrosshair();return c.paneId==='candle_pane'&&c.timestamp===timestamp},mouse.timestamp)
 await page.mouse.move(mouse.x+6,mouse.y)
 await page.waitForFunction(()=>{const c=charts['secondary-1'].getChart().getChartStore().getCrosshair();return c.paneId===undefined&&c.x===undefined})
 await page.mouse.move(mouse.x,mouse.y)
 await page.waitForFunction(timestamp=>charts['secondary-1'].getChart().getChartStore().getCrosshair().timestamp===timestamp,mouse.timestamp)
 await page.mouse.move(1250,1190)
 await page.waitForFunction(()=>charts['secondary-1'].getChart().getChartStore().getCrosshair().paneId===undefined)
 const result=await page.evaluate(()=>{
  const source=charts.primary.getChart(),target=charts['secondary-1'].getChart()
  source.setBarSpace(1);source.scrollToDataIndex(1500,0)
  const window=visibleTimestamps(source),synced=syncViewport(target,window),actual=visibleTimestamps(target),before=JSON.stringify(target.getVisibleRange())
  const absent=syncViewport(target,{from:1,to:2}),retained=JSON.stringify(target.getVisibleRange())===before
  return {synced,actual,window,absent,retained,widths:[source.getSize('candle_pane','main')?.width,target.getSize('candle_pane','main')?.width],space:target.getBarSpace()}
 })
 console.log(JSON.stringify(result));assert.equal(result.synced,true);assert.equal(result.absent,false);assert.equal(result.retained,true)
 assert.ok(result.actual.to<=result.window.to&&result.actual.from>=result.window.from-3600000)
 await page.evaluate(()=>workspace.dispose());assert.equal(await page.evaluate(()=>subscriptions),0)
 const cleanup=await page.evaluate(async()=>{
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,listeners=new Map(),owned=new Set(),NativeObserver=window.ResizeObserver,observers=new Map()
  EventTarget.prototype.addEventListener=function(type,handler,...args){if(type==='mouseleave'){let set=listeners.get(this);if(!set){set=new Set();listeners.set(this,set)}set.add(handler);if(new Error().stack.includes('workspace/ChartWorkspace.ts'))owned.add(handler)}return add.call(this,type,handler,...args)}
  EventTarget.prototype.removeEventListener=function(type,handler,...args){if(type==='mouseleave')listeners.get(this)?.delete(handler);return remove.call(this,type,handler,...args)}
  window.ResizeObserver=class extends NativeObserver{observe(target,...args){let set=observers.get(this);if(!set){set=new Set();observers.set(this,set)}set.add(target);super.observe(target,...args)}disconnect(){observers.delete(this);super.disconnect()}}
  try{
   for(let i=0;i<100;i++){await setupWorkspace();workspace.dispose();if(subscriptions!==0)throw Error('Workspace subscription remained active')}
   return {cycles:100,subscriptions,workspaceMouseleaveListeners:[...listeners.values()].reduce((n,s)=>n+[...s].filter(h=>owned.has(h)).length,0),connectedMouseleaveListeners:[...listeners.entries()].reduce((n,[target,s])=>n+(target.isConnected?s.size:0),0),observers:observers.size,widgets:document.querySelectorAll('.klinecharts-pro-widget').length,detachedEngineListeners:[...listeners.entries()].reduce((n,[target,s])=>n+(!target.isConnected?[...s].filter(h=>!owned.has(h)).length:0),0)}
  }finally{EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;window.ResizeObserver=NativeObserver}
 })
 const {detachedEngineListeners,...active}=cleanup
 assert.deepEqual(active,{cycles:100,subscriptions:0,workspaceMouseleaveListeners:0,connectedMouseleaveListeners:0,observers:0,widgets:0})
 assert.deepEqual(errors,[]);console.log('PASS: actual v10 timestamp, differing-period viewport and cleanup',JSON.stringify(result))
 console.log('PASS: workspace cleanup',JSON.stringify(cleanup))
}finally{await browser.close()}
