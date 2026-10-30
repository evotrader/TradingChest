import {describe,expect,it,vi} from 'vitest'
import {prepareReplayHistory,readReplayHistory,replayPrefixLength,validateReplayQuery} from '../history'
import type {ReplayHistoryResult} from '../types'
import type {Datafeed} from '../../types'
import {createSessionDatafeed,type SeriesIdentity} from '../../datafeed/session'

const symbol={ticker:'A.X',market:'equity',exchange:'X',priceCurrency:'USD'},period={multiplier:1,timespan:'day',text:'1d'}
const identity:SeriesIdentity={source:'isolated',ticker:'A.X',market:'equity',exchange:'X',currency:'USD',multiplier:1,timespan:'day',adjustment:'raw',sessionFilter:'regular',timezone:'America/New_York'}
const bar=(timestamp:number)=>({timestamp,open:10,high:12,low:9,close:11,volume:100})
const query={from:20,to:80,warmupBars:1}
const response=():ReplayHistoryResult=>({bars:[bar(1),bar(20),bar(40)],clocks:[{timestamp:1,completedAt:10},{timestamp:20,completedAt:30,availableAt:35},{timestamp:40,completedAt:50,availableAt:50}],identity:{...identity},basis:'raw',historyKind:'current-history',metadata:{state:'ready'},coverage:{...query}})
const feed=(getReplayHistory?:Datafeed['getReplayHistory']):Datafeed=>({searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:[bar(1)],hasMoreBefore:false}),subscribe:()=>{},unsubscribe:()=>{},getReplayHistory})
const context=()=>({signal:new AbortController().signal,reason:'enter' as const})
describe('source-owned completed history',()=>{
 it('detaches provider caches and indexes completion/availability without moving labels',()=>{
  const source=response(),window=prepareReplayHistory(source,query,symbol,period,{identity,basis:'raw'})
  expect(window.visibleAt).toEqual([10,35,50]);expect(window.availabilityAssumed).toBe(true)
  expect(replayPrefixLength(window.visibleAt,34)).toBe(1);expect(replayPrefixLength(window.visibleAt,35)).toBe(2)
  source.bars[0].close=99;source.clocks[0].completedAt=999;source.identity.source='changed';source.coverage.to=1000;source.metadata.state='partial'
  expect(window.bars[0].close).toBe(11);expect(window.clocks[0].completedAt).toBe(10);expect(window.identity.source).toBe('isolated');expect(window.coverage.to).toBe(80);expect(window.metadata.state).toBe('ready')
 })
 it('retains same-instant batches and honest empty followers',()=>{
  const source=response();source.clocks[2].completedAt=30;source.clocks[2].availableAt=35;source.bars[2].timestamp=25;source.clocks[2].timestamp=25
  const window=prepareReplayHistory(source,query,symbol,period);expect(replayPrefixLength(window.visibleAt,35)).toBe(3)
  const empty=prepareReplayHistory({...source,bars:[],clocks:[],metadata:{state:'empty'},coverage:{...query,warmupBars:0}},query,symbol,period)
  expect(empty.bars).toEqual([]);expect(replayPrefixLength(empty.visibleAt,50)).toBe(0)
 })
 it.each([
  (s:ReplayHistoryResult)=>{s.clocks.pop()},
  (s:ReplayHistoryResult)=>{s.clocks[1].timestamp=21},
  (s:ReplayHistoryResult)=>{s.clocks[1].completedAt=19},
  (s:ReplayHistoryResult)=>{s.clocks[1].availableAt=29},
  (s:ReplayHistoryResult)=>{s.clocks[1].availableAt=60},
  (s:ReplayHistoryResult)=>{s.clocks[2].availableAt=80},
  (s:ReplayHistoryResult)=>{s.clocks[2].completedAt=NaN},
  (s:ReplayHistoryResult)=>{s.clocks[1].completedAt=30.5},
  (s:ReplayHistoryResult)=>{s.bars[1].timestamp=1;s.clocks[1].timestamp=1},
  (s:ReplayHistoryResult)=>{s.bars[1].high=1},
  (s:ReplayHistoryResult)=>{s.coverage.warmupBars=0},
  (s:ReplayHistoryResult)=>{s.historyKind='pit' as any},
 ])('rejects bad rows/clocks instead of dropping them (%#)',change=>{
  const source=response();change(source);expect(()=>prepareReplayHistory(source,query,symbol,period)).toThrow()
 })
 it.each(['source','ticker','market','exchange','currency','timespan','adjustment','sessionFilter','timezone'] as const)('rejects %s drift against the known live identity',field=>{
  const source=response();source.identity[field]='changed'
  expect(()=>prepareReplayHistory(source,query,symbol,period,{identity,basis:'raw'})).toThrow(expect.objectContaining({code:'IDENTITY_MISMATCH'}))
 })
 it('rejects basis drift and incomplete coverage',()=>{
  expect(()=>prepareReplayHistory(response(),query,symbol,period,{basis:'adjusted'})).toThrow(expect.objectContaining({code:'IDENTITY_MISMATCH'}))
  for(const patch of [{metadata:{state:'partial'}},{coverage:{from:21,to:80,warmupBars:1}},{coverage:{from:20,to:79,warmupBars:1}}])expect(()=>prepareReplayHistory({...response(),...patch} as ReplayHistoryResult,query,symbol,period)).toThrow(expect.objectContaining({code:'PARTIAL_HISTORY'}))
 })
 it.each([{from:80},{to:20},{from:NaN},{warmupBars:1001},{warmupBars:-1},{to:80.5}])('rejects invalid query %j',patch=>{
  expect(()=>validateReplayQuery({...query,...patch})).toThrow(expect.objectContaining({code:'INVALID_HISTORY'}))
 })
 it('settles cancellation without releasing the live stream or accepting a late source',async()=>{
  let resolve!:(value:ReplayHistoryResult)=>void
  const source=feed(()=>new Promise(done=>resolve=done)),unsubscribe=vi.spyOn(source,'unsubscribe'),controller=new AbortController()
  const pending=readReplayHistory(source,symbol,period,query,{signal:controller.signal,reason:'enter'})
  controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});resolve(response());await Promise.resolve();expect(unsubscribe).not.toHaveBeenCalled()
 })
 it('does not start an already cancelled or unsupported request',async()=>{
  await expect(readReplayHistory(feed(),symbol,period,query,context())).rejects.toMatchObject({code:'UNSUPPORTED'})
  const read=vi.fn(async()=>response()),controller=new AbortController();controller.abort()
  await expect(readReplayHistory(feed(read),symbol,period,query,{signal:controller.signal,reason:'enter'})).rejects.toMatchObject({name:'AbortError'});expect(read).not.toHaveBeenCalled()
 })
 it('freezes the request before the provider mutates its input',async()=>{
  const ownedQuery={...query},provider=feed(async(s,p,q)=>{s.ticker='B.X';p.multiplier=5;q.to=999;return response()})
  // A provider cannot redefine the identity it was asked to return.
  await expect(readReplayHistory(provider,symbol,period,ownedQuery,context())).resolves.toMatchObject({identity})
  expect(ownedQuery).toEqual(query);expect(symbol.ticker).toBe('A.X')
 })
})
describe('replay through the same optional DataSession',()=>{
 it('preserves identity, clocks, metadata, coverage and one active session',async()=>{
  const stop=vi.fn(),dispose=vi.fn(),read=vi.fn(async()=>response()),openSession=vi.fn(()=>({identity,getHistory:async()=>({identity,bars:[bar(1)],basis:'raw',hasMoreBefore:false}),getReplayHistory:read,subscribe:()=>stop,dispose}))
  const adapted=createSessionDatafeed({searchSymbols:async()=>[],openSession})
  const history=await adapted.getHistoryKLineData(symbol,period,{kind:'before',before:100,countBack:10});adapted.subscribe(symbol,period,()=>{})
  const input=context(),window=await readReplayHistory(adapted,symbol,period,query,input,{identity:history.identity,basis:history.basis})
  expect(openSession).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledWith(query,input);expect(window.coverage).toEqual(query);expect(window.clocks).toEqual(response().clocks);expect(stop).not.toHaveBeenCalled();expect(dispose).not.toHaveBeenCalled()
  adapted.unsubscribe(symbol,period);expect(stop).toHaveBeenCalledOnce();adapted.dispose?.();expect(dispose).toHaveBeenCalledOnce()
 })
 it('rejects an unsupported session or late identity replacement',async()=>{
  const legacy=createSessionDatafeed({searchSymbols:async()=>[],openSession:()=>({identity,getHistory:async()=>({identity,bars:[],hasMoreBefore:false}),subscribe:()=>()=>{}})})
  await expect(readReplayHistory(legacy,symbol,period,query,context())).rejects.toMatchObject({code:'UNSUPPORTED'});legacy.dispose?.()
  let resolve!:(value:ReplayHistoryResult)=>void
  const adapted=createSessionDatafeed({searchSymbols:async()=>[],openSession:()=>({identity,getHistory:async()=>({identity,bars:[],hasMoreBefore:false}),getReplayHistory:()=>new Promise(done=>resolve=done),subscribe:()=>()=>{}})})
  const pending=readReplayHistory(adapted,symbol,period,query,context());adapted.dispose?.();resolve(response())
  await expect(pending).rejects.toMatchObject({name:'AbortError'})
 })
})
