import type {Chart} from 'klinecharts'
import type {ConfirmedSeries} from '../core/engineDataLoader'
import type {AnalysisContext,AnalysisLayerSpec,AnalysisLayerHandle,AnalysisLayerState,AnalysisOptions,AnalysisEvent,AnalysisLabelPoint} from './types'
import {registerAnalysisRenderer,runtimeBindings,type AnalysisRendererData} from './renderers'
import i18n from '../i18n'
interface Layer {spec:AnalysisLayerSpec;state:AnalysisLayerState;renderer?:AnalysisRendererData;indicatorId?:string;paneId?:string;yAxisId?:string;events:AnalysisEvent[];points:AnalysisLabelPoint[]}
export interface AnalysisView {state:AnalysisLayerState;events:AnalysisEvent[];points:AnalysisLabelPoint[]}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
const validValue=(v:unknown)=>v===null||finite(v)
function validateData(spec:AnalysisLayerSpec,data:AnalysisLayerSpec['data'],locale:string):void {
  if(!Array.isArray(data))throw Error(i18n('analysis_validation_1',locale))
  let previous=-Infinity;const ids=new Set<string>()
  for(const point of data){
    if(!point||typeof point!=='object')throw Error(i18n('analysis_validation_2',locale))
    if(point.availableAt!==undefined&&!finite(point.availableAt))throw Error(i18n('analysis_validation_3',locale))
    if(spec.type==='events'||spec.type==='label-series'){
      const p=point as AnalysisEvent|AnalysisLabelPoint
      if(typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.label!=='string')throw Error(i18n('analysis_validation_4',locale));ids.add(p.id)
    }
    if(spec.type==='label-series'){if(!validValue((point as AnalysisLabelPoint).value))throw Error(i18n('analysis_validation_5',locale));continue}
    const time=(point as {timestamp:number}).timestamp;if(!finite(time))throw Error(i18n('analysis_validation_6',locale))
    if(spec.type==='events'){const end=(point as AnalysisEvent).endTimestamp;if(end!==undefined&&(!finite(end)||end<time))throw Error(i18n('analysis_validation_7',locale))}
    else {if(time<=previous)throw Error(i18n('analysis_validation_8',locale));previous=time
      if(spec.type==='band'){const p=point as import('./types').AnalysisBandPoint;if(!validValue(p.lower)||!validValue(p.upper)||(p.lower===null)!==(p.upper===null)||(p.lower!==null&&p.upper!==null&&p.lower>p.upper))throw Error(i18n('analysis_validation_9',locale))}
      else if(!validValue((point as import('./types').AnalysisPoint).value))throw Error(i18n('analysis_validation_10',locale))
    }
  }
}
export class AnalysisManager {
  private context:AnalysisContext|null=null
  private epoch=-1
  private sequence=0
  private layers=new Map<string,Layer>()
  private replay=false
  private cutoff=Infinity
  private disposed=false
  private times=new Set<number>()
  private signature=''
  constructor(private options:AnalysisOptions&{chart:()=>Chart|null;locale:()=>string;changed?:(views:AnalysisView[])=>void}){}
  getContext():AnalysisContext|null{return this.context?structuredClone(this.context):null}
  sync(state:ConfirmedSeries):void {
    if(this.disposed)return
    const bars=this.options.chart()?.getDataList()??[],confirmed=state.confirmed&&(bars.length>0||state.replay)
    const changed=!this.context||!confirmed||state.epoch!==this.epoch||this.context?.basis!==state.basis
    if(changed){this.clear();this.epoch=state.epoch;this.context=confirmed?{token:`analysis_${++this.sequence}_${Math.random().toString(36).slice(2)}`,symbol:{...state.symbol},period:{...state.period},basis:state.basis}:null}
    const signature=`${state.revision}:${bars.length}:${bars[0]?.timestamp}:${bars.at(-1)?.timestamp}`
    const cutoff=state.replay?(state.cutoff??-Infinity):Infinity,modeChanged=this.replay!==state.replay||this.cutoff!==cutoff
    if(!changed&&!modeChanged&&signature===this.signature)return
    this.replay=state.replay;this.cutoff=cutoff
    if(signature!==this.signature){this.signature=signature;this.times=new Set(bars.map(b=>b.timestamp));for(const layer of this.layers.values())this.render(layer)}
    else if(modeChanged)for(const layer of this.layers.values())this.render(layer)
    this.emit()
  }
  private assertContext(context:AnalysisContext):void {if(this.disposed||!this.context||context.token!==this.context.token)throw Error(i18n('analysis_validation_11',this.options.locale()))}
  add<S extends AnalysisLayerSpec>(context:AnalysisContext,input:S):AnalysisLayerHandle<S> {
    this.assertContext(context)
    if(!input||typeof input.id!=='string'||!input.id||typeof input.label!=='string'||!['line','histogram','band','events','label-series'].includes(input.type)||this.layers.has(input.id))throw Error(i18n('analysis_validation_12',this.options.locale()))
    if(input.visible!==undefined&&typeof input.visible!=='boolean')throw Error(i18n('analysis_validation_13',this.options.locale()))
    if(input.type!=='events'&&input.type!=='label-series'){
      if(!['main','sub'].includes(input.placement)||!['price','scalar','percent','amount'].includes(input.valueType))throw Error(i18n('analysis_validation_14',this.options.locale()))
      if(input.valueType==='price'&&input.dataBasis!==null&&(typeof input.dataBasis!=='string'||!input.dataBasis.trim()))throw Error(i18n('analysis_validation_15',this.options.locale()))
      if(input.placement==='main'&&(input.valueType!=='price'||!this.context!.basis?.trim()||input.dataBasis!==this.context!.basis))throw Error(i18n('analysis_validation_16',this.options.locale()))
    }
    validateData(input,input.data,this.options.locale())
    const spec=structuredClone(input),layer:Layer={spec,state:{id:spec.id,label:spec.label,type:spec.type,visible:spec.visible??true,status:'empty',unalignedCount:0},events:[],points:[]}
    this.layers.set(spec.id,layer)
    try{this.render(layer)}catch(e){this.remove(layer);throw e}this.emit()
    let released=false
    const active=()=>{this.assertContext(context);if(released||this.layers.get(spec.id)!==layer)throw Error(i18n('analysis_validation_17',this.options.locale()))}
    return {id:spec.id,replaceData:data=>{active();try{validateData(spec,data,this.options.locale());const next=structuredClone(data);layer.spec={...layer.spec,data:next} as AnalysisLayerSpec;this.render(layer);this.emit()}catch(e){layer.state={...layer.state,status:'error',reason:e instanceof Error?e.message:String(e)};this.emit();throw e}},setVisible:visible=>{active();if(typeof visible!=='boolean')throw Error(i18n('analysis_validation_13',this.options.locale()));layer.state.visible=visible;this.render(layer);this.emit()},dispose:()=>{if(released)return;released=true;if(this.layers.get(spec.id)===layer){this.remove(layer);this.emit()}}}
  }
  private render(layer:Layer):void {
    const spec=layer.spec,visible=layer.state.visible,hiddenLabels=spec.type==='label-series'&&this.replay&&spec.data.some(p=>p.availableAt===undefined)
    const available=(p:{availableAt?:number;timestamp?:number})=>!this.replay||((p.timestamp??-Infinity)<=this.cutoff&&(p.availableAt??p.timestamp??Infinity)<=this.cutoff)
    layer.events=[];layer.points=[]
    let eligible=0,unaligned=0
    const lookup=new Map<number,import('./renderers').AnalysisResult>(),events:AnalysisEvent[]=[]
    if(visible&&!hiddenLabels){
      if(spec.type==='label-series'){layer.points=spec.data.filter(available);eligible=layer.points.length}
      else if(spec.type==='events'){
        for(const raw of spec.data.filter(available)){
          const event=raw.endTimestamp!==undefined&&raw.endTimestamp>this.cutoff?{id:raw.id,timestamp:raw.timestamp,endTimestamp:this.cutoff,availableAt:raw.availableAt,label:i18n('analysis_ongoing',this.options.locale())}:raw
          eligible++;layer.events.push(event)
          if(!this.times.has(event.timestamp)||(event.endTimestamp!==undefined&&!this.times.has(event.endTimestamp))){unaligned++;continue}events.push(event)
        }
      }else {for(const point of spec.data.filter(available)){eligible++;if(!this.times.has(point.timestamp)){unaligned++;continue}
        if(spec.type==='band'){const p=point as import('./types').AnalysisBandPoint;lookup.set(p.timestamp,p.lower===null?{}:{lower:p.lower,upper:p.upper!})}
        else {const p=point as import('./types').AnalysisPoint;lookup.set(p.timestamp,p.value===null?{}:spec.type==='histogram'?{value:p.value,lower:0}:{value:p.value})}
      }}
    }
    layer.state={...layer.state,status:!visible||hiddenLabels?'hidden':!eligible?'empty':unaligned?'unaligned':'ready',unalignedCount:unaligned,reason:hiddenLabels?i18n('analysis_unknown_availability',this.options.locale()):unaligned?i18n('analysis_exact_only',this.options.locale()):undefined}
    if(spec.type==='label-series')return
    const chart=this.options.chart();if(!chart)throw Error(i18n('analysis_validation_18',this.options.locale()))
    registerAnalysisRenderer()
    const hits:Array<{x:number;y:number;event:AnalysisEvent}>=[]
    const priceLabel=spec.type!=='events'&&spec.valueType==='price'&&spec.placement==='sub'?`${spec.label} · ${spec.dataBasis===null?i18n('analysis_basis_unknown',this.options.locale()):`${i18n('analysis_basis',this.options.locale())}: ${spec.dataBasis}`}`:spec.label
    layer.state.label=priceLabel
    const renderer:AnalysisRendererData={type:spec.type,color:spec.color??'#38bdf8',unit:spec.unit??(spec.type!=='events'&&spec.valueType==='percent'?'%':''),label:priceLabel,valueAt:timestamp=>lookup.get(timestamp),events,getHits:()=>hits}
    layer.renderer=renderer
    if(layer.indicatorId&&chart.getIndicators({id:layer.indicatorId}).length)chart.overrideIndicator({id:layer.indicatorId,name:'TC_ANALYSIS',shortName:priceLabel,visible,extendData:renderer})
    else {
      const id=chart.createIndicator({name:'TC_ANALYSIS',shortName:priceLabel,paneId:spec.type==='events'||spec.placement==='main'?'candle_pane':undefined,extendData:renderer,visible,series:spec.type!=='events'&&spec.valueType==='price'?'price':'normal',shouldOhlc:false},true)
      const actual=id?chart.getIndicators({id})[0]:undefined;if(!actual)throw Error(i18n('analysis_validation_19',this.options.locale()))
      layer.indicatorId=actual.id;layer.paneId=actual.paneId;layer.yAxisId=actual.yAxisId
      const binding=runtimeBindings.get(chart)??{indicatorIds:new Set<string>(),paneIds:new Set<string>(),axisIds:new Set<string>()};binding.indicatorIds.add(actual.id)
      if(actual.paneId!=='candle_pane'){binding.paneIds.add(actual.paneId);binding.axisIds.add(actual.yAxisId);chart.setPaneOptions({id:actual.paneId,height:100,minHeight:60})}
      runtimeBindings.set(chart,binding)
    }
  }
  refreshPresentation():void {for(const layer of this.layers.values())this.render(layer);this.emit()}
  views():AnalysisView[]{return [...this.layers.values()].map(l=>({state:{...l.state},events:structuredClone(l.events),points:structuredClone(l.points)}))}
  setVisible(id:string,visible:boolean):void {const l=this.layers.get(id);if(l){l.state.visible=visible;this.render(l);this.emit()}}
  selectEvent(id:string,eventId:string):void {const e=this.layers.get(id)?.events.find(e=>e.id===eventId);if(e)this.options.onAnalysisEventClick?.({layerId:id,event:structuredClone(e),timestamp:e.timestamp})}
  selectPoint(id:string,pointId:string):void {const p=this.layers.get(id)?.points.find(p=>p.id===pointId);if(p)this.options.onAnalysisPointSelect?.({layerId:id,point:structuredClone(p)})}
  click(event:MouseEvent):void {
    const chart=this.options.chart(),target=event.target as HTMLElement;if(!chart||target.tagName!=='CANVAS')return
    for(const layer of this.layers.values()){
      const pane=chart.getDom(layer.paneId,'main');if(!pane?.contains(target))continue
      const rect=pane.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top
      const hit=layer.renderer?.getHits().find(h=>Math.hypot(h.x-x,h.y-y)<=8)
      if(hit){this.selectEvent(layer.spec.id,hit.event.id);return}
    }
  }
  private emit():void {if(this.disposed)return;const views=this.views();this.options.changed?.(views);views.forEach(v=>this.options.onAnalysisLayerChange?.({...v.state}))}
  private remove(layer:Layer):void {const chart=this.options.chart();if(chart&&layer.indicatorId){chart.removeIndicator({id:layer.indicatorId});const binding=runtimeBindings.get(chart);binding?.indicatorIds.delete(layer.indicatorId);if(layer.paneId!=='candle_pane'){binding?.paneIds.delete(layer.paneId!);binding?.axisIds.delete(layer.yAxisId!)}}this.layers.delete(layer.spec.id)}
  clear():void {for(const l of this.layers.values())this.remove(l);this.context=null;this.signature='';this.emit()}
  dispose():void {if(this.disposed)return;this.clear();this.disposed=true;const chart=this.options.chart();if(chart)runtimeBindings.delete(chart)}
}
