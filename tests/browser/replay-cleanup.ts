import React,{StrictMode,useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {TradingWorkspace,TradingChart} from '/src/react.ts'
import {createIndexedDBWorkspaceStore} from '/src/chart.ts'
import {replayParticipant} from '/src/workspace/replayParticipant.ts'

/** Extend each existing cleanup cycle with the actual React/IDB/workspace path. */
export async function replayCleanupCycle(index:number){
 const host=document.createElement('div');host.style.cssText='width:1100px;height:600px';document.body.append(host)
 const symbol={ticker:'CLEANUP.REPLAY',market:'synthetic',exchange:'X',priceCurrency:'USD'},period={multiplier:1,timespan:'minute',text:'1m'},basis='synthetic-cleanup'
 const bars=Array.from({length:200},(_,i)=>({timestamp:1700000000000+i*60000,open:100,high:102,low:99,close:101,volume:100}))
 const metrics={created:0,disposed:0,subscriptions:0},charts=new Set<any>(),databases=new Set<string>()
 let workspace:any,hold:'read'|'write'|undefined,held=false,pending:Promise<unknown>|undefined
 const wait=async(check:()=>boolean)=>{const end=performance.now()+15000;while(!check()){if(performance.now()>end)throw Error('新复盘清理流程没有到达目标状态');await new Promise(resolve=>setTimeout(resolve,1))}}
 const feed=()=>{metrics.created++;let subscribed=false,disposed=false;const unsubscribe=()=>{if(subscribed){subscribed=false;metrics.subscriptions--}};return {
  searchSymbols:async()=>[symbol],getHistoryKLineData:async(_s:any,_p:any,q:any)=>({bars:bars.filter(b=>q.kind==='before'?b.timestamp<q.before:b.timestamp>=q.from&&b.timestamp<q.to),basis,hasMoreBefore:q.kind==='before'?false:undefined}),
  getReplayHistory:async(_s:any,_p:any,q:any)=>{if(hold==='read'){held=true;await new Promise(()=>{})}const before=bars.filter(b=>b.timestamp<q.from).slice(-q.warmupBars),selected=[...before,...bars.filter(b=>b.timestamp>=q.from&&b.timestamp<q.to)];return {bars:selected,clocks:selected.map(b=>({timestamp:b.timestamp,completedAt:b.timestamp})),identity:{source:'synthetic',ticker:symbol.ticker,market:symbol.market,exchange:symbol.exchange,currency:symbol.priceCurrency,multiplier:1,timespan:'minute',adjustment:'none',sessionFilter:'all',timezone:'UTC'},basis,metadata:{state:'ready'},historyKind:'current-history',coverage:{from:q.from,to:q.to,warmupBars:before.length}}},
  subscribe:()=>{if(!subscribed){subscribed=true;metrics.subscriptions++}},unsubscribe,dispose:()=>{if(disposed)throw Error('重复释放复盘清理 feed');disposed=true;unsubscribe();metrics.disposed++}}}
 function Cell(props:any){const chart=useRef<any>(null);return React.createElement(TradingChart,{ref:chart,height:props.height,initialOptions:{symbol,period,mainIndicators:[],subIndicators:[]},createDatafeed:async(signal:AbortSignal)=>{signal.throwIfAborted();return feed()},events:{onDataReady:()=>{charts.add(chart.current);props.onReady({chart:chart.current})},onError:(error:any)=>props.onError(Error(error.message))}})}
 const root=createRoot(host)
 root.render(React.createElement(StrictMode,null,React.createElement(TradingWorkspace,{height:600,initialOptions:{context:'cleanup-replay',symbols:[symbol],initialSymbol:symbol,initialPeriod:period,getPeriods:async()=>[period],replay:{enabled:true}},renderCell:(props:any)=>React.createElement(Cell,props),onReady:(value:any)=>{workspace=value},
  createStore:async(signal:AbortSignal)=>{signal.throwIfAborted();const databaseName='tc-drawing-cleanup-replay-'+crypto.randomUUID(),store=createIndexedDBWorkspaceStore({databaseName});databases.add(databaseName);const write=store.write.bind(store);store.write=async(...args:Parameters<typeof write>)=>{const result=await write(...args);if(hold==='write'){held=true;await new Promise(()=>{})}return result};return store}})))
 try{
  await wait(()=>!!workspace?.getCells()[0]?.chart?.getAnalysisContext());await workspace.setLayout(2);await wait(()=>workspace.getCells().every((cell:any)=>cell.chart?.getAnalysisContext()))
  await workspace.startReplay({from:bars[5].timestamp,to:bars.at(-1)!.timestamp+1,cursor:bars[40].timestamp});await workspace.seekReplay(bars[120].timestamp);workspace.updateReplayNotes('清理验证笔记');await workspace.saveAs('清理复盘');const record=workspace.capture()
  switch(index%5){
   case 0:await workspace.stopReplay();hold='read';pending=workspace.resumeReplay().catch((error:any)=>error);await wait(()=>held);break
   case 1:hold='write';pending=workspace.save().catch((error:any)=>error);await wait(()=>held);break
   case 2:await workspace.stopReplay();hold='read';pending=workspace.restore(record).catch((error:any)=>error);await wait(()=>held);break
   case 3:workspace.setReplaySpeed(16);workspace.playReplay();await wait(()=>workspace.getReplayState().cursor>bars[120].timestamp);break
   case 4:await workspace.stopReplay();break
  }
 }finally{root.unmount();host.remove()}
 if(pending){let settled=false;void pending.finally(()=>{settled=true});await wait(()=>settled)}
 await wait(()=>metrics.created===metrics.disposed&&metrics.subscriptions===0)
 if([...charts].some(chart=>replayParticipant(chart)!==undefined))throw Error('销毁后保留 participant 注册')
 const chartCount=charts.size;charts.clear();workspace=undefined;pending=undefined
 for(const databaseName of databases)await new Promise<void>((resolve,reject)=>{const request=indexedDB.deleteDatabase(databaseName);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('复盘工作台存储未关闭'))})
 return {branch:index%5,charts:chartCount,...metrics}
}
