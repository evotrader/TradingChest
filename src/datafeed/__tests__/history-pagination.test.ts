import {afterEach,describe,expect,it,vi} from 'vitest'
import DefaultDatafeed from '../../DefaultDatafeed'
const symbol={ticker:'A',market:'stocks'},period={multiplier:7,timespan:'minute',text:'7m'},start=Date.parse('2026-10-01')
const agg=(offset:number)=>({t:start+offset,o:10,h:12,l:8,c:11,v:2})
afterEach(()=>vi.unstubAllGlobals())
describe('default aggregate history pagination',()=>{
 it('follows actual descending cursors and returns ascending bars for before queries',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({results:[agg(3)],queryCount:50000,next_url:'https://api.polygon.io/v2/aggs/ticker/A/range/7/minute/a/b?cursor=next'})}).mockResolvedValueOnce({ok:true,json:async()=>({results:[agg(2),agg(1)]})})
  vi.stubGlobal('fetch',fetch)
  const result=await new DefaultDatafeed('fixture').getHistoryKLineData(symbol,period,{kind:'before',before:start+4,countBack:3})
  expect(result.bars.map(b=>b.timestamp)).toEqual([start+1,start+2,start+3]);expect(result.hasMoreBefore).toBe(true);expect(fetch.mock.calls[0][0]).toContain('sort=desc&limit=50000');expect(fetch.mock.calls[1][0]).toContain('cursor=next&apiKey=fixture')
 })
 it('does not confuse a base aggregate limit with a complete range',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({results:[agg(1)],queryCount:50000})}))
  await expect(new DefaultDatafeed('fixture').getHistoryKLineData(symbol,period,{kind:'range',from:start,to:start+10})).rejects.toMatchObject({code:'HISTORY_BOUNDARY_UNRESOLVED'})
 })
 it('reads every cursor for a complete range and keeps exclusive upper bounds',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({results:[agg(1)],queryCount:50000,next_url:'https://api.polygon.io/next'})}).mockResolvedValueOnce({ok:true,json:async()=>({results:[agg(2),agg(10)]})})
  vi.stubGlobal('fetch',fetch)
  const result=await new DefaultDatafeed('fixture').getHistoryKLineData(symbol,period,{kind:'range',from:start,to:start+10})
  expect(result.bars.map(b=>b.timestamp)).toEqual([start+1,start+2]);expect(fetch).toHaveBeenCalledTimes(2)
 })
 it('distinguishes documented supported history exhaustion from unknown market boundaries',async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({results:[]})});vi.stubGlobal('fetch',fetch)
  expect(await new DefaultDatafeed('fixture').getHistoryKLineData(symbol,period,{kind:'before',before:Date.parse('2003-09-11'),countBack:500})).toMatchObject({bars:[],hasMoreBefore:false})
  fetch.mockClear();await expect(new DefaultDatafeed('fixture').getHistoryKLineData({...symbol,market:'crypto'},period,{kind:'before',before:Date.now(),countBack:500})).rejects.toMatchObject({code:'HISTORY_BOUNDARY_UNRESOLVED'});expect(fetch).toHaveBeenCalledTimes(24)
 })
})
