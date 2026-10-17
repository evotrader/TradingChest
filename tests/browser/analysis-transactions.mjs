import {launchBrowser} from './support.mjs'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
const {expect}=createRequire(import.meta.url)('@playwright/test')
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1440,height:1100}})
const directory=process.env.TC_BROWSER_EVIDENCE??'/tmp/tradingchest-analysis-transactions'
mkdirSync(directory,{recursive:true})
const results=[],errors=[]
page.on('pageerror',error=>errors.push(error.message))
const fresh=async()=>{
 await page.goto((process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173')+'/tests/browser/analysis.html')
 await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setup());await page.waitForFunction(()=>test.state.ready>0)
}
const run=async(name,work)=>{
 const errorCount=errors.length
 try{await fresh();await work();assert.deepEqual(errors.slice(errorCount),[]);results.push({name,passed:true})}
 catch(error){results.push({name,passed:false,error:String(error)});await page.screenshot({path:`${directory}/${name}-failure.png`}).catch(()=>{})}
 finally{await page.evaluate(()=>test?.chart.dispose()).catch(()=>{})}
}
try{
 for(const failFirst of [false,true])await run(`snapshot-during-subscription-${failFirst?'failure-retry':'success'}`,async()=>{
  const before=await page.evaluate(failFirst=>{
   const last=test.bars.at(-1),next={...last,timestamp:last.timestamp+60000};test.queued=next;let supplied=false
   test.feed.subscribe=()=>{test.state.subscriptions++;if(!supplied){supplied=true;void test.chart.applySnapshot({symbol:test.chart.getSymbol(),period:test.chart.getPeriod(),basis:'raw',bars:[...test.bars,next]})}if(test.state.failSubscribe)throw Error('Isolated preparation subscription failure')}
   test.chart.startReplay(5);const token=test.context().token;test.state.failSubscribe=failFirst;test.chart.stopReplay();return {token}
  },failFirst)
  if(failFirst){await expect(page.locator('.klinecharts-pro-data-error')).toContainText('回放恢复失败');assert.deepEqual(await page.evaluate(()=>({bars:test.chart.getChart().getDataList().length,token:test.context().token,subscriptions:test.state.subscriptions})),{bars:5,token:before.token,subscriptions:0});await page.evaluate(()=>{test.state.failSubscribe=false;test.chart.stopReplay()})}
  await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0)
  await page.waitForFunction(()=>test.chart.getChart().getDataList().length===21,{},{timeout:3000})
  assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().at(-1).timestamp),await page.evaluate(()=>test.queued.timestamp))
  assert.equal(await page.evaluate(()=>test.state.subscriptions),1)
 })
 await run('ordinary-reload-subscription-rollback',async()=>{
  const before=await page.evaluate(()=>{test.addLayers();test.before={context:test.context(),bars:test.chart.getChart().getDataList().map(b=>({...b})),bindings:test.bindings(),ready:test.state.ready};test.state.basis='adjusted';test.state.bars=test.bars.map(b=>({...b,open:b.open*2,high:b.high*2,low:b.low*2,close:b.close*2}));test.state.failSubscribe=true;return test.before})
  const rejected=await page.evaluate(async()=>{try{await test.chart.reloadData();return false}catch{return true}})
  assert.equal(rejected,true,'Reload must reject when its subscription failed')
  assert.deepEqual(await page.evaluate(()=>({context:test.context(),bars:test.chart.getChart().getDataList(),bindings:test.bindings(),ready:test.state.ready})),before)
  assert.equal(await page.evaluate(()=>test.state.subscriptions),0)
  await page.evaluate(async()=>{test.state.failSubscribe=false;await test.chart.reloadData()})
  assert.equal(await page.evaluate(()=>test.context().basis),'adjusted');assert.notEqual(await page.evaluate(()=>test.context().token),before.context.token)
  assert.equal(await page.evaluate(()=>test.state.subscriptions),1)
  assert.equal(await page.evaluate(()=>test.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).length),0)
 })
 await run('comparison-staged-until-composite-commit',async()=>{
  const before=await page.evaluate(async()=>{
   test.memberBars=test.bars.map(b=>({...b,open:b.open*2,high:b.high*2,low:b.low*2,close:b.close*2}));test.memberSubscriptions=0
   const feed={searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,query)=>({...window.historyResult(query,test.memberBars),basis:'member-raw'}),subscribe:()=>{test.memberSubscriptions++;if(test.memberFailSubscribe)throw Error('Isolated member subscription failure')},unsubscribe:()=>test.memberSubscriptions--}
   await test.chart.addComparison({ticker:'OTHER'},feed);test.chart.startReplay(5)
   const state=test.chart.getComparisons();test.before={handle:state.handles[0],notice:state.notice,main:test.chart.getChart().getDataList().map(b=>({...b})),token:test.context().token}
   test.memberBars=test.memberBars.map((b,i)=>i===4?{...b,close:102,high:103}:b);test.state.failSubscribe=true;test.chart.stopReplay();return test.before
  })
  await expect(page.locator('.klinecharts-pro-data-error')).toContainText('回放恢复失败')
  const unchanged=async()=>{const current=await page.evaluate(()=>({state:test.chart.getComparisons(),main:test.chart.getChart().getDataList(),token:test.context().token}));assert.deepEqual(current.state.handles[0],before.handle);assert.equal(current.state.notice,before.notice);assert.equal(current.state.replay,true);assert.deepEqual(current.main,before.main);assert.equal(current.token,before.token)}
  await unchanged()
  await page.evaluate(()=>{test.state.failSubscribe=false;test.memberFailSubscribe=true;test.chart.stopReplay()})
  await expect(page.locator('.klinecharts-pro-data-error')).toContainText('Isolated member subscription failure');await unchanged()
  assert.deepEqual(await page.evaluate(()=>[test.state.subscriptions,test.memberSubscriptions]),[0,0])
  await page.evaluate(()=>{test.memberFailSubscribe=false;test.chart.stopReplay()});await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0)
  const committed=await page.evaluate(()=>{const h=test.chart.getComparisons().handles[0];return {value:test.chart.getChart().getIndicators({id:h.indicatorId})[0].extendData.valueAt(test.bars[4].timestamp),subscriptions:[test.state.subscriptions,test.memberSubscriptions]}})
  assert.ok(Math.abs(committed.value-(102/22-1)*100)<1e-8);assert.deepEqual(committed.subscriptions,[1,1])
 })
 for(const mode of ['reload','replay'])for(const failFirst of [false,true])await run(`main-synchronous-bar-${mode}-${failFirst?'failure-retry':'success'}`,async()=>{
  await page.evaluate(({mode,failFirst})=>{
   test.failSynchronous=failFirst
   test.feed.subscribe=(_s,_p,callback)=>{test.state.subscriptions++;const last=test.bars.at(-1),close=test.failSynchronous?999:31,bar={...last,timestamp:last.timestamp+60000,close,high:close+1};callback(bar);bar.close=NaN;if(test.failSynchronous)throw Error('Isolated synchronous main failure')}
   test.initialToken=test.context().token;if(mode==='replay')test.chart.startReplay(5)
  },{mode,failFirst})
  const restore=async()=>{if(mode==='replay')await page.evaluate(()=>test.chart.stopReplay());else return page.evaluate(async()=>{try{await test.chart.reloadData();return false}catch{return true}})}
  const rejected=await restore()
  if(failFirst){if(mode==='replay')await expect(page.locator('.klinecharts-pro-data-error')).toContainText('回放恢复失败');else assert.equal(rejected,true);assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),mode==='replay'?5:20);assert.equal(await page.evaluate(()=>test.context().token),await page.evaluate(()=>test.initialToken));assert.equal(await page.evaluate(()=>test.state.subscriptions),0);await page.evaluate(()=>{test.failSynchronous=false});await restore()}
  await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0)
  assert.deepEqual(await page.evaluate(()=>({bars:test.chart.getChart().getDataList().length,close:test.chart.getChart().getDataList().at(-1).close,subscriptions:test.state.subscriptions})),{bars:21,close:31,subscriptions:1})
 })
 for(const mode of ['bar','snapshot'])for(const failFirst of [false,true])await run(`comparison-synchronous-${mode}-${failFirst?'failure-retry':'success'}`,async()=>{
  await page.evaluate(async({mode,failFirst})=>{
   test.syncMemberSubscriptions=0;test.deliverSync=false;test.failSynchronous=failFirst
   const feed={searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,query)=>window.historyResult(query,test.bars),unsubscribe:()=>test.syncMemberSubscriptions--}
   const subscribe=callback=>{test.syncMemberSubscriptions++;if(test.deliverSync){const rows=test.bars.map(b=>({...b}));rows.at(-1).close=test.failSynchronous?999:91;rows.at(-1).high=rows.at(-1).close+1;callback(mode==='bar'?rows.at(-1):{bars:rows});rows.at(-1).close=NaN;if(test.failSynchronous)throw Error('Isolated synchronous member failure')}}
   if(mode==='snapshot'){feed.subscribe=()=>{};feed.subscribeSnapshots=(_s,_p,callback)=>subscribe(callback)}else feed.subscribe=(_s,_p,callback)=>subscribe(callback)
   test.syncHandle=await test.chart.addComparison({ticker:'SYNC'},feed);test.chart.startReplay(5);test.initialToken=test.context().token;test.deliverSync=true;test.chart.stopReplay()
  },{mode,failFirst})
  if(failFirst){await expect(page.locator('.klinecharts-pro-data-error')).toContainText('回放恢复失败');assert.equal(await page.evaluate(()=>test.context().token),await page.evaluate(()=>test.initialToken));assert.deepEqual(await page.evaluate(()=>[test.state.subscriptions,test.syncMemberSubscriptions]),[0,0]);await page.evaluate(()=>{test.failSynchronous=false;test.chart.stopReplay()})}
  await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0)
  const state=await page.evaluate(()=>({value:test.chart.getComparisons().handles[0].plottedReturn,subscriptions:[test.state.subscriptions,test.syncMemberSubscriptions]}))
  assert.ok(Number.isFinite(state.value)&&Math.abs(state.value-(91/11-1)*100)<1e-8);assert.deepEqual(state.subscriptions,[1,1])
 })
 for(const change of ['known-member','unknown-member','mutable-source'])await run(`comparison-pending-${change}`,async()=>{
  await page.evaluate(async change=>{
   const makeFeed=key=>({searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,query)=>window.historyResult(query,test[key]),subscribe:()=>{},unsubscribe:()=>{}})
   test.aBars=test.bars.map(b=>({...b}));test.bBars=test.bars.map(b=>({...b}))
   test.a=await test.chart.addComparison({ticker:'A'},makeFeed('aBars'));test.b=await test.chart.addComparison({ticker:'B'},makeFeed('bBars'))
   test.chart.startReplay(5);test.previousToken=test.context().token
   test.bBars=test.bBars.map((b,i)=>i===4?{...b,close:51,high:52}:b)
   test.state.hold=true;test.chart.stopReplay()
  },change)
  await page.waitForFunction(()=>typeof test.state.release==='function')
  await page.evaluate(change=>{if(change==='known-member')test.chart.removeComparison(test.a.id);else if(change==='unknown-member')test.chart.removeComparison('does-not-exist');else test.bBars[4].close=NaN;test.state.hold=false;test.state.release()},change)
  if(change==='known-member'){
   await expect(page.locator('.klinecharts-pro-data-error')).toContainText('取消')
   assert.deepEqual(await page.evaluate(()=>({bars:test.chart.getChart().getDataList().length,token:test.context().token,members:test.chart.getComparisons().handles.map(h=>h.symbol.ticker)})),await page.evaluate(()=>({bars:5,token:test.previousToken,members:['B']})))
   await page.evaluate(()=>test.chart.stopReplay())
  }
  await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0)
  const value=await page.evaluate(()=>{const h=test.chart.getComparisons().handles.find(h=>h.symbol.ticker==='B');return test.chart.getChart().getIndicators({id:h.indicatorId})[0].extendData.valueAt(test.bars[4].timestamp)})
  assert.ok(Number.isFinite(value)&&Math.abs(value-(51/11-1)*100)<1e-8)
 })
 for(const kind of ['symbol','period','empty-symbol'])await run(`layout-lifecycle-${kind}`,async()=>{
  if(kind==='empty-symbol'){await page.evaluate(()=>{test.state.bars=[];test.chart.setSymbol({ticker:'EMPTY'})});await page.waitForFunction(()=>test.state.ready>=2);assert.equal(await page.evaluate(()=>test.context()),null)}
  await page.evaluate(()=>{const layout=test.capture();layout.indicators.push({id:'audit-lazy-id',name:'example:lazy',placement:'main',paneId:'candle_pane',calcParams:[],visible:true});test.restoration=test.restore(layout).then(()=>({rejected:false}),error=>({rejected:true,name:error.name}));test.readyBefore=test.state.ready})
  await page.waitForFunction(()=>typeof window.releaseLazy==='function')
  await page.evaluate(kind=>{if(kind==='period')test.chart.setPeriod({multiplier:1,timespan:'hour',text:'1h'});else test.chart.setSymbol({ticker:'OTHER'})},kind)
  await page.waitForFunction(()=>test.state.ready>test.readyBefore)
  await page.evaluate(kind=>{test.readyBefore=test.state.ready;if(kind==='period')test.chart.setPeriod({multiplier:1,timespan:'minute',text:'1m'});else test.chart.setSymbol({ticker:kind==='empty-symbol'?'EMPTY':'TEST'})},kind)
  await page.waitForFunction(()=>test.state.ready>test.readyBefore)
  const outcome=await page.evaluate(async()=>{window.releaseLazy();const result=await test.restoration;return {...result,instances:test.chart.getChart().getIndicators({id:'audit-lazy-id'}).length,main:test.chart.getChart().getIndicators({name:'MA'}).length}})
  assert.deepEqual(outcome,{rejected:true,name:'AbortError',instances:0,main:1})
 })
 await run('invalid-event-time-retains-last-confirmed-data',async()=>{
  const value=await page.evaluate(()=>{const handle=test.chart.addAnalysisLayer(test.context(),{id:'safe-events',label:'safe',type:'events',data:[{id:'ok',label:'original',timestamp:test.bars[0].timestamp}]});let rejected=false;try{handle.replaceData([{id:'invalid',label:'invalid',timestamp:1e100}])}catch{rejected=true}return {rejected}})
  assert.equal(value.rejected,true);await expect(page.locator('[data-analysis-layer="safe-events"]')).toContainText('original')
 })
 await run('interval-intersects-viewport-with-original-click',async()=>{
  await page.evaluate(async()=>{test.state.bars=Array.from({length:200},(_,i)=>({...test.bars[0],timestamp:test.bars[0].timestamp+i*60000}));await test.chart.reloadData();test.chart.addAnalysisLayer(test.context(),{id:'wide-range',label:'wide',type:'events',data:[{id:'interval',label:'Original interval',timestamp:test.state.bars[10].timestamp,endTimestamp:test.state.bars[180].timestamp}]});const c=test.chart.getChart();c.setBarSpace(30);c.scrollToDataIndex(150,0)})
  await page.waitForFunction(()=>{const r=test.chart.getChart().getVisibleRange();return r.from>10&&r.to<180})
  await page.waitForFunction(()=>{const c=test.chart.getChart(),i=c.getIndicators({name:'TC_ANALYSIS'})[0],h=i.extendData.getHits().find(h=>h.event.id==='interval'),rect=c.getDom(i.paneId,'main').getBoundingClientRect();return h&&h.y>0&&h.y<rect.height},{},{timeout:3000})
  const hit=await page.evaluate(()=>{const c=test.chart.getChart(),i=c.getIndicators({name:'TC_ANALYSIS'})[0],h=i.extendData.getHits()[0],rect=c.getDom(i.paneId,'main').getBoundingClientRect();return {x:rect.left+(h.x+(h.endX??h.x))/2,y:rect.top+h.y}})
  const target=await page.evaluate(({x,y})=>({tag:document.elementFromPoint(x,y)?.tagName,html:document.elementFromPoint(x,y)?.outerHTML.slice(0,150)}),hit)
  await page.mouse.click(hit.x,hit.y)
  assert.deepEqual(await page.evaluate(()=>({id:test.state.events.at(-1)?.event.id,time:test.state.events.at(-1)?.timestamp})),await page.evaluate(()=>({id:'interval',time:test.state.bars[10].timestamp})),JSON.stringify({hit,target,after:await page.evaluate(()=>{const c=test.chart.getChart(),i=c.getIndicators({name:'TC_ANALYSIS'})[0],r=c.getDom(i.paneId,'main').getBoundingClientRect();return {hits:i.extendData.getHits(),rect:{x:r.x,y:r.y,width:r.width,height:r.height}}})}))
 })
 writeFileSync(directory+'/analysis-transactions-results.json',JSON.stringify({results,errors},null,2)+'\n')
 console.log(JSON.stringify({results,errors},null,2));assert.ok(results.every(r=>r.passed),'Analysis transaction audit failed')
}finally{await browser.close()}
