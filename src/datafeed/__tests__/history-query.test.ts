import {describe,expect,it,vi} from 'vitest'
import {readHistory,validateHistoryResult,validateHistorySnapshot} from '../history'
const bar=(timestamp:number)=>({timestamp,open:1,high:2,low:0,close:1,volume:1})
const before={kind:'before' as const,before:10,countBack:500}
describe('public historical query boundaries',()=>{
 it('retains the Date time range and rejects nonnumeric OHLC values',()=>{
  for(const timestamp of [-8.64e15,8.64e15,-0.5,0.5])expect(()=>validateHistorySnapshot({bars:[bar(timestamp)]})).not.toThrow()
  for(const timestamp of [-8.64e15-1,8.64e15+1,Infinity,NaN,'1'])expect(()=>validateHistorySnapshot({bars:[bar(timestamp as number)]})).toThrow()
  for(const key of ['open','high','low','close'])for(const value of [Infinity,NaN,'1',undefined])expect(()=>validateHistorySnapshot({bars:[{...bar(1),[key]:value}]})).toThrow()
 })
 it('rejects missing, nonprogressing and malformed boundaries while accepting honest short pages',()=>{
  expect(()=>validateHistoryResult({bars:[bar(1)]},before)).toThrow('hasMoreBefore')
  expect(()=>validateHistoryResult({bars:[],hasMoreBefore:true},before)).toThrow('空页')
  expect(validateHistoryResult({bars:[bar(1)],hasMoreBefore:true},before).bars).toHaveLength(1)
  expect(validateHistoryResult({bars:[],hasMoreBefore:false},before).hasMoreBefore).toBe(false)
  expect(()=>validateHistoryResult({bars:[bar(10)],hasMoreBefore:false},before)).toThrow('上界')
  expect(()=>validateHistoryResult({bars:[bar(1)],hasMoreBefore:false},{...before,countBack:0})).toThrow('目标根数')
 })
 it('requires exact half-open range, monotonic real bars and coherent optional metadata',()=>{
  const query={kind:'range' as const,from:1,to:10}
  expect(validateHistoryResult({bars:[bar(1),bar(9)]},query)).not.toHaveProperty('hasMoreBefore')
  for(const bars of [[bar(0)],[bar(10)],[bar(1),bar(1)],[bar(2),bar(1)]])expect(()=>validateHistoryResult({bars},query)).toThrow()
  for(const metadata of [{state:'empty' as const},{state:'ready' as const,delayMs:-1},{state:'ready' as const,sourceTimestamp:Infinity}])expect(()=>validateHistoryResult({bars:[bar(1)],metadata},query)).toThrow()
  expect(validateHistoryResult({bars:[bar(1)],basis:'a',metadata:{state:'partial',sourceTimestamp:123,delayMs:0}},query)).toMatchObject({basis:'a',metadata:{state:'partial'}})
 })
 it('settles chart cancellation without relying on a cooperative provider',async()=>{
  const controller=new AbortController(),getHistoryKLineData=vi.fn(()=>new Promise<never>(()=>{}))
  const task=readHistory({getHistoryKLineData} as never,{ticker:'X'},{timespan:'minute',multiplier:1,text:'1m'},before,{signal:controller.signal,reason:'initial'})
  await Promise.resolve();controller.abort();await expect(task).rejects.toMatchObject({name:'AbortError'});expect(getHistoryKLineData).toHaveBeenCalledOnce()
 })
})
