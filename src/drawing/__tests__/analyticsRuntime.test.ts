import {describe,it,expect} from 'vitest'
import {DrawingAnalyticsRuntime} from '../analyticsRuntime'
import type {DrawingSnapshot} from '../types'
import type {ConfirmedSeries} from '../../core/engineDataLoader'
const context=(revision=1):ConfirmedSeries=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'},epoch:1,revision:1,confirmed:true,replay:false,contentRevision:revision})
const bars=[{timestamp:100,open:10,low:10,high:10,close:10,volume:100},{timestamp:200,open:20,low:20,high:20,close:20,volume:200}]
const drawing=(name='anchoredVwap',times=[100]):DrawingSnapshot=>({logicalId:'a',owner:'local',overlay:{id:'a',name,groupId:'drawing_tools',points:times.map(timestamp=>({timestamp,value:10})),lock:false,visible:true,styles:null,extendData:null},anchors:times.map(timestamp=>({kind:'market',timestamp,value:10}))})
describe('confirmed volume drawing runtime',()=>{
  it('does not consume an unconfirmed engine transition and replaces same-candle volume',()=>{
    const runtime=new DrawingAnalyticsRuntime(),data=structuredClone(bars)
    runtime.sync({...context(),confirmed:false},data);expect(runtime.read(drawing()).state.status).toBe('calculating')
    runtime.sync(context(),data);expect(runtime.read(drawing()).state.summary?.vwap).toBeCloseTo(50/3)
    data[1].volume=400;runtime.sync({...context(2),contentChange:'tail'},data)
    expect(runtime.read(drawing()).state.summary).toMatchObject({vwap:18,volume:500})
    const summaries=runtime.summaries([drawing()]);summaries.a.summary!.vwap=99
    expect(runtime.read(drawing()).state.summary?.vwap).toBe(18)
  })
  it('does not replace an unloaded anchor with the window first candle',()=>{
    const runtime=new DrawingAnalyticsRuntime();runtime.sync(context(),bars)
    expect(runtime.read(drawing('anchoredVwap',[1])).state).toMatchObject({status:'unavailable',requestedRange:{from:1},count:0})
    expect(runtime.read(drawing('anchoredVwap',[150])).state).toMatchObject({status:'ready',boundarySampled:true,actualRange:{from:200,to:200},count:1})
  })
  it('clips only a replay profile, preserves its original endpoint and clears on identity changes',()=>{
    const runtime=new DrawingAnalyticsRuntime(),object=drawing('fixedRangeVolumeProfile',[100,300])
    runtime.sync(context(),bars);expect(runtime.read(object).state.status).toBe('unavailable')
    runtime.sync({...context(),replay:true,cutoff:200},bars)
    expect(runtime.read(object).state).toMatchObject({status:'ready',replayPartial:true,requestedRange:{from:100,to:300},actualRange:{from:100,to:200}})
    runtime.sync({...context(),symbol:{ticker:'B'},epoch:2,confirmed:false},[])
    expect(runtime.read(object).state.summary).toBeUndefined()
    runtime.dispose();expect(runtime.size).toBe(0)
  })
  it('keeps stale confirmed values distinguishable from an empty or zero-volume result',()=>{
    const runtime=new DrawingAnalyticsRuntime();runtime.sync(context(),bars)
    runtime.setDataState({symbol:{ticker:'A'},period:context().period,restoring:false,replay:false,dataStatus:'ready',connection:'failed',revisionRequired:true,error:'HTTP 503'})
    expect(runtime.read(drawing()).state).toMatchObject({status:'stale',reason:expect.stringContaining('HTTP 503'),summary:{volume:300}})
    runtime.setDataState({symbol:{ticker:'A'},period:context().period,restoring:false,replay:false,dataStatus:'ready',connection:'connected',revisionRequired:false})
    expect(runtime.read(drawing()).state.status).toBe('ready')
  })
  it('finishes a replay interval once the confirmed cutoff passes a nonmatching endpoint',()=>{
    const runtime=new DrawingAnalyticsRuntime(),data=[...bars,{...bars[1],timestamp:300}]
    runtime.sync({...context(),replay:true,cutoff:300},data)
    expect(runtime.read(drawing('fixedRangeVolumeProfile',[100,250])).state).toMatchObject({status:'ready',replayPartial:false,boundarySampled:true,actualRange:{from:100,to:200}})
    const unconfirmed=new DrawingAnalyticsRuntime();expect(unconfirmed.read(drawing()).state.period).toBeUndefined()
  })
})
