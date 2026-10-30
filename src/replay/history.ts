import type {Datafeed,Period,SymbolInfo} from '../types'
import {copyHistorySnapshot} from '../datafeed/history'
import {seriesIdentityKey,type SeriesIdentity} from '../datafeed/session'
import {WorkspaceReplayError,type ReplayHistoryQuery,type ReplayHistoryResult,type ReplayRequestContext} from './types'

/** Private owned arrays and one index per frozen source window, reused by every step. */
export interface ReplayWindow extends ReplayHistoryResult {visibleAt:readonly number[];availabilityAssumed:boolean}
export const replayTime=(value:unknown):value is number=>Number.isSafeInteger(value)&&Math.abs(value as number)<=8.64e15
export function validateReplayQuery(query:ReplayHistoryQuery):void {
  if(!query||!replayTime(query.from)||!replayTime(query.to)||query.from>=query.to||!Number.isSafeInteger(query.warmupBars)||query.warmupBars<0||query.warmupBars>1000)throw new WorkspaceReplayError('INVALID_HISTORY','复盘范围或预热根数无效')
}
export function assertReplayIdentity(identity:SeriesIdentity,symbol:SymbolInfo,period:Period,expected?:SeriesIdentity):void {
  let key:string
  try{key=seriesIdentityKey(identity)}catch(cause){throw new WorkspaceReplayError('IDENTITY_MISMATCH','复盘来源身份不完整',{cause})}
  if(identity.ticker!==symbol.ticker||identity.multiplier!==period.multiplier||identity.timespan!==period.timespan||
    symbol.market!==undefined&&identity.market!==symbol.market||symbol.exchange!==undefined&&identity.exchange!==symbol.exchange||symbol.priceCurrency!==undefined&&identity.currency!==symbol.priceCurrency||
    expected&&key!==seriesIdentityKey(expected))throw new WorkspaceReplayError('IDENTITY_MISMATCH','复盘来源、标的、周期或价格口径与当前图表不一致')
}
export function prepareReplayHistory(result:ReplayHistoryResult,query:ReplayHistoryQuery,symbol:SymbolInfo,period:Period,expected?:{identity?:SeriesIdentity;basis?:string}):ReplayWindow {
  validateReplayQuery(query)
  if(!result||result.historyKind!=='current-history'||!result.metadata)throw new WorkspaceReplayError('INVALID_HISTORY','复盘响应缺少历史类型或完整性信息')
  if(result.metadata.state==='partial')throw new WorkspaceReplayError('PARTIAL_HISTORY','复盘历史窗口尚未完整，请重试或调整范围')
  assertReplayIdentity(result.identity,symbol,period,expected?.identity)
  if(expected&&result.basis!==expected.basis)throw new WorkspaceReplayError('IDENTITY_MISMATCH','复盘历史与当前确认行情的价格口径不同')
  let owned:ReplayHistoryResult
  try{owned=copyHistorySnapshot(result)}catch(cause){throw new WorkspaceReplayError('INVALID_HISTORY',cause instanceof Error?cause.message:'复盘行情无效',{cause})}
  const coverage=result.coverage
  if(!coverage||!replayTime(coverage.from)||!replayTime(coverage.to)||coverage.from>query.from||coverage.to<query.to||!Number.isSafeInteger(coverage.warmupBars)||coverage.warmupBars<0||coverage.warmupBars>query.warmupBars)throw new WorkspaceReplayError('PARTIAL_HISTORY','来源没有完整覆盖所选复盘窗口')
  if(!Array.isArray(result.clocks)||result.clocks.length!==owned.bars.length)throw new WorkspaceReplayError('INVALID_HISTORY','每根复盘 K 线必须有一条匹配的完成时刻')
  const clocks=new Array(result.clocks.length),visibleAt=new Array<number>(result.clocks.length)
  let completed=-Infinity,visible=-Infinity,warmup=0,availabilityAssumed=false
  for(let i=0;i<result.clocks.length;i++){
    const clock=result.clocks[i],bar=owned.bars[i]
    if(!clock||!replayTime(clock.timestamp)||!replayTime(clock.completedAt)||clock.timestamp!==bar.timestamp||clock.timestamp>clock.completedAt||clock.completedAt<completed||
      clock.availableAt!==undefined&&(!replayTime(clock.availableAt)||clock.availableAt<clock.completedAt))throw new WorkspaceReplayError('INVALID_HISTORY','复盘完成时刻缺失、错配或顺序无效')
    const at=clock.availableAt??clock.completedAt
    if(at<visible||at>=query.to)throw new WorkspaceReplayError('INVALID_HISTORY','复盘可用时刻乱序或越过请求上界')
    if(at<query.from)warmup++
    if(clock.availableAt===undefined)availabilityAssumed=true
    completed=clock.completedAt;visible=at;visibleAt[i]=at;clocks[i]={timestamp:clock.timestamp,completedAt:clock.completedAt,...(clock.availableAt===undefined?{}:{availableAt:clock.availableAt})}
  }
  if(warmup!==coverage.warmupBars)throw new WorkspaceReplayError('INVALID_HISTORY','复盘预热根数与实际历史不匹配')
  return {...owned,identity:{...result.identity},clocks,coverage:{...coverage},visibleAt,availabilityAssumed}
}
/** Abort settles even if a provider ignores the signal; late values never get validated/applied. */
export function replayAbortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise((resolve,reject)=>{
    const cleanup=()=>signal.removeEventListener('abort',cancel),cancel=()=>{cleanup();reject(new DOMException('复盘请求已取消','AbortError'))}
    if(signal.aborted){work.catch(()=>{});cancel();return}
    signal.addEventListener('abort',cancel,{once:true})
    work.then(value=>{cleanup();if(signal.aborted)cancel();else resolve(value)},reason=>{cleanup();if(signal.aborted)cancel();else reject(reason)})
  })
}
export async function readReplayHistory(feed:Datafeed,symbol:SymbolInfo,period:Period,query:ReplayHistoryQuery,context:ReplayRequestContext,expected?:{identity?:SeriesIdentity;basis?:string}):Promise<ReplayWindow>{
  context.signal.throwIfAborted();validateReplayQuery(query)
  if(!feed.getReplayHistory)throw new WorkspaceReplayError('UNSUPPORTED','当前行情来源未提供逐 K 线复盘时钟')
  const request={...query},target={...symbol},interval={...period},known=expected&&{...expected,identity:expected.identity&&{...expected.identity}}
  const result=await replayAbortable(feed.getReplayHistory({...target},{...interval},{...request},context),context.signal)
  context.signal.throwIfAborted()
  return prepareReplayHistory(result,request,target,interval,known)
}
export function replayPrefixLength(times:readonly number[],cursor:number):number {
  let lo=0,hi=times.length
  while(lo<hi){const mid=(lo+hi)>>>1;if(times[mid]<=cursor)lo=mid+1;else hi=mid}
  return lo
}
