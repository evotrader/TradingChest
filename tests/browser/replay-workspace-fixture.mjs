import {KLineChartPro,ChartWorkspace} from '/src/chart.ts'
import {makeBars} from './syntheticBars.ts'

const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
const wait=async(check,label)=>{const deadline=performance.now()+30000;while(!check()){if(performance.now()>deadline)throw Error(label);await new Promise(resolve=>setTimeout(resolve,1))}}
const assert=(condition,message)=>{if(!condition)throw Error(message)}
const period={multiplier:1,timespan:'minute',text:'1m'},symbol={ticker:'REPLAY.TEST',market:'test',exchange:'X',priceCurrency:'USD'},basis='synthetic-unadjusted'
const identity=(s,p)=>({source:'synthetic',ticker:s.ticker,market:s.market,exchange:s.exchange,currency:s.priceCurrency,multiplier:p.multiplier,timespan:p.timespan,adjustment:'none',sessionFilter:'all',timezone:'UTC'})
let workspace,bars=[],subscriptions=0,historyReads=0,replayReads=0,baseline=false,alertDocument,analysis=[],events=[]
const states=new WeakMap(),triggers=[],failures=new Set()
const data=(ticker)=>ticker===symbol.ticker?bars:bars.map(bar=>{const factor=Number(ticker.at(-1))+2;return {...bar,open:bar.open*factor,high:bar.high*factor,low:bar.low*factor,close:bar.close*factor}})
function feed(ticker,owner=ticker){
 const values=data(ticker);let subscribed=false
 return {searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,q)=>{historyReads++;if(failures.has(`history:${owner}`))throw Error(`历史读取失败 ${owner}`);return {bars:q.kind==='before'?values.filter(b=>b.timestamp<q.before):values.filter(b=>b.timestamp>=q.from&&b.timestamp<q.to),basis,metadata:{state:'ready'},hasMoreBefore:false}},
  getReplayHistory:async(s,p,q,context)=>{replayReads++;context.signal.throwIfAborted();if(failures.has(`replay:${owner}`))throw Error(`复盘时钟失败 ${owner}`);const before=values.filter(b=>b.timestamp<q.from).slice(-q.warmupBars),selected=[...before,...values.filter(b=>b.timestamp>=q.from&&b.timestamp<q.to)];return {bars:selected,clocks:selected.map(b=>({timestamp:b.timestamp,completedAt:b.timestamp,availableAt:b.timestamp})),identity:identity(s,p),basis,metadata:{state:selected.length?'ready':'empty'},historyKind:'current-history',coverage:{from:q.from,to:q.to,warmupBars:before.length}}},
  subscribe:()=>{assert(!subscribed,'重复订阅');subscribed=true;subscriptions++;if(failures.has(`subscribe:${owner}`))throw Error(`订阅失败 ${owner}`)},unsubscribe:()=>{if(subscribed){subscribed=false;subscriptions--}}}
}
const cells=()=>workspace.getCells(),primary=()=>cells()[0].chart
const loaded=async()=>{await wait(()=>cells().length>0&&cells().every(c=>c.chart?.getAnalysisContext()),'工作台图表未就绪')}
function mountCell(host,cell){
 let resolve;const ready=new Promise(done=>resolve=done)
 const pro=new KLineChartPro({container:host,symbol:cell.symbol,period:cell.period,mainIndicators:['MA'],subIndicators:['VOL','MACD'],datafeed:feed(cell.symbol.ticker,cell.cellId),drawingAlertScope:`replay-bench:${cell.cellId}`,createComparisonDatafeed:s=>feed(s.ticker),onDataReady:()=>{resolve(pro);if(failures.has(`callback:${cell.cellId}`))throw Error("隔离宿主通知失败")},onDataState:s=>states.set(pro,s),onDrawingAlertTrigger:e=>triggers.push(e),onReplayDrawingAlertTrigger:e=>triggers.push(e)})
 return {ready,dispose:()=>pro.dispose()}
}
function objects(){
 return Array.from({length:1002},(_,i)=>{
  const start=Math.floor(bars.length*.2)+i%80,anchors=[0,1].map(j=>({kind:'market',timestamp:bars[start+j*3].timestamp,value:bars[start].close+(i%17-8)*.1+j*.2})),id=`replay-drawing-${i}`
  return {logicalId:id,owner:'local',anchors,presentation:{name:`对象 ${i}`},overlay:{id,name:'segment',paneId:'candle_pane',groupId:'drawing_tools',points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),styles:null,extendData:null,visible:true,lock:false}}
 })
}
async function installHostLayers({comparisons=true,rules='create'}={}){
 for(const [index,{chart:pro}] of cells().entries()){
  const context=pro.getAnalysisContext();assert(context,'缺少分析上下文')
  if(index===0){
   if(comparisons)for(let i=0;i<3;i++)await pro.addComparison({...symbol,ticker:`COMPARE${i}`},feed(`COMPARE${i}`))
   pro.addAnalysisLayer(context,{id:'replay-events',label:'合成事件',type:'events',data:events})
   if(rules==='create'){
    for(let i=0;i<100;i++){const result=pro.executeDrawingAlertCommand({type:'create',id:`rule-${i}`,drawingLogicalId:`replay-drawing-${i}`,frequency:'once-per-bar'});assert(result.status==='completed',result.message)}
    alertDocument=pro.captureDrawingAlerts()
   }else pro.restoreDrawingAlerts(alertDocument)
  }else pro.addAnalysisLayer(context,{id:'replay-analysis',label:'合成分析',type:'line',placement:'sub',valueType:'scalar',data:analysis})
 }
}
function expectedProjection(position,replay,enabled){
 const prefix=bars.slice(0,position),last=prefix.at(-1),cutoff=last.timestamp,eligible=events.filter(e=>e.timestamp<=cutoff).map(e=>e.id)
 return {position,last,cutoff,eligible,analysis:analysis.filter(p=>p.timestamp<=cutoff),replay,enabled}
}
async function settle(position,replay,enabled){
 const expected=expectedProjection(position,replay,enabled)
 await wait(()=>cells().every(({chart:pro})=>{
  const chart=pro.getChart(),state=states.get(pro),data=chart.getDataList()
  return state?.replay===replay&&!state.restoring&&!state.error&&data.length===position&&['MA','VOL','MACD'].every(name=>chart.getIndicators({name})[0]?.result.length===position)&&chart.getIndicators({name:'TC_ANALYSIS'}).every(i=>i.result.length===position)&&chart.getIndicators({name:'COMPARE'}).every(i=>i.result.length===position)
 }),'实际数据/派生层/模式未完成')
 for(const {chart:pro} of cells()){const chart=pro.getChart();chart.setBarSpace(6);chart.scrollToDataIndex(position-1,0)}
 await frame()
 const completedAt=performance.now()
 // Keep the exhaustive oracle's CPU out of the measured product operation.
 await new Promise(resolve=>setTimeout(resolve,0))
 const projection=cells().map(({chart:pro},index)=>{
  const chart=pro.getChart(),actual=chart.getDataList(),ma=chart.getIndicators({name:'MA'})[0],n=ma.calcParams[0],expectedMA=bars.slice(position-n,position).reduce((sum,b)=>sum+b.close,0)/n
  assert(JSON.stringify(actual.at(-1))===JSON.stringify(expected.last),'末根 OHLCV 不一致')
  assert(actual.every((b,i)=>b.timestamp===bars[i].timestamp&&b.close===bars[i].close&&b.open===bars[i].open&&b.high===bars[i].high&&b.low===bars[i].low),'可见前缀不一致')
  assert(Math.abs((ma.result.at(-1).ma1??ma.result.at(-1).ma5)-expectedMA)<1e-8,'MA 前缀未完成')
  const layers=chart.getIndicators({name:'TC_ANALYSIS'});assert(layers.length===1,'分析层缺失')
  if(index===0){
   const comparison=pro.getComparisons(),lines=chart.getIndicators({name:'COMPARE'})
   assert(comparison.handles.length===3&&lines.length===4&&!comparison.error,'比较成员缺失或失败')
   assert(comparison.baseTimestamp===bars[0].timestamp,'共同基准不一致')
   const pct=(expected.last.close/bars[0].close-1)*100
   assert(lines.every(line=>Math.abs(line.result.at(-1).pct-pct)<1e-8),'比较线尚未绘制目标收益')
   assert(comparison.handles.every(h=>h.plottedTimestamp===expected.cutoff&&Math.abs(h.plottedReturn-pct)<1e-8),'比较快照未完成')
   // v10 merges extendData arrays; the renderer only consumes events in its
   // current timestamp index. Observe that real projection, including offscreen rows.
   const renderer=layers[0].extendData,projected=renderer.events.filter(e=>renderer.indexAt(e.timestamp)!==undefined)
   assert(JSON.stringify(projected.map(e=>e.id))===JSON.stringify(expected.eligible),`事件投影不完整 ${JSON.stringify({expected:expected.eligible.length,actual:projected.length,cutoff:expected.cutoff})}`)
   assert(pro.getDrawings().length===1002&&chart.getOverlays({groupId:'drawing_tools'}).length===1002,'绘图负载不完整')
   const rules=pro.getDrawingAlertState();assert(rules.length===100&&rules.every(r=>r.enabled===enabled),'提醒数量或启用状态不一致')
  }else{
   const visible=layers[0].result.filter(p=>p.value!==undefined)
   assert(visible.length===expected.analysis.length&&visible.every((p,i)=>Math.abs(p.value-expected.analysis[i].value)<1e-9),'分析值缺失')
  }
  const range=chart.getVisibleRange();assert(range.to===position,'视口未到达目标末根')
  return {cellId:cells()[index].cellId,count:actual.length,last:actual.at(-1),mode:states.get(pro).replay?'replay':'live',viewport:{from:range.from,to:range.to},analysisPoints:index?expected.analysis.length:undefined,eventIds:index?undefined:layers[0].extendData.events.filter(e=>layers[0].extendData.indexAt(e.timestamp)!==undefined).map(e=>e.id),drawings:pro.getDrawings().length,rules:index?0:pro.getDrawingAlertState().length,rulesEnabled:index?false:enabled,comparison: index?undefined:{base:pro.getComparisons().baseTimestamp,tickers:pro.getComparisons().handles.map(h=>h.symbol.ticker),value:pro.getComparisons().mainReturn}}
 })
 return {projection,completedAt}
}
const enter=async(position)=>{
 if(baseline)for(const {chart:pro} of cells())pro.startReplay(position)
 else await workspace.startReplay({from:bars[200].timestamp,to:bars.at(-1).timestamp+1,cursor:bars[position-1].timestamp,driverCellId:'primary'})
}
const seek=async(position)=>{if(baseline)for(const {chart:pro} of cells())pro.getReplayEngine().goToPosition(position);else await workspace.seekReplay(bars[position-1].timestamp)}
const exit=async()=>{if(baseline)for(const {chart:pro} of cells())await pro.stopReplay();else await workspace.stopReplay()}
window.replayBench={
 async mount({count,layout,legacy}){
  assert(!workspace,'前一工作台未释放');baseline=legacy;bars=makeBars(count);historyReads=0;replayReads=0;triggers.length=0;failures.clear()
  events=Array.from({length:1000},(_,i)=>{const timestamp=bars[Math.floor(i*(count-1)/999)].timestamp;return {id:`event-${i}`,timestamp,availableAt:timestamp,label:`事件 ${i}`}})
  analysis=events.map((e,i)=>({timestamp:e.timestamp,availableAt:e.timestamp,value:Math.sin(i/7)}))
  workspace=new ChartWorkspace({container:document.querySelector('#charts'),height:layout===4?1400:800,context:'replay-bench',symbols:[symbol],initialSymbol:symbol,initialPeriod:period,getPeriods:async()=>[period],replay:{enabled:true},mountCell})
  await workspace.setLayout(layout);await loaded();primary().restoreDrawings('local',objects());await installHostLayers();await settle(count,false,true)
  return {count,layout,subscriptions,historyReads,replayReads}
 },
 async core(){
  const half=Math.floor(bars.length/2),result=[]
  const check=async(name,action,position,replay)=>{await action();const projection=await settle(position,replay,true);result.push({name,projection:projection.projection,state:workspace.getReplayState()})}
  await check('enter',()=>enter(half),half,true)
  const before={historyReads,replayReads}
  await check('step',()=>workspace.stepReplay('forward'),half+1,true)
  assert(before.historyReads===historyReads&&before.replayReads===replayReads,'步进不能重读历史')
  assert(primary().getReplayEngine()===null,'不能暴露可更改组内时钟的逐图引擎')
  let rejected=false;try{await primary().stopReplay()}catch(error){rejected=error.code==='REPLAY_OWNED'}assert(rejected,'逐图退出必须拒绝')
  await check('seek-forward',()=>seek(Math.floor(bars.length*.75)),Math.floor(bars.length*.75),true)
  await check('seek-backward',()=>seek(Math.floor(bars.length*.25)),Math.floor(bars.length*.25),true)
  await check('exit',exit,bars.length,false)
  return result
 },
 async faults(){
  const half=Math.floor(bars.length/2),result=[]
  for(const cellId of ['primary','secondary-1']){
   failures.add(`replay:${cellId}`);let error;try{await enter(half)}catch(e){error=e}failures.clear();assert(error?.cellId===cellId,'准备失败必须指出来源窗格');await settle(bars.length,false,true);assert(subscriptions===5,'进入失败不得释放原订阅');result.push(`prepare-${cellId}`)
  }
  await enter(half);await settle(half,true,true)
  for(const cellId of ['primary','secondary-1']){
   const pro=cells().find(c=>c.cellId===cellId).chart,chart=pro.getChart(),original=chart.resetData
   let fail=true;chart.resetData=function(...args){if(fail){fail=false;throw Error('隔离绘制应用失败')}return original.apply(this,args)}
   let error;try{await seek(half-100)}catch(e){error=e}finally{chart.resetData=original}
   assert(error?.cellId===cellId,'应用失败必须指出窗格');assert(workspace.getReplayState().phase==='paused','成功回滚后应暂停');await settle(half,true,true);assert(subscriptions===0,'回滚不得遗留实时订阅');result.push(`apply-${cellId}`)
  }
  for(const key of ['history:primary','history:COMPARE1','subscribe:primary','subscribe:secondary-1','subscribe:COMPARE1']){
   failures.add(key);let error;try{await exit()}catch(e){error=e}failures.clear();assert(error,'故障退出不能成功');assert(workspace.getReplayState().phase==='paused','退出失败保留暂停');await settle(half,true,true);assert(subscriptions===0,'退出失败清理已准备订阅');result.push(key)
  }
  await exit();await settle(bars.length,false,true);return result
 },
 async reviewRegressions(){
  const half=Math.floor(bars.length/2),result=[]
  await enter(half);await settle(half,true,true)
  const first=primary().getChart(),ma=first.getIndicators({name:'MA'})[0],calc=ma.calc
  let once=true;ma.calc=function(...args){if(once){once=false;throw Error('隔离指标计算失败')}return calc.apply(this,args)}
  let error;try{await workspace.stepReplay('forward')}catch(e){error=e}finally{ma.calc=calc}
  assert(error?.message.includes('指标'),'计算失败必须拒绝步进');await settle(half,true,true);result.push('calc-failure-rollback')
  const second=cells()[1].chart.getChart(),reset=second.resetData
  let release;ma.calc=function(values,indicator){const result=calc.call(this,values,indicator);if(values.length===half+200)return new Promise(resolve=>{release=()=>resolve(result)});return result}
  once=true;second.resetData=function(...args){if(once){once=false;throw Error('隔离第二图失败')}return reset.apply(this,args)}
  error=undefined;try{await seek(half+200)}catch(e){error=e}finally{second.resetData=reset;ma.calc=calc}
  assert(error&&release,'必须实际到达挂起计算和第二图失败');await settle(half,true,true);release();await frame();await settle(half,true,true);result.push('late-calc-cannot-overwrite-rollback')
  const stale=bars.map(b=>({...b})),last=stale.at(-1);last.close-=1;last.low=Math.min(last.low,last.close)
  await primary().applySnapshot({symbol,period,bars:stale,basis});await exit();await settle(bars.length,false,true);result.push('resume-supersedes-old-snapshot')
  primary().startReplay(half);await wait(()=>first.getDataList().length===half,'单图未进入回放')
  failures.add('callback:primary');try{await primary().stopReplay()}finally{failures.clear()}
  assert(primary().getReplayEngine()===null,'单图应已释放回放');await settle(bars.length,false,true);result.push('committed-legacy-exit-isolates-callback')
  return result
 },
 async sample(){
  const samples={},half=Math.floor(bars.length/2),forward=Math.floor(bars.length*.75),backward=Math.floor(bars.length*.25)
  window.partialReplaySample=samples
  let tasks=[];const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({startTime:e.startTime,duration:e.duration}))))
  observer.observe({type:'longtask',buffered:false})
  const measure=async(name,action,position,replay,enabled)=>{
   const beforeReads={historyReads,replayReads},start=performance.now();await action();const {projection,completedAt:end}=await settle(position,replay,enabled)
   await new Promise(resolve=>setTimeout(resolve,0));tasks.push(...observer.takeRecords().map(e=>({startTime:e.startTime,duration:e.duration})))
   const longtasks=tasks.filter(t=>t.startTime<end&&t.startTime+t.duration>start)
   samples[name]={latency:end-start,start,end,longtasks,maximumLongTask:Math.max(0,...longtasks.map(t=>t.duration)),projection,reads:{history:historyReads-beforeReads.historyReads,replay:replayReads-beforeReads.replayReads}}
  }
  try{
   await measure('enter',()=>enter(half),half,true,true)
   await measure('step',async()=>{if(baseline)for(const {chart:pro}of cells())pro.getReplayEngine().stepForward();else await workspace.stepReplay('forward')},half+1,true,true)
   await measure('seek-forward',()=>seek(forward),forward,true,true)
   await measure('seek-backward',()=>seek(backward),backward,true,true)
   await measure('exit',exit,bars.length,false,true)
   let document=workspace.capture()
   if(!baseline){await enter(half);await settle(half,true,true);document=workspace.capture();await exit();await settle(bars.length,false,true)}
   await measure('restore',async()=>{await workspace.restore(document);await loaded();await installHostLayers({comparisons:baseline,rules:'restore'});if(baseline)await enter(half)},half,true,false)
   return samples
  }finally{observer.disconnect()}
 },
 async dispose(){workspace?.dispose();workspace=undefined;alertDocument=undefined;bars=[];analysis=[];events=[];await frame();return {subscriptions,dom:document.querySelector('#charts').childNodes.length}},
 get workspace(){return workspace},get bars(){return bars},get states(){return states},frame
}
window.ready=true
