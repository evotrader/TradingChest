import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {createRequire} from 'node:module'
import {validateHistoryResult,HistoryError} from 'trading-chest/testing'
import {createAdapter} from './adapter.mjs'
const symbol={ticker:'ISOLATED'},period={multiplier:1,timespan:'minute',text:'1m'}
// Deliberately gapped, independent expected source; no market or production fallback.
const source=[1,2,8,9].map(i=>({timestamp:i*60000,open:i,high:i+1,low:i-1,close:i,volume:1}))
const result=(query)=>{const all=source.filter(b=>query.kind==='before'?b.timestamp<query.before:b.timestamp>=query.from&&b.timestamp<query.to);const bars=query.kind==='before'?all.slice(-Math.min(2,query.countBack)):all;return {bars,basis:'fixture-response-1',hasMoreBefore:query.kind==='before'?source.some(b=>b.timestamp<(bars[0]?.timestamp??query.before)):undefined}}
const make=(readHistory=async({query})=>result(query),subscribe=()=>()=>{})=>createAdapter({readHistory,subscribe,search:async()=>[symbol]})
const before={kind:'before',before:600000,countBack:5}

test('ESM and CJS expose the same production history contract without DOM',()=>{
  const common=createRequire(import.meta.url)('trading-chest/testing')
  assert.equal(typeof common.validateHistoryResult,'function');assert.equal(typeof common.HistoryError,'function');assert.equal(globalThis.window,undefined)
})
test('strict before, a short page with more history, range half-open and response basis',async()=>{
  const feed=make(),first=await feed.getHistoryKLineData(symbol,period,before)
  assert.deepEqual(first.bars.map(b=>b.timestamp),[480000,540000]);assert.equal(first.hasMoreBefore,true);assert.equal(first.basis,'fixture-response-1')
  const prior=await feed.getHistoryKLineData(symbol,period,{...before,before:first.bars[0].timestamp});assert.deepEqual(prior.bars.map(b=>b.timestamp),[60000,120000]);assert.equal(prior.hasMoreBefore,false)
  assert.deepEqual((await feed.getHistoryKLineData(symbol,period,{kind:'range',from:60000,to:480000})).bars.map(b=>b.timestamp),[60000,120000])
  feed.dispose()
})
test('empty is a valid exhausted result; failures and retry remain observable',async()=>{
  let attempts=0;const feed=make(async({query})=>{if(++attempts===1)throw Error('isolated IO error');return result(query)})
  await assert.rejects(feed.getHistoryKLineData(symbol,period,before),/isolated IO error/)
  assert.equal((await feed.getHistoryKLineData(symbol,period,{...before,before:0})).bars.length,0);feed.dispose()
})
test('invalid OHLCV, duplicate, out-of-order and bound violations fail',async()=>{
  for(const bars of [[{...source[0],high:0}],[{...source[0],volume:-1}],[source[0],source[0]],[source[1],source[0]],[{...source[0],timestamp:600000}]]){
    const feed=make(async()=>({bars,hasMoreBefore:false}));await assert.rejects(feed.getHistoryKLineData(symbol,period,before),HistoryError);feed.dispose()
  }
})
test('structural validation cannot prove a provider exhaustion assertion',()=>{
  const lie={...result(before),hasMoreBefore:false};validateHistoryResult(lie,before)
  // This negative assertion actually fails and is captured: the independent source owns truth.
  assert.throws(()=>assert.equal(lie.hasMoreBefore,source.some(b=>b.timestamp<lie.bars[0].timestamp)),assert.AssertionError)
})
test('same-bar updates, append and two-chart subscriptions are independent',()=>{
  const consumers=new Set(),subscribe=({accept})=>{consumers.add(accept);return()=>consumers.delete(accept)}
  const a=make(undefined,subscribe),b=make(undefined,subscribe),seenA=[],seenB=[]
  a.subscribe(symbol,period,bar=>seenA.push(bar));b.subscribe(symbol,period,bar=>seenB.push(bar))
  for(const accept of consumers)accept({...source.at(-1),close:9.5})
  a.unsubscribe(symbol,period)
  for(const accept of consumers)accept({...source.at(-1),timestamp:600000})
  assert.equal(seenA.length,1);assert.equal(seenB.length,2);assert.equal(seenB[0].timestamp,540000);assert.equal(seenB[1].timestamp,600000)
  a.dispose();b.dispose();assert.equal(consumers.size,0)
})
test('signal reaches real HTTP, and a late provider result is rejected after cancellation',async()=>{
  let receivedResolve;const received=new Promise(resolve=>receivedResolve=resolve)
  const server=createServer((req,res)=>{receivedResolve();req.on('close',()=>res.end());setTimeout(()=>res.end('{}'),200).unref()})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  try{
    const feed=make(async({signal})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}`,{signal});return response.json()}),controller=new AbortController()
    const reading=feed.getHistoryKLineData(symbol,period,before,{signal:controller.signal,reason:'initial'})
    await received;controller.abort();await assert.rejects(reading,{name:'AbortError'});feed.dispose()
    let resolve;const late=new Promise(yes=>resolve=yes),slow=make(()=>late),cancel=new AbortController()
    const pending=slow.getHistoryKLineData(symbol,period,before,{signal:cancel.signal,reason:'initial'});cancel.abort();resolve(result(before));await assert.rejects(pending,{name:'AbortError'});slow.dispose()
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
