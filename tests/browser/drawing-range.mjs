import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {launchBrowser} from './support.mjs'
const browser=await launchBrowser(),errors=[],results=[]
try{
 const page=await browser.newPage({viewport:{width:1400,height:1100}});page.on('pageerror',error=>errors.push(error.stack??error.message));page.setDefaultTimeout(15000)
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-sharing.html?database=tc-range-${Date.now()}`)
 await page.waitForFunction(()=>workspace.getCells()[0]?.chart?.getDrawingState().sharing?.host)
 await page.getByRole('combobox',{name:'图表布局',exact:true}).selectOption('2')
 await page.waitForFunction(()=>workspace.getCells().length===2&&workspace.getCells().every(cell=>cell.chart?.getDrawingState().sharing?.host))
 await page.evaluate(async()=>{
  window.a=workspace.getCells()[0].chart;window.b=workspace.getCells()[1].chart
  window.writes=0;const write=store.write.bind(store);store.write=(...args)=>{writes++;return write(...args)}
  window.make=(id,start,end)=>({logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',lock:false,visible:true,extendData:null,styles:null,points:[{timestamp:start,value:100},{timestamp:end,value:101}]},anchors:[{kind:'market',timestamp:start,value:100},{kind:'market',timestamp:end,value:101}],presentation:{scope:'chart'}})
  const data=a.getChart().getDataList();window.timestamps=[data.at(-10).timestamp,data.at(-5).timestamp]
  for(const id of ['local-range','shared-range']){
   await a.commitDrawing({kind:'create',logicalId:id,after:make(id,...timestamps),source:'programmatic'})
   if(id==='shared-range')assertAccepted(await a.executeDrawingCommand({type:'transfer',ids:[id],scope:'host'}))
  }
  function assertAccepted(result){if(result.status!=='completed')throw Error(JSON.stringify(result))}
  window.original=JSON.stringify(a.getDrawings());window.beforeWrites=writes
 })
 // Public replay controls use the real engine's confirmed prefix, not a fixture replacement.
 await page.locator('[data-cell-id="primary"]').getByText('回放',{exact:true}).click()
 await page.waitForFunction(()=>!!a.getDrawingHistoryState().projectionErrors?.['shared-range']&&!!a.getDrawingHistoryState().projectionErrors?.['local-range'])
 assert.deepEqual(await page.evaluate(()=>({canonical:JSON.stringify(a.getDrawings())===original,primary:['local-range','shared-range'].map(id=>a.getChart().getOverlays({id}).length),secondary:b.getChart().getOverlays({id:'shared-range'}).length,writes:writes-beforeWrites})),{canonical:true,primary:[0,0],secondary:1,writes:0})
 results.push('Replay retains canonical anchors and marks both local and shared projections unavailable without writes')
 await page.evaluate(()=>a.stopReplay())
 await page.waitForFunction(()=>!Object.keys(a.getDrawingHistoryState().projectionErrors??{}).length&&a.getChart().getOverlays({id:'shared-range'}).length===1&&a.getChart().getOverlays({id:'local-range'}).length===1)
 assert.deepEqual(await page.evaluate(()=>({canonical:JSON.stringify(a.getDrawings())===original,writes:writes-beforeWrites})),{canonical:true,writes:0})
 results.push('Leaving replay restores the same local and shared drawings without history or store writes')
 await page.evaluate(async()=>{
  const last=b.getChart().getDataList().at(-1);window.append={...last,timestamp:last.timestamp+60000};window.snapshot={symbol:b.getSymbol(),period:b.getPeriod(),basis:'raw',bars:[append]}
  await b.applySnapshot(snapshot)
  await b.commitDrawing({kind:'create',logicalId:'new-bar-range',after:make('new-bar-range',last.timestamp,append.timestamp),source:'programmatic'})
  const result=await b.executeDrawingCommand({type:'transfer',ids:['new-bar-range'],scope:'host'});if(result.status!=='completed')throw Error(JSON.stringify(result))
 })
 await page.waitForFunction(()=>!!a.getDrawingHistoryState().projectionErrors?.['new-bar-range'])
 assert.equal(await page.evaluate(()=>a.getChart().getOverlays({id:'new-bar-range'}).length),0)
 await page.evaluate(async()=>{window.newOriginal=JSON.stringify(a.getDrawings());window.appendWrites=writes;await a.applySnapshot(snapshot)})
 await page.waitForFunction(()=>a.getChart().getOverlays({id:'new-bar-range'}).length===1&&!Object.keys(a.getDrawingHistoryState().projectionErrors??{}).length)
 assert.deepEqual(await page.evaluate(()=>({canonical:JSON.stringify(a.getDrawings())===newOriginal,writes:writes-appendWrites})),{canonical:true,writes:0})
 results.push('A confirmed new bar recovers a previously unavailable shared projection')
 const sameBar=await page.evaluate(async()=>{
  const before=a.getChart().getOverlays({id:'new-bar-range'})[0],canonical=JSON.stringify(a.getDrawings()),count=writes,state=a.getDrawingHistoryState()
  await a.applySnapshot({...snapshot,bars:[{...append,close:append.close+.01,high:append.high+.01}]})
  return {same:a.getChart().getOverlays({id:'new-bar-range'})[0]===before,canonical:JSON.stringify(a.getDrawings())===canonical,writes:writes-count,history:state.canUndo===a.getDrawingHistoryState().canUndo&&state.canRedo===a.getDrawingHistoryState().canRedo}
 })
 assert.deepEqual(sameBar,{same:true,canonical:true,writes:0,history:true});results.push('Same-bar quotes preserve engine object identity and confirmed history')
 const collision=await page.evaluate(async()=>{
  const e=a.getChart(),last=e.getDataList().at(-1),id='local-recovery-collision',future=last.timestamp+120000
  await a.commitDrawing({kind:'create',logicalId:id,after:make(id,last.timestamp,future),source:'programmatic'})
  const canonical=JSON.stringify(a.getDrawings()),beforeError=!!a.getDrawingHistoryState().projectionErrors[id]
  e.createOverlay({id,name:'rect',lock:true,points:[{timestamp:last.timestamp,value:80},{timestamp:last.timestamp,value:120}],extendData:{external:true}})
  const external=e.getOverlays({id})[0],original=JSON.stringify({points:external.points,data:external.extendData,lock:external.lock})
  await a.applySnapshot({...snapshot,bars:[{...last,timestamp:last.timestamp+60000}]})
  const failedCleanup=e.getOverlays({id})[0]===external
  await a.applySnapshot({...snapshot,bars:[{...last,timestamp:future}]})
  return {beforeError,failedCleanup,same:e.getOverlays({id})[0]===external,content:JSON.stringify({points:external.points,data:external.extendData,lock:external.lock})===original,canonical:JSON.stringify(a.getDrawings())===canonical,error:a.getDrawingHistoryState().projectionErrors[id]}
 })
 assert.equal(collision.beforeError,true);assert.equal(collision.failedCleanup,true);assert.equal(collision.same,true);assert.equal(collision.content,true);assert.equal(collision.canonical,true);assert.match(collision.error,/宿主.*冲突|宿主对象占用/)
 results.push('Unavailable local recovery and failure cleanup preserve an external same-ID object and report the conflict')
 await page.evaluate(async()=>{
  const {KLineChartPro,DrawingSessionRegistry}=await import('/src/chart.ts'),container=document.createElement('div');container.style.cssText='width:1200px;height:700px';document.body.appendChild(container)
  const bars=b.getChart().getDataList().map(bar=>({...bar})),symbol=b.getSymbol(),period=b.getPeriod();window.bindReads=0;window.failBind=true
  const sessions=new DrawingSessionRegistry({scope:'host',store:{read:async()=>{bindReads++;if(failBind)throw Error('transient read failure');return null},write:async()=>{throw Error('unexpected write')}}})
  window.retryPro=new KLineChartPro({container,symbol,period,drawingHostSessions:sessions,resolveDrawingShareKey:()=>({identity:{namespace:'retry',symbol:{ticker:symbol.ticker,market:symbol.market,exchange:symbol.exchange,priceCurrency:symbol.priceCurrency},priceBasisKey:'raw'},documentId:'retry-doc'}),datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars,basis:'raw',hasMoreBefore:false}),subscribe:()=>{},unsubscribe:()=>{}}})
 })
 await page.waitForFunction(()=>retryPro.getDrawingState().sharing?.reason?.includes('transient read failure'))
 const beforeRetry=await page.evaluate(()=>({reads:bindReads,token:retryPro.getAnalysisContext().token}))
 await page.evaluate(async()=>{failBind=false;await retryPro.reloadData()})
 await page.waitForFunction(()=>!!retryPro.getDrawingState().sharing?.host)
 assert.equal(await page.evaluate(()=>retryPro.getAnalysisContext().token),beforeRetry.token);assert.ok(await page.evaluate(()=>bindReads)>beforeRetry.reads)
 const boundReads=await page.evaluate(()=>bindReads);await page.evaluate(()=>retryPro.reloadData());assert.equal(await page.evaluate(()=>bindReads),boundReads)
 results.push('Same-context reload retries a failed shared binding and deduplicates the successful binding')
 await page.waitForTimeout(100);assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}))
}finally{writeFileSync(process.argv[2],JSON.stringify({results,errors},null,2));await browser.close()}
