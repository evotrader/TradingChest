import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1440,height:1000}})
const directory=process.env.TC_BROWSER_EVIDENCE??'/tmp/tradingchest-history-reload-audit'
mkdirSync(directory,{recursive:true})
const results=[],errors=[];page.on('pageerror',error=>errors.push(error.message))
const run=async(name,work)=>{const offset=errors.length;try{await page.goto((process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173')+'/tests/browser/history-state.html');await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setup());await page.waitForFunction(()=>test.state.ready===1);await work();assert.deepEqual(errors.slice(offset),[]);results.push({name,passed:true})}catch(error){results.push({name,passed:false,error:String(error)});await page.screenshot({path:`${directory}/${name}.png`}).catch(()=>{})}finally{await page.evaluate(()=>test.chart.dispose()).catch(()=>{})}}
try{
 await run('reload-keeps-history-and-stream-in-one-full-session-identity',async()=>{
  await page.evaluate(async()=>{
   test.chart.dispose();const {KLineChartPro,createSessionDatafeed}=await import('/src/chart.ts')
   const time=Date.now()-180000,row=(timestamp,price)=>({timestamp,open:price,high:price+1,low:price-1,close:price,volume:1}),opens=[],callbacks=[],states=[]
   const feed=createSessionDatafeed({searchSymbols:async()=>[],openSession:()=>{const index=opens.length,adjustment=index?'split-adjusted':'raw',identity={source:'fixture',ticker:'X',market:'stocks',exchange:'XNAS',currency:'USD',multiplier:1,timespan:'minute',adjustment,sessionFilter:'regular',timezone:'UTC'},owner={history:0,disposed:0,identity};opens.push(owner);return {identity,getHistory:async query=>{owner.history++;return {identity,bars:[row(time,100),row(time+60000,100)].filter(b=>query.kind==='before'?b.timestamp<query.before:b.timestamp>=query.from&&b.timestamp<query.to),basis:adjustment,hasMoreBefore:false}},subscribe:callback=>{callbacks.push({callback,identity});return()=>{}},dispose:()=>owner.disposed++}}})
   const chart=new KLineChartPro({container:document.querySelector('#chart'),symbol:{ticker:'X'},period:{multiplier:1,timespan:'minute',text:'1m'},mainIndicators:[],subIndicators:[],datafeed:feed,onDataState:s=>states.push(structuredClone(s))})
   window.test={chart,feed,opens,callbacks,states,time,row};
  })
  await page.waitForFunction(()=>test.states.at(-1)?.dataStatus==='ready');await page.evaluate(()=>test.chart.reloadData())
  assert.deepEqual(await page.evaluate(()=>test.opens.map(o=>({history:o.history,disposed:o.disposed}))),[{history:2,disposed:0}])
  await page.evaluate(()=>test.callbacks.at(-1).callback({identity:test.callbacks.at(-1).identity,bar:test.row(test.time+120000,101),kind:'update'}))
  assert.deepEqual(await page.evaluate(()=>({prices:test.chart.getChart().getDataList().map(b=>b.close),basis:test.states.at(-1).basis})),{prices:[100,100,101],basis:'raw'})
  await page.evaluate(()=>test.chart.dispose());assert.equal(await page.evaluate(()=>test.opens[0].disposed),1)
 })
 await run('empty-page-retry-keeps-ready-series-and-empty-last-read',async()=>{
  await page.evaluate(()=>{test.state.failPage=true;test.older()});await page.waitForFunction(()=>test.lastState().error?.includes('隔离历史读取失败'))
  await page.evaluate(async()=>{test.state.failPage=false;const original=test.feed.getHistoryKLineData;test.feed.getHistoryKLineData=(s,p,q,c)=>q.kind==='before'&&q.before<=test.first?Promise.resolve({bars:[],basis:'raw',metadata:{state:'empty'},hasMoreBefore:false}):original(s,p,q,c);await test.chart.retryData()})
  const state=await page.evaluate(()=>test.lastState());assert.equal(state.dataStatus,'ready');assert.equal(state.lastRead.metadata.state,'empty');assert.equal(state.lastRead.hasMoreBefore,false);assert.equal(state.error,undefined);assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),500)
 })
 await run('reload-retains-page-committed-during-range-prefetch',async()=>{
  await page.evaluate(()=>{const original=test.feed.getHistoryKLineData;test.feed.getHistoryKLineData=async(s,p,q,c)=>{if(q.kind==='range')await new Promise(resolve=>test.release=resolve);return original(s,p,q,c)};test.task=test.chart.reloadData();test.task.catch(()=>{})})
  await page.waitForFunction(()=>!!test.release);await page.evaluate(()=>test.older());await page.waitForFunction(()=>test.chart.getChart().getDataList().length===520)
  await page.evaluate(()=>{test.release();return test.task});assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),520);assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList()[0].timestamp),Date.parse('2026-10-09T06:40:00Z'))
 })
 await run('basis-change-rejects-stale-coverage-then-retries-current-range',async()=>{
  await page.evaluate(()=>{const original=test.feed.getHistoryKLineData;test.feed.getHistoryKLineData=async(s,p,q,c)=>{if(q.kind==='range'){if(!test.released)await new Promise(resolve=>test.release=()=>{test.released=true;resolve()});const result=await original(s,p,q,c);return {...result,basis:'adjusted',bars:result.bars.map(b=>({...b,open:b.open*2,high:b.high*2,low:b.low*2,close:b.close*2}))}}return original(s,p,q,c)};test.task=test.chart.reloadData().then(()=>({resolved:true}),e=>({error:e.message}))})
  await page.waitForFunction(()=>!!test.release);await page.evaluate(()=>test.older());await page.waitForFunction(()=>test.chart.getChart().getDataList().length===520)
  const outcome=await page.evaluate(()=>{test.release();return test.task});assert.match(outcome.error??'',/未覆盖全部已加载历史/);assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),520);assert.equal(await page.evaluate(()=>test.lastState().basis),'raw')
  await page.evaluate(()=>test.chart.retryData());assert.equal(await page.evaluate(()=>test.lastState().basis),'adjusted');assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),520)
 })
 await run('reload-preserves-viewport-changed-during-prefetch',async()=>{
  await page.evaluate(()=>{test.chart.getChart().scrollToDataIndex(300,0);test.state.hold=true;test.task=test.chart.reloadData();test.task.catch(()=>{})});await page.waitForFunction(()=>!!test.state.release)
  const during=await page.evaluate(()=>{const chart=test.chart.getChart();chart.setBarSpace(11);chart.scrollToDataIndex(180,0);const range=chart.getVisibleRange(),anchor=chart.getDataList()[range.to-1].timestamp;return {range,anchor,x:chart.convertToPixel({timestamp:anchor},{paneId:'candle_pane'}).x}})
  await page.evaluate(()=>{test.state.hold=false;test.state.release();return test.task})
  const after=await page.evaluate(anchor=>{const chart=test.chart.getChart();return {range:chart.getVisibleRange(),space:chart.getBarSpace().bar,x:chart.convertToPixel({timestamp:anchor},{paneId:'candle_pane'}).x}},during.anchor)
  assert.equal(after.space,11);assert.ok(Math.abs(after.x-during.x)<0.01);assert.ok(Math.abs(after.range.realFrom-during.range.realFrom)<1e-6)
 })
 await run('reload-retains-stream-bar-after-range-upper-bound',async()=>{
  await page.evaluate(()=>{const subscribe=test.feed.subscribe;test.feed.subscribe=(s,p,callback)=>{test.live=callback;return subscribe(s,p,callback)};test.state.hold=true;test.task=test.chart.reloadData();test.task.catch(()=>{})})
  await page.waitForFunction(()=>!!test.state.release)
  // The existing initial subscription predates the wrapper; reinstall it before the actual held read.
  await page.evaluate(()=>{test.state.hold=false;test.state.release();return test.task})
  await page.evaluate(()=>{test.state.hold=true;test.task=test.chart.reloadData();test.task.catch(()=>{})});await page.waitForFunction(()=>!!test.state.release)
  const timestamp=await page.evaluate(()=>{const timestamp=test.state.requests.at(-1).to;test.live({timestamp,open:11,high:13,low:10,close:12,volume:2});return timestamp})
  await page.evaluate(()=>{test.state.hold=false;test.state.release();return test.task});assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().at(-1).timestamp),timestamp)
 })
 await run('reload-preserves-newer-same-bar-and-applies-history-revisions',async()=>{
  await page.evaluate(()=>{const subscribe=test.feed.subscribe;test.feed.subscribe=(s,p,callback)=>{test.live=callback;return subscribe(s,p,callback)}})
  await page.evaluate(()=>test.chart.reloadData())
  await page.evaluate(()=>{const read=test.feed.getHistoryKLineData;test.feed.getHistoryKLineData=async(s,p,q,c)=>{const result=await read(s,p,q,c);if(q.kind==='range'){result.bars=result.bars.map((b,i)=>i===0?{...b,close:b.open+.25}:b);await new Promise(resolve=>test.release=resolve)}return result};test.task=test.chart.reloadData();test.task.catch(()=>{})})
  await page.waitForFunction(()=>!!test.release)
  const price=await page.evaluate(()=>{const bar=test.chart.getChart().getDataList().at(-1),close=bar.open+.5;test.live({...bar,close});return close})
  assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().at(-1).close),price)
  await page.evaluate(()=>{test.release();return test.task})
  assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().at(-1).close),price)
  assert.equal(await page.evaluate(()=>{const bar=test.chart.getChart().getDataList()[0];return bar.close-bar.open}),.25)
 })
 await run('commit-callback-switch-preserves-new-identity-failure-and-retry',async()=>{
  await page.evaluate(()=>{const subscribe=test.feed.subscribe;test.feed.subscribe=(s,p,callback)=>{test.arm=true;return subscribe(s,p,callback)};test.state.onState=state=>{if(test.arm&&state.symbol.ticker==='TEST'){test.arm=false;test.state.onState=undefined;test.state.failStatus=true;test.chart.setSymbol({ticker:'Y'})}};test.task=test.chart.reloadData().then(()=>({resolved:true}),error=>({name:error.name}))})
  await page.waitForFunction(()=>test.lastState().symbol.ticker==='Y'&&!!test.lastState().error)
  const before=await page.evaluate(async()=>({outcome:await test.task,count:test.state.requests.length,state:test.lastState(),errorVisible:!!document.querySelector('.klinecharts-pro-data-error')}))
  assert.equal(before.state.dataStatus,'unconfirmed');assert.equal(before.errorVisible,true);assert.equal(before.outcome.name,'AbortError');assert.equal(await page.evaluate(()=>test.state.ready),1)
  await page.evaluate(()=>{test.state.failStatus=false;return test.chart.retryData()})
  assert.equal(await page.evaluate(()=>test.state.requests.length),before.count+1);assert.equal(await page.evaluate(()=>test.lastState().dataStatus),'ready');assert.equal(await page.evaluate(()=>test.lastState().error),undefined)
 })
 await run('rollback-callback-switch-does-not-install-old-identity-retry',async()=>{
  await page.evaluate(()=>{const subscribe=test.feed.subscribe;let first=true;test.feed.subscribe=(s,p,callback)=>{if(first){first=false;test.arm=true;throw Error('isolated subscribe preparation failure')}return subscribe(s,p,callback)};test.state.onState=state=>{if(test.arm&&state.symbol.ticker==='TEST'){test.arm=false;test.state.onState=undefined;test.chart.setSymbol({ticker:'Y'})}};test.task=test.chart.reloadData().then(()=>({resolved:true}),error=>({message:error.message}))})
  await page.waitForFunction(()=>test.lastState().symbol.ticker==='Y'&&test.lastState().dataStatus==='ready')
  const before=await page.evaluate(async()=>({outcome:await test.task,count:test.state.requests.length,state:test.lastState()}))
  assert.match(before.outcome.message,/preparation failure/);assert.equal(before.state.error,undefined)
  await page.evaluate(()=>test.chart.retryData());assert.equal(await page.evaluate(()=>test.state.requests.length),before.count)
 })
 await run('loading-callback-identity-switch-does-not-leave-stale-retry',async()=>{
  await page.evaluate(()=>{test.state.onState=state=>{if(state.symbol.ticker==='TEST'&&state.restoring){test.state.onState=undefined;test.chart.setSymbol({ticker:'Y'})}};test.task=test.chart.reloadData().then(()=>({resolved:true}),e=>({name:e.name}))})
  await page.waitForFunction(()=>test.lastState().symbol.ticker==='Y'&&test.lastState().dataStatus==='ready');const count=await page.evaluate(()=>test.state.requests.length);await page.evaluate(()=>test.chart.retryData());assert.equal(await page.evaluate(()=>test.state.requests.length),count)
 })
}finally{await browser.close();writeFileSync(process.argv[2]??`${directory}/evidence.json`,JSON.stringify({results,errors},null,2)+'\n')}
console.log(JSON.stringify({results,errors},null,2));if(results.some(r=>!r.passed)||errors.length)process.exitCode=1
