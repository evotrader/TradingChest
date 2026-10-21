import type {Chart,KLineData,Overlay} from 'klinecharts'
import type {ConfirmedSeries} from '../core/engineDataLoader'
import type {ChartDataState} from '../types'
import type {DrawingSnapshot} from './types'
import {VwapIndex,calculateVolumeProfile,isVolumeDrawing,lowerBound,type DrawingAnalyticsState,type VolumeProfile,type VwapPoint,type VwapPriceSource} from './analytics'
import {VwapBandIndex,vwapBandOptions,vwapBands} from './vwapBands'
import {drawingParameters} from './content'

export interface DrawingAnalyticsResult {state:DrawingAnalyticsState;from:number;to:number;profile?:VolumeProfile;point?:(index:number)=>VwapPoint;band?:(index:number)=>import('./analytics').VwapBandsSummary|undefined}
export const drawingAnalyticsRuntimes=new WeakMap<Chart,DrawingAnalyticsRuntime>()
export class DrawingAnalyticsRuntime {
  private context?:ConfirmedSeries
  private bars:readonly KLineData[]=[]
  private contextKey=''
  private revision=-1
  private error?:string
  private results=new Map<string,{key:string;result:DrawingAnalyticsResult}>()
  private bandIndexes=new Map<VwapPriceSource,VwapBandIndex>()
  private indexes=new Map<VwapPriceSource,VwapIndex>()
  sync(context:ConfirmedSeries,bars:readonly KLineData[]):boolean {
    const key=JSON.stringify([context.symbol.market,context.symbol.exchange,context.symbol.ticker,context.symbol.priceCurrency,context.period.multiplier,context.period.timespan,context.basis,context.epoch,context.replay])
    const changed=key!==this.contextKey||context.contentRevision!==this.revision||context.confirmed!==this.context?.confirmed||context.cutoff!==this.context?.cutoff
    const same=key===this.contextKey
    if(!same){this.results.clear();this.indexes.clear();this.bandIndexes.clear();this.error=undefined}
    if(!same||context.contentRevision!==this.revision){
      for(const index of this.indexes.values())index.update(bars,same&&context.contentChange==='tail')
      for(const index of this.bandIndexes.values())index.update(bars,same&&context.contentChange==='tail')
    }
    this.bars=bars;this.context={...context,symbol:{...context.symbol},period:{...context.period}}
    this.contextKey=key;this.revision=context.contentRevision??-1
    return changed
  }
  setDataState(state:ChartDataState):boolean {
    const error=state.error??(state.revisionRequired?'历史已修订，请重新加载行情':undefined),changed=error!==this.error
    this.error=error;return changed
  }
  get size():number{return this.results.size}
  summaries(drawings:DrawingSnapshot[]):Record<string,DrawingAnalyticsState> {
    const ids=new Set(drawings.filter(d=>isVolumeDrawing(d.overlay.name)).map(d=>d.logicalId))
    for(const id of this.results.keys())if(!ids.has(id))this.results.delete(id)
    return Object.fromEntries(drawings.filter(d=>ids.has(d.logicalId)).map(d=>[d.logicalId,structuredClone(this.read(d).state)]))
  }
  forOverlay(overlay:Overlay):DrawingAnalyticsResult {
    const anchors=overlay.points.map(point=>({kind:'market' as const,timestamp:point.timestamp??this.bars[Math.round(point.dataIndex??-1)]?.timestamp??NaN,value:point.value??0}))
    return this.read({logicalId:overlay.id,owner:'local',overlay:{id:overlay.id,name:overlay.name,points:overlay.points,visible:true,lock:false,groupId:overlay.groupId,styles:overlay.styles,extendData:overlay.extendData},anchors,parameters:drawingParameters(overlay.extendData)})
  }
  read(drawing:DrawingSnapshot):DrawingAnalyticsResult {
    const times=drawing.anchors?.map(a=>a.kind==='market'?a.timestamp:NaN)??drawing.overlay.points.map(p=>p.timestamp??NaN)
    const start=Math.min(...times),end=drawing.overlay.name==='anchoredVwap'?undefined:Math.max(...times)
    const parameters=drawing.parameters??{},context=this.context
    const mathParameters=drawing.overlay.name==='anchoredVwap'?{source:parameters.source,algorithm:parameters.algorithm,bandMode:parameters.bandMode,bandMultipliers:parameters.bandMultipliers,bandAlgorithm:parameters.bandAlgorithm}:{rows:parameters.rows,valueArea:parameters.valueArea,algorithm:parameters.algorithm}
    const key=JSON.stringify([this.contextKey,this.revision,context?.confirmed,context?.cutoff,drawing.overlay.name,start,end,mathParameters,this.error])
    const cached=this.results.get(drawing.logicalId);if(cached?.key===key)return cached.result
    const state:DrawingAnalyticsState={status:'calculating',method:drawing.overlay.name==='anchoredVwap'?'bar-price-volume-v1':'bar-range-uniform-v1',period:context?.period?{...context.period}:undefined,requestedRange:{from:Number.isFinite(start)?start:0,...(end!==undefined&&Number.isFinite(end)?{to:end}:{})},count:0,coverage:'loaded-bars'}
    let result:DrawingAnalyticsResult={state,from:0,to:-1}
    const unavailable=(reason:string)=>{state.status='unavailable';state.reason=reason}
    if(!context?.confirmed){state.reason='行情尚未确认，请等待加载完成'}
    else if(!Number.isFinite(start)||end!==undefined&&!Number.isFinite(end))unavailable('请在真实历史上选择时间起点或区间')
    else if(!this.bars.length)unavailable('没有已确认行情，请加载历史后重试')
    else if(start<this.bars[0].timestamp)unavailable('起点历史尚未加载，请定位起点并向前加载历史')
    else if(start>this.bars[this.bars.length-1].timestamp)unavailable(context.replay?'回放尚未到达起点':'起点超出已加载历史，请加载历史后重试')
    else if(end!==undefined&&end>this.bars[this.bars.length-1].timestamp&&!context.replay)unavailable('区间终点历史尚未加载，请加载历史后重试')
    else{
      const from=lowerBound(this.bars,start),to=end===undefined?this.bars.length-1:lowerBound(this.bars,end+1)-1
      result={state,from,to}
      if(from>to)unavailable('当前周期在此区间没有参与样本')
      else{
        state.actualRange={from:this.bars[from].timestamp,to:this.bars[to].timestamp};state.count=to-from+1
        state.boundarySampled=this.bars[from].timestamp!==start||end!==undefined&&this.bars[to].timestamp!==end
        state.replayPartial=context.replay&&end!==undefined&&end>(context.cutoff??this.bars[this.bars.length-1].timestamp)
        try{
          if(drawing.overlay.name==='anchoredVwap'){
            const source=(parameters.source??'hlc3') as VwapPriceSource
            if(!['close','hl2','hlc3','ohlc4'].includes(source)||parameters.algorithm!==undefined&&parameters.algorithm!=='bar-price-volume-v1')throw Error('锚定 VWAP 算法或价格源无效')
            let index=this.indexes.get(source)
            if(!index){index=new VwapIndex(source);index.update(this.bars);this.indexes.set(source,index)}
            const current=index.at(this.bars,from,to)
            result.point=i=>index!.at(this.bars,from,i)
            if(current.value===undefined)throw Error(current.volume===0?'累计成交量为零或无效，无法计算均价':'累计区间存在无效 OHLCV 或数值溢出，请修正数据后重试')
            state.summary={vwap:current.value,volume:current.volume,source}
            const options=vwapBandOptions(parameters)
            if(options.mode!=='none'){
              let moments=this.bandIndexes.get(source)
              if(options.mode==='standard-deviation'&&!moments){moments=new VwapBandIndex(source);moments.update(this.bars);this.bandIndexes.set(source,moments)}
              result.band=i=>vwapBands(index!.at(this.bars,from,i).value,options,()=>moments!.deviation(this.bars,from,i,index!.at(this.bars,from,i).value!))
              state.bands=result.band(to)
            }
          }else{
            if(parameters.algorithm!==undefined&&parameters.algorithm!=='bar-range-uniform-v1')throw Error('成交量分布算法无效')
            const profile=calculateVolumeProfile(this.bars,from,to,Number(parameters.rows??48),Number(parameters.valueArea??.7))
            result.profile=profile
            state.summary={volume:profile.volume,poc:profile.poc,vah:profile.vah,val:profile.val,valueArea:profile.valueArea,rows:profile.bins.length}
          }
          state.status='ready'
        }catch(error){unavailable(error instanceof Error?error.message:String(error))}
      }
    }
    if(drawing.overlay.name==='anchoredVwap'&&!state.bands&&parameters.bandMode!==undefined&&parameters.bandMode!=='none'){
      try{state.bands=vwapBands(undefined,vwapBandOptions(parameters));if(state.bands&&state.reason)state.bands.reason=state.reason}
      catch(error){unavailable(error instanceof Error?error.message:String(error))}
    }
    if(this.error&&context?.confirmed){state.status='stale';state.reason=`${this.error}；请重试原行情读取`}
    if(this.results.size>2048)this.results.clear()
    this.results.set(drawing.logicalId,{key,result});return result
  }
  timestamp(index:number):number|undefined{return this.bars[index]?.timestamp}
  dispose():void {this.results.clear();this.indexes.clear();this.bandIndexes.clear();this.bars=[];this.context=undefined;this.contextKey='';this.error=undefined}
}
