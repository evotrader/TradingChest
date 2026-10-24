import {describe,it,expect,vi} from 'vitest'
import type {Chart,KLineData} from 'klinecharts'
import type {Datafeed,DatafeedStatus} from '../../types'
import {EngineDataLoader,type ConfirmedSeries} from '../engineDataLoader'
import {DrawingAlertRuntime} from '../../alert/drawingRuntime'
import {DrawingHistory} from '../../drawing/history'
const symbol={ticker:'A',market:'test',exchange:'X',priceCurrency:'USD'},period={multiplier:1,timespan:'minute',text:'1m'}
const bar=(close:number,timestamp=2000):KLineData=>({timestamp,open:close,high:close+1,low:close-1,close,volume:10})
async function setup(){
 let data:KLineData[]=[],readBars=[bar(9,1000),bar(9)],currentSymbol:any,currentPeriod:any,acceptStatus:((status:DatafeedStatus)=>void)|undefined,basis='raw',paired:ConfirmedSeries|undefined
 let loader:EngineDataLoader
 const event=vi.fn(),commits:ConfirmedSeries[]=[]
 const history=new DrawingHistory({context:()=>({symbol,period}),apply:(_id,value)=>value})
 history.reconcile('local',[{logicalId:'line',owner:'local',anchors:[{kind:'market',timestamp:1000,value:10}],overlay:{id:'line',name:'horizontalStraightLine',groupId:'drawing_tools',visible:true,lock:false,points:[{timestamp:1000,value:10}],styles:null,extendData:null}}])
 const runtime=new DrawingAlertRuntime({source:id=>history.getDrawing(id),uncertain:()=>false,restoring:()=>false,trigger:event})
 const feed:Datafeed={searchSymbols:async()=>[],getHistoryKLineData:vi.fn(async()=>({bars:readBars.map(b=>({...b})),basis,hasMoreBefore:false})),subscribe:vi.fn(),unsubscribe:vi.fn(),subscribeStatus:(_s,_p,accept)=>{acceptStatus=accept;return()=>{acceptStatus=undefined}}}
 const chart={setDataLoader:vi.fn(),getDataList:()=>data,getSymbol:()=>currentSymbol,getPeriod:()=>currentPeriod,setSymbol:(s:any)=>{currentSymbol=s},setPeriod:(p:any)=>{currentPeriod=p},resetData:()=>{void init()},getVisibleRange:()=>({from:0,to:data.length}),getBarSpace:()=>({bar:8}),setBarSpace:vi.fn(),convertToPixel:()=>({x:10,y:10}),scrollToDataIndex:vi.fn(),scrollByDistance:vi.fn()} as unknown as Chart
 const subscribe=()=>loader.subscribeBar({symbol,period:{type:'minute',span:1},callback:(next:KLineData)=>{const index=data.findIndex(b=>b.timestamp===next.timestamp);if(index<0)data.push({...next});else data[index]={...next}}} as any)
 const init=()=>loader.getBars({type:'init',symbol,period:{type:'minute',span:1},timestamp:0,callback:(bars:KLineData[])=>{data=bars.map(b=>({...b}));subscribe()}} as any)
 loader=new EngineDataLoader(chart,feed,{committed:state=>{paired=state;commits.push(state)},state:state=>runtime.consume(paired!,state,loader.getConfirmedBars(),'linear'),loading:vi.fn(),ready:vi.fn(),error:vi.fn(),price:vi.fn()})
 loader.activate(symbol,period);await init();expect(runtime.execute({type:'create',id:'alert',drawingLogicalId:'line',frequency:'once-per-bar'}).status).toBe('completed')
 const snapshot=async(bars:KLineData[],nextBasis=basis)=>{readBars=bars;basis=nextBasis;await loader.applySnapshot({symbol,period,bars,basis:nextBasis})}
 return {loader,runtime,event,commits,feed,chart,subscribe,snapshot,status:(value:DatafeedStatus)=>acceptStatus?.(value),get data(){return data.map(b=>({...b}))},dispose:()=>{runtime.dispose();loader.dispose();history.dispose()}}
}
describe('drawing alerts consume the actual paired loader seam',()=>{
 it('handles stream and single-tail HTTP snapshots without duplicate status or volume events',async()=>{
  const s=await setup();try{
   s.loader.push(bar(9));s.loader.push(bar(11));expect(s.event).toHaveBeenCalledTimes(1)
   s.status({type:'connection',state:'connected'});s.loader.push({...bar(11),volume:99});expect(s.event).toHaveBeenCalledTimes(1)
   s.runtime.execute({type:'rearm',id:'alert'});await s.snapshot([bar(9,1000),bar(9)]);await s.snapshot([bar(9,1000),bar(11)])
   expect(s.event).toHaveBeenCalledTimes(2);expect(s.commits.at(-1)).toMatchObject({writer:'snapshot',contentChange:'tail'})
   s.runtime.execute({type:'rearm',id:'alert'});await s.snapshot([bar(9,1000),bar(9)]);await s.snapshot([bar(9,1000),bar(9),bar(11,3000)])
   expect(s.event).toHaveBeenCalledTimes(3);expect(s.event.mock.calls.at(-1)![0].barTimestamp).toBe(3000)
  }finally{s.dispose()}
 })
 it('publishes a complete multi-bar snapshot once and never catches up historical crossings',async()=>{
  const s=await setup();try{
   s.loader.push(bar(9));const before=s.commits.length
   await s.snapshot([bar(9,1000),bar(11),bar(9,3000),bar(11,4000)])
   expect(s.event).not.toHaveBeenCalled();expect(s.commits.slice(before)).toHaveLength(1);expect(s.commits.at(-1)).toMatchObject({writer:'snapshot',contentChange:'replace'})
   s.loader.push(bar(9,4000));expect(s.event).toHaveBeenCalledTimes(1)
  }finally{s.dispose()}
 })
 it('resets on a full historical revision and on basis replacement',async()=>{
  const s=await setup();try{
   s.loader.push(bar(9));await s.snapshot([bar(8,1000),bar(11)])
   expect(s.event).not.toHaveBeenCalled();expect(s.commits.at(-1)).toMatchObject({writer:'reload',contentChange:'replace'})
   s.loader.push(bar(9));expect(s.event).toHaveBeenCalledTimes(1)
   await s.snapshot([bar(8,1000),bar(11)],'adjusted');expect(s.event).toHaveBeenCalledTimes(1);expect(s.runtime.getState()[0].status).toBe('context-mismatch')
  }finally{s.dispose()}
 })
 it.each(['market','exchange','priceCurrency'] as const)('rejects same-ticker snapshots with a different or undeclared %s before engine writes',async key=>{
  const s=await setup();try{
   const original=s.data
   for(const value of ['different',undefined])await expect(s.loader.applySnapshot({symbol:{...symbol,[key]:value},period,bars:[bar(9,1000),bar(11)],basis:'raw'})).rejects.toThrow('不匹配')
   expect(s.data).toEqual(original);expect(s.event).not.toHaveBeenCalled()
  }finally{s.dispose()}
 })
 it('does not trigger before paired errors are applied, and seeds only a fresh observation after reconnect',async()=>{
  const s=await setup();try{
   s.loader.push(bar(9));s.status({type:'connection',state:'disconnected'});s.loader.push(bar(9));s.status({type:'connection',state:'connected'});s.loader.push(bar(11));expect(s.event).not.toHaveBeenCalled()
   s.loader.push(bar(9));expect(s.event).toHaveBeenCalledTimes(1)
   s.runtime.execute({type:'rearm',id:'alert'});s.loader.push(bar(9));s.status({type:'error',code:'SOURCE_UNAVAILABLE',message:'读取失败'});s.loader.push(bar(11));expect(s.event).toHaveBeenCalledTimes(1)
  }finally{s.dispose()}
 })
})
