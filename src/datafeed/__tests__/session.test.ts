import { describe, expect, it, vi } from 'vitest'
import { createSessionDatafeed, seriesIdentityKey, type HistoryBatch, type SessionUpdate, type SeriesIdentity } from '../session'
const symbol={ticker:'TEST',market:'stocks',exchange:'X',priceCurrency:'USD'}
const period={multiplier:1,timespan:'minute',text:'1m'}
const identity:SeriesIdentity={source:'fixture',ticker:'TEST',market:'stocks',exchange:'X',currency:'USD',multiplier:1,timespan:'minute',adjustment:'raw',sessionFilter:'regular',timezone:'America/New_York'}
const bar=(timestamp:number,close=10)=>({timestamp,open:10,high:20,low:1,close,volume:2})
const query={kind:'before',before:10,countBack:10} as const
function fixture(batch: Partial<HistoryBatch> = {}) {
  const listeners:Array<(update:SessionUpdate)=>void>=[]
  const stop=vi.fn(),dispose=vi.fn(),history=vi.fn(async()=>({identity,bars:[bar(1),bar(2)],hasMoreBefore:false,metadata:{state:'ready' as const,sourceTimestamp:100},...batch}))
  const provider={searchSymbols:vi.fn(async()=>[symbol]),openSession:vi.fn(()=>({identity,getHistory:history,subscribe:(callback:(update:SessionUpdate)=>void)=>{listeners.push(callback);return stop},dispose}))}
  const status=vi.fn(),revision=vi.fn()
  const feed=createSessionDatafeed(provider,{onStatus:status,onRevisionRequired:revision})
  return {feed,provider,listeners,stop,dispose,history,status,revision}
}
describe('opt-in session-to-legacy adapter',()=>{
  it('preserves query calls and deduplicates only within the full identity',async()=>{
    const f=fixture({bars:[bar(3),bar(1),bar(3,15)]})
    expect((await f.feed.getHistoryKLineData(symbol,period,query)).bars.map(b=>[b.timestamp,b.close])).toEqual([[1,10],[3,15]])
    expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({state:'ready',sourceTimestamp:100}))
  })
  it('rejects mismatched adjustment/currency/period instead of mixing data',async()=>{
    for(const changed of [{adjustment:'split'},{currency:'CNY'},{multiplier:5}]){
      const f=fixture({identity:{...identity,...changed}})
      await expect(f.feed.getHistoryKLineData(symbol,period,query)).rejects.toThrow('identity mismatch')
    }
  })
  it('distinguishes explicit empty/partial states from failure',async()=>{
    const f=fixture({metadata:{state:'partial',delayMs:1000},bars:[],hasMoreBefore:false})
    await expect(f.feed.getHistoryKLineData(symbol,period,query)).resolves.toMatchObject({bars:[],hasMoreBefore:false})
    expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({state:'partial',delayMs:1000}))
    const bad=fixture({metadata:{state:'ready'},bars:[],hasMoreBefore:false})
    await expect(bad.feed.getHistoryKLineData(symbol,period,query)).rejects.toThrow('历史元数据无效')
  })
  it('forwards caller cancellation and rejects a late history result after close',async()=>{
    const f=fixture();const controller=new AbortController()
    const context={signal:controller.signal,reason:'initial' as const}
    await f.feed.getHistoryKLineData(symbol,period,query,context)
    expect(f.history).toHaveBeenCalledWith(query,context)
    let resolve!:(batch:HistoryBatch)=>void
    f.history.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
    const pending=f.feed.getHistoryKLineData(symbol,period,query)
    f.feed.unsubscribe(symbol,period)
    resolve({identity,bars:[bar(1)],hasMoreBefore:false,metadata:{state:'ready',sourceTimestamp:100}})
    await expect(pending).rejects.toMatchObject({name:'AbortError'})
  })
  it('routes historical revisions separately and never emits them as new prices',async()=>{
    const f=fixture();await f.feed.getHistoryKLineData(symbol,period,query)
    const price=vi.fn();f.feed.subscribe(symbol,period,price)
    f.listeners[0]({identity,bar:bar(1,15),kind:'update'})
    f.listeners[0]({identity,bar:bar(2,15),kind:'revision'})
    expect(price).not.toHaveBeenCalled();expect(f.revision).toHaveBeenCalledTimes(2)
    f.listeners[0]({identity,bar:bar(2,12),kind:'update'})
    f.listeners[0]({identity,bar:bar(3,12),kind:'update'})
    expect(price).toHaveBeenCalledTimes(2)
  })
  it('rejects wrong-series stream bars and malformed OHLC',async()=>{
    const f=fixture();const price=vi.fn();f.feed.subscribe(symbol,period,price)
    f.listeners[0]({identity:{...identity,currency:'CNY'},bar:bar(3),kind:'update'})
    f.listeners[0]({identity,bar:{...bar(3),close:100},kind:'update'})
    expect(price).not.toHaveBeenCalled();expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({state:'error'}))
  })
  it('isolates two chart adapters and suppresses late callbacks after unsubscribe',()=>{
    const f=fixture();const other=createSessionDatafeed(f.provider)
    const a=vi.fn(),b=vi.fn();f.feed.subscribe(symbol,period,a);other.subscribe(symbol,period,b)
    f.feed.unsubscribe(symbol,period)
    for(const listener of f.listeners)listener({identity,bar:bar(3),kind:'update'})
    expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledTimes(1)
    expect(f.stop).toHaveBeenCalledTimes(1);other.dispose?.()
  })
  it('invalidates the previous subscription generation even for the same session',()=>{
    const f=fixture();const a=vi.fn(),b=vi.fn();f.feed.subscribe(symbol,period,a);f.feed.subscribe(symbol,period,b)
    for(const listener of f.listeners)listener({identity,bar:bar(3),kind:'update'})
    expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledTimes(1)
  })
  it('cleans a synchronously disposed subscription once subscribe returns',()=>{
    const f=fixture()
    f.provider.openSession.mockImplementationOnce(()=>({identity,getHistory:f.history,subscribe:callback=>{callback({identity,bar:bar(3),kind:'update'});return f.stop},dispose:f.dispose}))
    f.feed.subscribe(symbol,period,()=>f.feed.dispose?.())
    expect(f.stop).toHaveBeenCalledTimes(1)
  })
  it('requires complete identity and rejects calls after disposal',async()=>{
    expect(()=>seriesIdentityKey({...identity,adjustment:''})).toThrow()
    const f=fixture();f.feed.dispose?.()
    await expect(f.feed.getHistoryKLineData(symbol,period,query)).rejects.toThrow('disposed')
  })
})

describe('session status installation ownership',()=>{
 it('does not publish stale history errors over a ready read after pausing',async()=>{
  const f=fixture();await f.feed.getHistoryKLineData(symbol,period,query)
  let release!:(batch:HistoryBatch)=>void
  f.history.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
  const stale=f.feed.getHistoryKLineData(symbol,period,query)
  f.feed.unsubscribe(symbol,period)
  f.history.mockResolvedValueOnce({identity,bars:[bar(1)],hasMoreBefore:false,metadata:{state:'ready',sourceTimestamp:3}})
  await f.feed.getHistoryKLineData(symbol,period,query)
  const status=f.status.mock.calls.at(-1)?.[0],count=f.status.mock.calls.length
  release({identity,bars:[bar(1)],hasMoreBefore:false})
  await expect(stale).rejects.toMatchObject({name:'AbortError'})
  expect(f.status).toHaveBeenCalledTimes(count);expect(status).toMatchObject({state:'ready',sourceTimestamp:3})
  f.feed.dispose?.()
 })
 it.each(['source','adjustment','sessionFilter','timezone'] as const)('retains the historical %s identity across a subscription pause',async field=>{
  let opened=0
  const callbacks:Array<(update:SessionUpdate)=>void>=[],stop=vi.fn(),dispose=vi.fn()
  const openSession=vi.fn(()=>{const owned={...identity,[field]:++opened===1?identity[field]:'another'};return {identity:owned,getHistory:async()=>({identity:owned,bars:[bar(1)],basis:owned.adjustment,hasMoreBefore:false}),subscribe:(callback:(update:SessionUpdate)=>void)=>{callbacks.push(callback);return stop},dispose}})
  const feed=createSessionDatafeed({searchSymbols:async()=>[],openSession}),price=vi.fn()
  await feed.getHistoryKLineData(symbol,period,query);feed.subscribe(symbol,period,price)
  await feed.getHistoryKLineData(symbol,period,query);feed.unsubscribe(symbol,period);feed.subscribe(symbol,period,price)
  expect(openSession).toHaveBeenCalledTimes(1);expect(dispose).not.toHaveBeenCalled()
  callbacks[0]({identity,bar:bar(2),kind:'update'});expect(price).not.toHaveBeenCalled()
  callbacks[1]({identity,bar:bar(2),kind:'update'});expect(price).toHaveBeenCalledOnce()
  feed.dispose?.();expect(stop).toHaveBeenCalledTimes(2);expect(dispose).toHaveBeenCalledOnce()
 })
 it('reopens a session after status installation throws',async()=>{
  let opened=0,disposed=0
  const feed=createSessionDatafeed({searchSymbols:async()=>[],openSession:()=>{const index=++opened;let closed=false;return {identity,getHistory:async()=>{if(closed)throw Error('disposed session');return {identity,bars:[bar(1)],hasMoreBefore:false}},subscribe:()=>()=>{},subscribeStatus:()=>{if(index===1)throw Error('isolated status failure');return()=>{}},dispose:()=>{closed=true;disposed++}}}})
  await expect(feed.getHistoryKLineData(symbol,period,{kind:'before',before:10,countBack:500})).rejects.toThrow('status failure')
  await expect(feed.getHistoryKLineData(symbol,period,{kind:'before',before:10,countBack:500})).resolves.toMatchObject({bars:[bar(1)]});expect(opened).toBe(2);expect(disposed).toBe(1);feed.dispose?.()
 })
})
