import {describe,it,expect,vi} from 'vitest'
import type {Chart,KLineData} from 'klinecharts'
import type {ChartDataState,Datafeed,DatafeedStatus} from '../../types'
import {EngineDataLoader} from '../engineDataLoader'
import {DrawingAnalyticsRuntime} from '../../drawing/analyticsRuntime'
import type {DrawingSnapshot} from '../../drawing/types'
const bar=(price:number):KLineData=>({timestamp:100,open:price,high:price,low:price,close:price,volume:10})
const drawing:DrawingSnapshot={logicalId:'a',owner:'local',anchors:[{kind:'market',timestamp:100,value:10}],overlay:{id:'a',name:'anchoredVwap',groupId:'drawing_tools',points:[{timestamp:100,value:10}],visible:true,lock:false,styles:null,extendData:null}}
function setup(){
  let bars:KLineData[]=[],symbol:any,period:any,status:((s:DatafeedStatus)=>void)|undefined
  const getHistory=vi.fn<Datafeed['getHistoryKLineData']>(async()=>({bars:[bar(10)],hasMoreBefore:false}))
  const feed:Datafeed={searchSymbols:async()=>[],getHistoryKLineData:getHistory,subscribe:vi.fn(),unsubscribe:vi.fn(),subscribeStatus:(_s,_p,callback)=>{status=callback;return vi.fn()}}
  const chart={setDataLoader:vi.fn(),getDataList:()=>bars,getSymbol:()=>symbol,getPeriod:()=>period,setSymbol:(s:any)=>{symbol=s},setPeriod:(p:any)=>{period=p},getVisibleRange:()=>({from:0,to:bars.length}),getBarSpace:()=>({bar:8}),convertToPixel:()=>({x:10,y:10}),setBarSpace:vi.fn(),scrollToDataIndex:vi.fn(),scrollByDistance:vi.fn(),resetData:()=>{void init()}} as unknown as Chart
  const runtime=new DrawingAnalyticsRuntime(),states:Array<{state:ChartDataState;price?:number;analytics:string}>=[]
  let loader:EngineDataLoader
  loader=new EngineDataLoader(chart,feed,{committed:s=>runtime.sync(s,loader.getConfirmedBars()),state:s=>{runtime.setDataState(s);states.push({state:structuredClone(s),price:bars[0]?.close,analytics:runtime.read(drawing).state.status})},loading:vi.fn(),ready:vi.fn(),error:vi.fn(),price:vi.fn()})
  loader.activate({ticker:'AUDIT'},{multiplier:1,timespan:'minute',text:'1m'})
  const init=()=>loader.getBars({type:'init',symbol:{ticker:'AUDIT'},period:{type:'minute',span:1},timestamp:0,callback:next=>{bars=[...next];loader.subscribeBar({symbol:{ticker:'AUDIT'},period:{type:'minute',span:1},callback:vi.fn()} as any)}} as any)
  const error=()=>status?.({type:'error',code:'SOURCE_UNAVAILABLE',message:'initial stale'})
  return {loader,feed,getHistory,runtime,states,init,error,status:(s:DatafeedStatus)=>status?.(s),get bars(){return bars}}
}
describe('confirmed error recovery transactions',()=>{
  it('retains stale during a pending retry, coalesces visible retries and clears only after success',async()=>{
    const t=setup();await t.init();t.error()
    let reject!:(e:Error)=>void
    t.getHistory.mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r}))
    const task=t.loader.retryError(),again=t.loader.retryError()
    expect(again).toBe(task);expect(t.loader.retry()).toBe(task)
    expect(t.runtime.read(drawing).state.status).toBe('stale')
    expect(t.states.at(-1)?.state).toMatchObject({error:'initial stale',errorCode:'SOURCE_UNAVAILABLE',restoring:true})
    reject(Error('retry failed'));await expect(task).rejects.toThrow('retry failed')
    expect(t.runtime.read(drawing).state.status).toBe('stale')
    t.getHistory.mockResolvedValueOnce({bars:[bar(20)],hasMoreBefore:false})
    await t.loader.retryError()
    expect(t.runtime.read(drawing).state).toMatchObject({status:'ready',summary:{vwap:20}})
    expect(t.states.at(-1)?.state.error).toBeUndefined();t.loader.dispose()
  })
  it('never publishes rolled-back old values without an error when subscription preparation fails',async()=>{
    const t=setup();await t.init();t.error();const start=t.states.length
    t.getHistory.mockResolvedValueOnce({bars:[bar(20)],hasMoreBefore:false})
    vi.mocked(t.feed.subscribe).mockImplementationOnce(()=>{throw Error('subscription rejected')})
    await expect(t.loader.retryError()).rejects.toThrow('subscription rejected')
    const old=t.states.slice(start).filter(s=>s.price===10)
    expect(old.length).toBeGreaterThan(0);expect(old.every(s=>!!s.state.error&&s.analytics==='stale')).toBe(true)
    expect(t.bars[0].close).toBe(10);t.loader.dispose()
  })
  it('keeps a newly queued source error when committing the successful history response',async()=>{
    const t=setup();await t.init();t.error()
    vi.mocked(t.feed.subscribe).mockImplementationOnce(()=>t.status({type:'error',message:'new source error',code:'NEW_ERROR'}))
    t.getHistory.mockResolvedValueOnce({bars:[bar(20)],hasMoreBefore:false})
    await t.loader.retryError()
    expect(t.states.at(-1)?.state).toMatchObject({error:'new source error',errorCode:'NEW_ERROR'})
    expect(t.runtime.read(drawing).state).toMatchObject({status:'stale',summary:{vwap:20}});t.loader.dispose()
  })
  it('leaves public retry idempotent for status-only errors while visible recovery reads the range',async()=>{
    const t=setup();await t.init();t.error()
    await t.loader.retry();expect(t.getHistory).toHaveBeenCalledTimes(1)
    await t.loader.retryError();expect(t.getHistory).toHaveBeenCalledTimes(2)
    expect(t.getHistory.mock.calls[1][2]).toMatchObject({kind:'range',from:100});t.loader.dispose()
  })
  it('keeps the original before query when the visible error belongs to failed pagination',async()=>{
    const t=setup();await t.init();t.getHistory.mockRejectedValueOnce(Error('older page failed'))
    await t.loader.getBars({type:'forward',symbol:{ticker:'AUDIT'},period:{type:'minute',span:1},timestamp:100,callback:vi.fn()} as any)
    t.getHistory.mockResolvedValueOnce({bars:[],hasMoreBefore:false})
    await t.loader.retryError()
    expect(t.getHistory.mock.calls[2][2]).toEqual({kind:'before',before:100,countBack:500})
    expect(t.getHistory.mock.calls[2][3].reason).toBe('load-more');t.loader.dispose()
  })
})
