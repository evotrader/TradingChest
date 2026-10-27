import {describe,it,expect,vi} from 'vitest'
vi.mock('klinecharts',()=>({registerIndicator:vi.fn()}))
import type {Chart,KLineData} from 'klinecharts'
import {AnalysisManager} from '../../analysis/manager'
import {EngineDataLoader} from '../engineDataLoader'
import type {Datafeed} from '../../types'

const symbol={ticker:'ALIGN.X'},period={multiplier:1,timespan:'minute',text:'1m'}
const bar=(timestamp:number):KLineData=>({timestamp,open:10,high:12,low:9,close:11})
async function setup(){
  let bars:KLineData[]=[],history=[bar(100),bar(200)],basis='raw',currentSymbol:any,currentPeriod:any,sequence=0
  const indicators=new Map<string,any>()
  let initialize:()=>Promise<void>,reenter:(()=>void)|undefined
  const chart={setDataLoader:vi.fn(),getDataList:()=>bars,getSymbol:()=>currentSymbol,getPeriod:()=>currentPeriod,setSymbol:(value:any)=>{currentSymbol=value},setPeriod:(value:any)=>{currentPeriod=value},resetData:()=>{void initialize()},
    getVisibleRange:()=>({from:0,to:bars.length}),getBarSpace:()=>({bar:8}),setBarSpace:vi.fn(),convertToPixel:()=>({x:0,y:0}),scrollToDataIndex:vi.fn(),scrollByDistance:vi.fn(),
    getIndicators:(filter?:{id?:string})=>[...indicators.values()].filter(value=>!filter?.id||value.id===filter.id),createIndicator:(input:any)=>{const id=`analysis-${++sequence}`;indicators.set(id,{...input,id,paneId:input.paneId??'sub',yAxisId:'axis'});return id},overrideIndicator:(input:any)=>{indicators.set(input.id,{...indicators.get(input.id),...input})},removeIndicator:({id}:{id:string})=>{indicators.delete(id)},getPaneOptions:()=>({height:100}),setPaneOptions:vi.fn()} as unknown as Chart
  const feed:Datafeed={searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:history.map(value=>({...value})),basis,hasMoreBefore:false}),subscribe:vi.fn(),unsubscribe:vi.fn()}
  let loader:EngineDataLoader
  const manager=new AnalysisManager({chart:()=>chart,confirmedBars:()=>loader.getConfirmedBars(),locale:()=> 'zh-CN'})
  const subscribe=()=>loader.subscribeBar({symbol,period:{type:'minute',span:1},callback:(value:KLineData)=>{const index=bars.findIndex(item=>item.timestamp===value.timestamp);if(index<0)bars.push({...value});else bars[index]={...value};reenter?.()}} as any)
  initialize=()=>loader.getBars({type:'init',symbol,period:{type:'minute',span:1},timestamp:0,callback:(values:KLineData[])=>{bars=values.map(value=>({...value}));subscribe()}} as any)
  loader=new EngineDataLoader(chart,feed,{committed:state=>manager.sync(state),loading:vi.fn(),ready:vi.fn(),error:vi.fn(),price:vi.fn()})
  loader.activate(symbol,period);await initialize()
  return {manager,loader,indicators,chart,setReentry:(callback:()=>void)=>{reenter=callback},snapshot:async(values:KLineData[],nextBasis=basis)=>{history=values;basis=nextBasis;await loader.applySnapshot({symbol,period,bars:values,basis})},dispose:()=>{manager.dispose();loader.dispose()}}
}
describe('analysis indexes follow the actual confirmed loader',()=>{
  it.each([false,true])('uses confirmed time keys when adding a layer inside the engine callback, aborted=%s',async aborted=>{
    const s=await setup();try{
      let during:number|undefined
      s.setReentry(()=>{
        s.manager.add(s.manager.getContext()!,{id:'reentrant',label:'reentrant',type:'events',data:[{id:'new',label:'new',timestamp:300}]})
        during=s.manager.views()[0].state.unalignedCount
        if(aborted)throw Error('Engine callback interrupted')
      })
      if(aborted)expect(()=>s.loader.push(bar(300))).toThrow('interrupted')
      else s.loader.push(bar(300))
      expect(during).toBe(1)
      expect(s.manager.views()[0].state.unalignedCount).toBe(aborted?1:0)
      expect(s.loader.getConfirmedBars().map(value=>value.timestamp)).toEqual(aborted?[100,200]:[100,200,300])
    }finally{s.dispose()}
  })
  it('aligns a late-added layer after append, content replacement and prepended historical revision',async()=>{
    const s=await setup();try{
      const context=s.manager.getContext()!
      s.loader.push(bar(300));s.loader.push({...bar(300),close:12})
      const layer=s.manager.add(context,{id:'late',label:'late',type:'line',placement:'sub',valueType:'scalar',data:[{timestamp:100,value:1},{timestamp:300,value:3}]})
      const renderer=()=>[...s.indicators.values()][0].extendData
      expect(renderer().indexAt(300)).toBe(2);expect(renderer().calculate(s.chart.getDataList())).toEqual([{value:1},{},{value:3}])
      await s.snapshot([bar(50),bar(100),bar(200),bar(300)])
      expect(s.manager.getContext()?.token).toBe(context.token)
      expect(renderer().indexAt(100)).toBe(1);expect(renderer().calculate(s.chart.getDataList())).toEqual([{}, {value:1}, {}, {value:3}])
      layer.dispose();s.loader.push(bar(400))
      s.manager.add(context,{id:'later',label:'later',type:'events',data:[{id:'tail',label:'tail',timestamp:400}]})
      expect(s.manager.views()[0].state.unalignedCount).toBe(0)
    }finally{s.dispose()}
  })
  it('clears the old basis and realigns after replay seek without retaining future keys',async()=>{
    const s=await setup();try{
      const old=s.manager.getContext()!
      s.manager.add(old,{id:'old',label:'old',type:'events',data:[{id:'first',label:'first',timestamp:100}]})
      await s.snapshot([bar(100),bar(200)],'adjusted')
      expect(s.manager.views()).toEqual([]);expect(s.manager.getContext()?.token).not.toBe(old.token)
      s.loader.setReplay([bar(100)])
      const context=s.manager.getContext()!
      s.manager.add(context,{id:'replay',label:'replay',type:'events',data:[{id:'past',label:'past',timestamp:100},{id:'future',label:'future',timestamp:200}]})
      expect(s.manager.views()[0].events.map(value=>value.id)).toEqual(['past'])
      s.loader.pushReplay(bar(200))
      expect(s.manager.views()[0].events.map(value=>value.id)).toEqual(['past','future'])
      s.loader.setReplay([bar(100)])
      expect(s.manager.views()[0].events.map(value=>value.id)).toEqual(['past'])
    }finally{s.dispose()}
  })
})
