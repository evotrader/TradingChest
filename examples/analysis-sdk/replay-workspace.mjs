import {KLineChartPro} from 'trading-chest'
import {ChartWorkspace,createIndexedDBWorkspaceStore} from 'trading-chest/chart'
import 'trading-chest/dist/trading-chest.css'
const symbols=['A','B','COMPARE'].map(ticker=>({ticker:`SYNTHETIC.${ticker}`,name:`隔离合成 ${ticker}`,market:'synthetic',exchange:'EXAMPLE',priceCurrency:'USD',pricePrecision:2,volumePrecision:0}))
const periods=[{multiplier:1,timespan:'minute',text:'1m'},{multiplier:5,timespan:'minute',text:'5m'}]
const basis='synthetic-unadjusted',metrics={subscriptions:0,created:0,disposed:0},status=document.querySelector('#message')
let fail=false,disposed=false
function barsFor(symbol,period){const days=symbol.ticker.endsWith('.B')?[12,14]:[12,13];return days.flatMap((day,d)=>Array.from({length:120/period.multiplier},(_,i)=>{const price=100+d+i/20+(symbol.ticker.endsWith('.COMPARE')?10:0);return {timestamp:Date.parse(`2026-10-${day}T08:00:00Z`)+i*period.multiplier*60000,open:price,high:price+1,low:price-1,close:price+.2,volume:100+i}}))}
function feed(){let subscribed=false,closed=false;metrics.created++
 const unsubscribe=()=>{if(subscribed){subscribed=false;metrics.subscriptions--}}
 return {searchSymbols:async()=>symbols,
  async getHistoryKLineData(symbol,period,query,context){context?.signal.throwIfAborted();const all=barsFor(symbol,period).filter(b=>query.kind==='before'?b.timestamp<query.before:b.timestamp>=query.from&&b.timestamp<query.to);return {bars:query.kind==='before'?all.slice(-query.countBack):all,basis,hasMoreBefore:query.kind==='before'?all.length>query.countBack:undefined}},
  async getReplayHistory(symbol,period,query,context){context.signal.throwIfAborted();if(fail){fail=false;throw Error('隔离示例：本次时钟读取失败，可以重试')}
   const all=barsFor(symbol,period).map(bar=>({bar,visibleAt:bar.timestamp+period.multiplier*60000})),before=all.filter(b=>b.visibleAt<query.from).slice(-query.warmupBars),selected=[...before,...all.filter(b=>b.visibleAt>=query.from&&b.visibleAt<query.to)]
   return {bars:selected.map(b=>b.bar),clocks:selected.map(b=>({timestamp:b.bar.timestamp,completedAt:b.visibleAt,availableAt:b.visibleAt})),basis,historyKind:'current-history',identity:{source:'synthetic',ticker:symbol.ticker,market:'synthetic',exchange:'EXAMPLE',currency:'USD',multiplier:period.multiplier,timespan:period.timespan,adjustment:'none',sessionFilter:'declared-example',timezone:'UTC'},metadata:{state:selected.length?'ready':'empty'},coverage:{from:query.from,to:query.to,warmupBars:before.length}}},
  subscribe(){if(!subscribed){subscribed=true;metrics.subscriptions++}},unsubscribe,dispose(){if(closed)return;closed=true;unsubscribe();metrics.disposed++}}
}
const store=createIndexedDBWorkspaceStore({databaseName:'tradingchest-isolated-replay-example'})
const workspace=new ChartWorkspace({container:document.querySelector('#workspace'),height:1000,context:'isolated:replay-example',symbols:symbols.slice(0,2),initialSymbol:symbols[0],initialPeriod:periods[0],getPeriods:async()=>periods,store,replay:{enabled:true},
 onReplayStateChange:state=>{document.querySelector('#state').textContent=JSON.stringify(state,null,2)},onError:error=>{status.textContent=error.message},
 mountCell(container,cell,signal){let ready,failed,token;const promise=new Promise((resolve,reject)=>{ready=resolve;failed=reject}),source=feed()
  const chart=new KLineChartPro({container,symbol:cell.symbol,period:cell.period,periods,theme:'dark',locale:'zh-CN',datafeed:source,comparisonSymbols:[symbols[2]],createComparisonDatafeed:()=>feed(),
   onDataReady:()=>{const context=chart.getAnalysisContext();if(context&&context.token!==token){token=context.token;const bars=barsFor(cell.symbol,cell.period);chart.addAnalysisLayer(context,{id:'example-events',type:'events',label:'合成延迟可用事件',data:bars.filter((_,i)=>i%12===4).map((bar,i)=>({id:`event-${i}`,timestamp:bar.timestamp+15000,availableAt:bar.timestamp+cell.period.multiplier*60000+15000,label:`合成事件 ${i}`}))})}ready(chart)},onError:error=>failed(Error(error.message))})
  const close=()=>{chart.dispose();source.dispose();signal.removeEventListener('abort',close);failed(new DOMException('示例已卸载','AbortError'))};signal.addEventListener('abort',close,{once:true});return {ready:promise,dispose:close}
 }})
const close=()=>{if(disposed)return;disposed=true;workspace.dispose();store.dispose();status.textContent='示例已销毁，所有订阅与存储连接已释放'}
window.replayWorkspaceDemo={workspace,store,metrics,barsFor,close,ready:false}
await workspace.setLayout(2)
await workspace.getCells()[0].chart.addComparison(symbols[2],feed())
window.replayWorkspaceDemo.ready=true;status.textContent='双图已就绪；开始前可设置第二图的标的与周期。'
document.querySelector('#fail').onclick=()=>{fail=true;status.textContent='下一次时钟读取会失败；已有工作台与记录保留'}
document.querySelector('#dispose').onclick=close
window.addEventListener('pagehide',close,{once:true})
