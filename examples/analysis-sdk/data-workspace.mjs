import {ChartWorkspace,KLineChartPro,createIndexedDBWorkspaceStore} from 'trading-chest/chart'
import 'trading-chest/dist/trading-chest.css'

// Synthetic inputs are restricted to this explicitly isolated example.
const symbols=[{ticker:'ISOLATED.HISTORY',name:'隔离合成历史',pricePrecision:2,volumePrecision:0}]
const period={multiplier:1,timespan:'minute',text:'1m'}
const sessions=['2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14']
const bars=sessions.flatMap((day,session)=>Array.from({length:240},(_,i)=>{
  const close=100+session+Math.sin(i/12)
  return {timestamp:Date.parse(`${day}T01:30:00Z`)+i*60000,open:close-.1,close,high:close+.4,low:close-.5,volume:100+i}
}))
const status=document.querySelector('#status'),stateElement=document.querySelector('#data-state'),logElement=document.querySelector('#history-log')
const states=new Map(),feeds=new Map(),log=[]
let workspace,active='primary',failNext=false
const show=message=>{status.textContent=message}
const errorText=error=>`${error.code??error.name??'ERROR'}: ${error.message??String(error)}`
function renderState(){
  const state=states.get(active)
  stateElement.textContent=state?JSON.stringify({cellId:active,...state,
    sourceTimestamp:state.lastRead?.metadata?.sourceTimestamp??'未知',
    delayMs:state.lastRead?.metadata?.delayMs??'未知'},null,2):'尚未确认'
}
function record(query,result,error){
  log.unshift({query,...(result?{count:result.bars.length,hasMoreBefore:result.hasMoreBefore,metadata:result.metadata}:{}),...(error?{error:errorText(error)}:{})})
  log.splice(20)
  logElement.textContent=JSON.stringify(log,null,2)
}
function createDatafeed(){
  return {
    searchSymbols:async()=>symbols,
    async getHistoryKLineData(_symbol,_period,query,context){
      context?.signal.throwIfAborted()
      // Keep the asynchronous path cancellable; no network freshness is fabricated.
      await new Promise((resolve,reject)=>{
        const cancelled=()=>{clearTimeout(timer);reject(context.signal.reason??new DOMException('读取已取消','AbortError'))}
        const timer=setTimeout(()=>{context?.signal.removeEventListener('abort',cancelled);resolve()},60)
        context?.signal.addEventListener('abort',cancelled,{once:true})
      })
      context?.signal.throwIfAborted()
      if(failNext){
        failNext=false
        const error=Object.assign(new Error('隔离示例注入的读取失败，请点击重试'),{code:'EXAMPLE_READ_FAILED'})
        record(query,undefined,error)
        throw error
      }
      const eligible=bars.filter(bar=>query.kind==='before'?bar.timestamp<query.before:bar.timestamp>=query.from&&bar.timestamp<query.to)
      const selected=query.kind==='before'?eligible.slice(-query.countBack):eligible
      const result={bars:selected.map(bar=>({...bar})),basis:'isolated-example-unadjusted',
        metadata:{state:selected.length?'ready':'empty'},
        ...(query.kind==='before'?{hasMoreBefore:eligible.length>selected.length}:{})}
      record(query,result)
      return result
    },
    subscribe(){},
    unsubscribe(){},
  }
}
const store=createIndexedDBWorkspaceStore({databaseName:'trading-chest-isolated-data-workspace-example'})
workspace=new ChartWorkspace({
  container:document.querySelector('#workspace'),height:950,locale:'zh-CN',theme:'dark',
  context:'isolated-data-workspace-example',symbols,initialSymbol:symbols[0],initialPeriod:period,
  store,getPeriods:async(_symbol,signal)=>{signal.throwIfAborted();return [period]},
  onActiveCell:cell=>{active=cell.cellId;renderState()},
  onError:error=>show(errorText(error)),
  mountCell(container,cell,signal){
    const datafeed=createDatafeed()
    feeds.set(cell.cellId,datafeed)
    let chart,resolveReady,rejectReady,disposed=false
    const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject})
    chart=new KLineChartPro({container,symbol:cell.symbol,period:cell.period,periods:[period],
      locale:'zh-CN',theme:'dark',datafeed,
      onDataReady:()=>resolveReady(chart),
      onDataState:state=>{
        states.set(cell.cellId,state)
        if(cell.cellId===active)renderState()
        if(state.dataStatus==='unconfirmed'&&state.error)rejectReady(Object.assign(new Error(state.error),{code:state.errorCode}))
      },
      onError:error=>show(`${error.type}: ${error.message}`),
    })
    const dispose=()=>{
      if(disposed)return
      disposed=true
      signal.removeEventListener('abort',dispose)
      if(feeds.get(cell.cellId)===datafeed)feeds.delete(cell.cellId)
      chart.dispose()
      rejectReady(new DOMException('示例窗格已释放','AbortError'))
    }
    signal.addEventListener('abort',dispose,{once:true})
    if(signal.aborted)dispose()
    return {ready,dispose}
  },
})
const current=()=>{
  const cell=workspace.getCells().find(cell=>cell.cellId===active)
  if(!cell?.chart)throw new Error('请等待活动图数据就绪')
  return cell
}
const action=(id,work)=>document.querySelector(`#${id}`).addEventListener('click',()=>Promise.resolve().then(work).catch(error=>show(errorText(error))))
action('read-before',async()=>{
  const cell=current(),query={kind:'before',before:bars[480].timestamp,countBack:12}
  const result=await feeds.get(cell.cellId).getHistoryKLineData(cell.symbol,cell.period,query,{signal:new AbortController().signal,reason:'load-more'})
  show(`before 返回 ${result.bars.length} 根，hasMoreBefore=${result.hasMoreBefore}；countBack 表示根数，跨过合成会话间隔`)
})
action('read-range',async()=>{
  const cell=current(),query={kind:'range',from:bars[240].timestamp,to:bars[480].timestamp}
  const result=await feeds.get(cell.cellId).getHistoryKLineData(cell.symbol,cell.period,query,{signal:new AbortController().signal,reason:'resume'})
  show(`range 返回完整区间 ${result.bars.length} 根，边界未知；本按钮只演示 provider 读取，不替换图表`)
})
action('reload',async()=>{await current().chart.reloadData({preserveViewport:true});show('活动图完整区间已重载；视窗保留')})
action('fail-next',()=>{failNext=true;show('下一次读取会明确失败；可点击重载，再点击重试。已有图形保留')})
action('retry',async()=>{await current().chart.retryData();show('重试已完成；无失败请求时为幂等操作')})
window.dataWorkspaceDemo={workspace,bars,states,log,store,get ready(){return workspace.getCells().some(cell=>cell.chart)}}
show('工作台已创建；等待各图确认行情。保存为手动操作，连接和来源新鲜度保持未知')
window.addEventListener('pagehide',()=>{workspace.dispose();store.dispose()},{once:true})
