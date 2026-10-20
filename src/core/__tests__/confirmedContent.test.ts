import {describe,it,expect,vi} from 'vitest'
import type {Chart,KLineData} from 'klinecharts'
import {EngineDataLoader,type ConfirmedSeries} from '../engineDataLoader'
import type {Datafeed,DatafeedStatus} from '../../types'

function setup(){
  let bars:KLineData[]=[],symbol:any,period:any,status:((value:DatafeedStatus)=>void)|undefined
  const initial=[{timestamp:100,open:10,high:12,low:9,close:11,volume:100},{timestamp:200,open:11,high:13,low:10,close:12,volume:200}]
  const chart={setDataLoader:vi.fn(),getDataList:()=>bars,getSymbol:()=>symbol,getPeriod:()=>period,setSymbol:(s:any)=>{symbol=s},setPeriod:(p:any)=>{period=p},resetData:vi.fn()} as unknown as Chart
  const feed:Datafeed={searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:initial,hasMoreBefore:false}),subscribe:vi.fn(),unsubscribe:vi.fn(),subscribeStatus:(_s,_p,accept)=>{status=accept;return vi.fn()}}
  const states:ConfirmedSeries[]=[],during:readonly KLineData[][]=[]
  let loader:EngineDataLoader
  loader=new EngineDataLoader(chart,feed,{committed:state=>states.push(state),loading:vi.fn(),ready:vi.fn(),error:vi.fn(),price:vi.fn()})
  loader.activate({ticker:'A'},{multiplier:1,timespan:'minute',text:'1m'})
  const init=()=>loader.getBars({type:'init',symbol:{ticker:'A'},period:{type:'minute',span:1},timestamp:0,callback:next=>{during.push(loader.getConfirmedBars());bars=[...next]}} as any)
  const stream=()=>loader.subscribeBar({symbol:{ticker:'A'},period:{type:'minute',span:1},callback:bar=>{during.push(loader.getConfirmedBars().map(b=>({...b})));const i=bars.findIndex(b=>b.timestamp===bar.timestamp);if(i>=0)bars[i]={...bar};else bars.push({...bar})}} as any)
  return {loader,chart,init,stream,initial,states,during,status:(value:DatafeedStatus)=>status?.(value),get bars(){return bars}}
}
describe('loader confirmed content seam',()=>{
  it('publishes content after engine callbacks, tracks same-bar volume, and ignores status-only events',async()=>{
    const test=setup();await test.init();test.stream()
    expect(test.during[0]).toEqual([])
    const revision=test.states.at(-1)!.contentRevision
    test.status({type:'connection',state:'connected'});expect(test.states.at(-1)!.contentRevision).toBe(revision)
    test.loader.push({...test.initial[1],volume:400})
    expect(test.during.at(-1)![1].volume).toBe(200)
    expect(test.loader.getConfirmedBars()[1].volume).toBe(400)
    expect(test.states.at(-1)).toMatchObject({contentRevision:revision!+1,revision:1,contentChange:'tail'})
    test.loader.push({...test.initial[1],volume:400});expect(test.states.at(-1)!.contentRevision).toBe(revision!+1)
    test.loader.dispose();expect(test.loader.getConfirmedBars()).toEqual([])
  })
  it('publishes only the replay prefix and never exposes full live history before replay confirmation',async()=>{
    const test=setup();await test.init();test.stream()
    test.loader.setReplay(test.initial.slice(0,1))
    expect(test.states.at(-1)!.confirmed).toBe(false)
    await test.init()
    expect(test.loader.getConfirmedBars().map(b=>b.timestamp)).toEqual([100])
    expect(test.states.at(-1)).toMatchObject({replay:true,cutoff:100,confirmed:true})
    test.loader.dispose()
  })
  it('publishes an atomic confirmed replay transition when engine reset synchronously requests bars',async()=>{
    const test=setup();await test.init();test.stream()
    test.chart.resetData=()=>{void test.init()}
    const before=test.states.length
    test.loader.setReplay(test.initial.slice(0,1))
    expect(test.states.slice(before)).toHaveLength(1)
    expect(test.states.at(-1)).toMatchObject({replay:true,cutoff:100,confirmed:true})
    expect(test.loader.getConfirmedBars().map(b=>b.timestamp)).toEqual([100])
    test.loader.dispose()
  })
})
