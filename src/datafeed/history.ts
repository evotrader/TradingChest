import type {Datafeed,DatafeedRequestContext,HistoryQuery,HistoryResult,HistorySnapshot,Period,SymbolInfo} from '../types'

export class HistoryError extends Error {
  constructor(readonly code:string,message:string){super(message);this.name='HistoryError'}
}
const fail=(message:string):never=>{throw new HistoryError('INVALID_HISTORY',message)}
const time=(value:number)=>Number.isFinite(value)&&Math.abs(value)<=8.64e15
export function validateHistoryQuery(query:HistoryQuery):void {
  if(!query||query.kind!=='before'&&query.kind!=='range')fail('历史查询类型无效')
  if(query.kind==='before'){
    if(!time(query.before)||!Number.isSafeInteger(query.countBack)||query.countBack<=0)fail('历史上界或目标根数无效')
  }else if(!time(query.from)||!time(query.to)||query.from>=query.to)fail('历史区间无效')
}
export function validateHistorySnapshot(snapshot:HistorySnapshot):void {
  if(!snapshot||Array.isArray(snapshot)||!Array.isArray(snapshot.bars)||snapshot.basis!==undefined&&typeof snapshot.basis!=='string')fail('历史响应必须包含 bars')
  let previous=-Infinity
  for(const bar of snapshot.bars){
    if(!bar||!time(bar.timestamp)||!Number.isFinite(bar.open)||!Number.isFinite(bar.high)||!Number.isFinite(bar.low)||!Number.isFinite(bar.close)||bar.timestamp<=previous||
      bar.high<Math.max(bar.open,bar.close,bar.low)||bar.low>Math.min(bar.open,bar.close,bar.high)||
      bar.volume!==undefined&&(!Number.isFinite(bar.volume)||bar.volume<0))fail('行情包含重复时标或无效 OHLCV')
    previous=bar.timestamp
  }
  const meta=snapshot.metadata
  if(meta&&(!['ready','empty','partial'].includes(meta.state)||
    meta.sourceTimestamp!==undefined&&!time(meta.sourceTimestamp)||
    meta.delayMs!==undefined&&(!Number.isFinite(meta.delayMs)||meta.delayMs<0)||
    meta.state==='empty'&&snapshot.bars.length!==0||meta.state==='ready'&&snapshot.bars.length===0))fail('历史元数据无效')
}
export function validateHistoryResult(result:HistoryResult,query:HistoryQuery):HistoryResult {
  validateHistoryQuery(query);validateHistorySnapshot(result)
  if(result.hasMoreBefore!==undefined&&typeof result.hasMoreBefore!=='boolean')fail('历史边界必须为 boolean')
  if(query.kind==='before'){
    if(typeof result.hasMoreBefore!=='boolean')fail('before 响应缺少 hasMoreBefore')
    if(result.bars.some(bar=>bar.timestamp>=query.before))fail('历史响应越过 before 上界')
    if(!result.bars.length&&result.hasMoreBefore)throw new HistoryError('HISTORY_BOUNDARY_UNRESOLVED','空页尚未确认历史边界，请重试')
  }else if(result.bars.some(bar=>bar.timestamp<query.from||bar.timestamp>=query.to))fail('历史响应越过请求区间')
  return result
}
/** A provider may ignore its signal; chart ownership still settles immediately on cancellation. */
export function readHistory(feed:Datafeed,symbol:SymbolInfo,period:Period,query:HistoryQuery,context:DatafeedRequestContext):Promise<HistoryResult> {
  return new Promise((resolve,reject)=>{
    const signal=context.signal,cleanup=()=>signal.removeEventListener('abort',cancel)
    const cancel=()=>{cleanup();reject(signal.reason??new DOMException('History cancelled','AbortError'))}
    if(signal.aborted){cancel();return}
    signal.addEventListener('abort',cancel,{once:true})
    try{feed.getHistoryKLineData(symbol,period,query,context).then(result=>{cleanup();resolve(validateHistoryResult(result,query))},error=>{cleanup();reject(error)}).catch(reject)}
    catch(error){cleanup();reject(error)}
  })
}
/** Only a search-window estimate; it never declares a trading calendar or exhaustion. */
export function historyWindow(period:Period,count:number):number {
  const units:Record<string,number>={second:1000,minute:60000,hour:3600000,day:86400000,week:604800000,month:2678400000,year:31622400000}
  if(!units[period.timespan]||!Number.isSafeInteger(period.multiplier)||period.multiplier<=0)fail('图表周期无效')
  return Math.min(8.64e15,units[period.timespan]*period.multiplier*count)
}
