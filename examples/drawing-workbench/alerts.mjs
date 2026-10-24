import {KLineChartPro,captureLayout,restoreLayout,isChartLayoutV4} from 'trading-chest/chart'
import {validateDrawingAlertDocument,evaluateDrawingAlert} from 'trading-chest/alerts'
import 'trading-chest/dist/trading-chest.css'

const scope='drawing-workbench:alerts',symbol={ticker:'SYNTHETIC.ALERT',market:'isolated',exchange:'EXAMPLE',priceCurrency:'USD',pricePrecision:4},period={multiplier:1,timespan:'minute',text:'1m'},basis='isolated-raw'
let bars=Array.from({length:260},(_,i)=>({timestamp:1700000000000+i*60000,open:100,high:102,low:98,close:100,volume:100+i})),active,restoring,closed=false,stage,subscriptions=0
const feeds=new Set(),status=document.querySelector('#status'),host=document.querySelector('#charts')
const notice=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error)}
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
function makeFeed(){
 let listener,disposed=false
 const feed={searchSymbols:async()=>[symbol],getHistoryKLineData:async()=>({bars:bars.map(bar=>({...bar})),basis,hasMoreBefore:false}),subscribe:(_s,_p,callback)=>{if(listener)subscriptions--;listener=callback;subscriptions++},unsubscribe:()=>{if(listener)subscriptions--;listener=undefined},dispose:()=>{if(disposed)return;disposed=true;feed.unsubscribe();feeds.delete(feed)},push:bar=>listener?.({...bar})}
 feeds.add(feed);return feed
}
async function mount(hidden=false,signal){
 const container=document.createElement('div');container.className='alert-example-chart'
 if(hidden)container.style.cssText=`position:absolute;visibility:hidden;pointer-events:none;width:${host.clientWidth}px;height:850px`
 host.append(container);const feed=makeFeed();let resolve,reject
 const ready=new Promise((done,fail)=>{resolve=done;reject=fail})
 let pro
 try{pro=new KLineChartPro({container,symbol,period,datafeed:feed,drawingAlertScope:scope,mainIndicators:[],subIndicators:[],onDataReady:()=>resolve(),onError:error=>reject(Error(error.message)),onDrawingAlertTrigger:event=>notice(`页面内提醒：${event.ruleId} · ${new Date(event.barTimestamp).toISOString()} · ${event.triggerPrice}`)})}
 catch(error){container.remove();feed.dispose();throw error}
 const mounted={container,pro,feed,dispose:()=>{pro.dispose();container.remove()}}
 if(hidden)stage=mounted
 const abort=()=>reject(new DOMException('暂存图表恢复已取消','AbortError'))
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
 try{await ready}catch(error){mounted.dispose();throw error}finally{signal?.removeEventListener('abort',abort)}
 if(closed){mounted.dispose();throw new DOMException('页面已关闭','AbortError')}
 return mounted
}
let database
function connect(){
 if(database)return Promise.resolve(database)
 return new Promise((resolve,reject)=>{const request=indexedDB.open('trading-chest-alert-example',1);request.onupgradeneeded=()=>request.result.createObjectStore('bundles');request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('示例数据库被其它连接占用'));request.onsuccess=()=>{if(closed){request.result.close();reject(new DOMException('页面已关闭','AbortError'));return}database=request.result;database.onversionchange=()=>{database.close();database=undefined};resolve(database)}})
}
async function transact(mode,value,signal){
 const db=await connect();signal?.throwIfAborted()
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction('bundles',mode),store=transaction.objectStore('bundles'),request=mode==='readonly'?store.get(scope):store.put(value,scope)
  const abort=()=>transaction.abort();signal?.addEventListener('abort',abort,{once:true})
  transaction.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve(request.result)}
  transaction.onabort=transaction.onerror=()=>{signal?.removeEventListener('abort',abort);reject(transaction.error??new DOMException('示例存储操作已取消','AbortError'))}
 })
}
function preflight(bundle){
 if(!bundle||bundle.version!==1||!isChartLayoutV4(bundle.layout))throw Error('保存的布局或组合版本无效，当前图表与原件已保留')
 validateDrawingAlertDocument(bundle.alerts,scope)
 const context=bundle.layout.context
 if(context?.ticker!==symbol.ticker||context?.market!==symbol.market||context?.exchange!==symbol.exchange||context?.currency!==symbol.priceCurrency||context?.adjustment!==basis||context?.period?.multiplier!==period.multiplier||context?.period?.timespan!==period.timespan)throw Error('保存的布局行情身份或周期不匹配')
 const drawings=new Map(bundle.layout.drawings.map(drawing=>[drawing.logicalId,drawing]))
 for(const {rule} of bundle.alerts.rules){
  if(rule.identity.ticker!==symbol.ticker||rule.identity.market!==symbol.market||rule.identity.exchange!==symbol.exchange||rule.identity.priceCurrency!==symbol.priceCurrency||rule.identity.basis!==basis||rule.period.multiplier!==period.multiplier||rule.period.timespan!==period.timespan)continue
  const drawing=drawings.get(rule.drawingLogicalId)
  if(!drawing||drawing.owner!==rule.sourceOwner||drawing.backendId!==rule.backendId||drawing.overlay.name!==rule.toolId)throw Error('提醒来源与保存的布局不匹配；未采用新布局，原图与原件已保留')
 }
}
const busy=value=>{for(const id of ['save','restore','seed','lower','higher','append','import'])document.getElementById(id).disabled=value;document.querySelector('#cancel').disabled=!value}
async function restore(){
 if(restoring)throw Error('已有恢复任务正在运行')
 const controller=new AbortController();restoring=controller;busy(true)
 try{
  const bundle=await transact('readonly',undefined,controller.signal);if(!bundle)throw Error('尚无保存的布局及提醒')
  preflight(bundle);controller.signal.throwIfAborted()
  const next=await mount(true,controller.signal);controller.signal.throwIfAborted()
  await restoreLayout(next.pro,bundle.layout);controller.signal.throwIfAborted()
  next.pro.restoreDrawingAlerts(bundle.alerts);await frame();controller.signal.throwIfAborted()
  if(next.pro.getDrawingHistoryState().uncertainLogicalIds.length||Object.keys(next.pro.getDrawingHistoryState().projectionErrors??{}).length)throw Error('布局来源未完整恢复，保留原图')
  const previous=active;next.container.style.cssText='';active=next;stage=undefined;previous.dispose();notice('布局及提醒已整体恢复；提醒已暂停，请选择继续监控或重置并启用')
 }finally{stage?.dispose();stage=undefined;if(restoring===controller)restoring=undefined;busy(false)}
}
const run=fn=>async()=>{try{await fn()}catch(error){notice(error.message,true)}}
document.querySelector('#save').onclick=run(async()=>{
 const layout=captureLayout(active.pro,{context:{ticker:symbol.ticker,market:symbol.market,exchange:symbol.exchange,currency:symbol.priceCurrency,adjustment:basis,period:{multiplier:period.multiplier,timespan:period.timespan}}}),alerts=active.pro.captureDrawingAlerts(),bundle={version:1,layout,alerts}
 preflight(bundle);await transact('readwrite',bundle);notice('布局及提醒已在同一 IndexedDB 事务中保存')
})
document.querySelector('#restore').onclick=run(restore)
document.querySelector('#cancel').onclick=()=>restoring?.abort()
document.querySelector('#seed').onclick=run(async()=>{
 const id='example-horizontal',anchor={kind:'market',timestamp:bars.at(-20).timestamp,value:100},pro=active.pro
 if(!pro.getDrawings().some(drawing=>drawing.logicalId===id))pro.restoreDrawings('local',[...pro.getDrawings(),{logicalId:id,owner:'local',anchors:[anchor],presentation:{name:'示例水平线'},overlay:{id,name:'horizontalStraightLine',paneId:'candle_pane',groupId:'drawing_tools',points:[{timestamp:anchor.timestamp,value:anchor.value}],styles:null,extendData:null,visible:true,lock:false}}])
 const result=pro.executeDrawingAlertCommand({type:'create',drawingLogicalId:id,frequency:'once-per-bar'});if(result.status!=='completed')throw Error(result.message)
 await pro.executeDrawingCommand({type:'select',ids:[id]});notice('已添加本图规则；从提醒管理查看、暂停或重置')
})
function update(delta,append=false){const previous=bars.at(-1),close=previous.close+delta,bar={...previous,timestamp:previous.timestamp+(append?60000:0),open:close,high:close+2,low:close-2,close};if(append)bars.push(bar);else bars[bars.length-1]=bar;for(const feed of feeds)feed.push(bar)}
document.querySelector('#lower').onclick=()=>update(-20);document.querySelector('#higher').onclick=()=>update(20);document.querySelector('#append').onclick=()=>update(0,true)
document.querySelector('#export').onclick=run(async()=>{const value=active.pro.captureDrawingAlerts(),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='drawing-alerts.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0)})
document.querySelector('#import').onchange=run(async()=>{const file=document.querySelector('#import').files[0];if(!file)return;const documentValue=JSON.parse(await file.text());if(closed)return;active.pro.restoreDrawingAlerts(documentValue);notice('规则已导入为暂停状态；原布局未改变')})
window.addEventListener('pagehide',()=>{closed=true;restoring?.abort();stage?.dispose();active?.dispose();database?.close();database=undefined},{once:true})
window.alertExample={get pro(){return active?.pro},get subscriptions(){return subscriptions},get feeds(){return feeds.size},scope,evaluateDrawingAlert,restore,preflight,read:()=>transact('readonly'),write:value=>transact('readwrite',value)}
active=await mount();notice('已加载隔离合成行情；可手动画线，或添加示例水平线。仅本页运行，关闭后停止。')
