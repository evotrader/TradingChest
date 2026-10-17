import {configureIndicatorTooltip} from '../indicator/instances'
import {runtimeBindings} from '../analysis/bindings'
import {resolveDrawingPane} from '../drawing/pane'
import {getIdentityEpoch} from '../core/identityEpoch'
import type {Chart,DeepPartial,Styles,YAxisOverride} from 'klinecharts'
import type { ChartPro } from '../types'
import {isChartLayoutV2, migrateLayoutV1, jsonSafe, type ChartLayoutV2, type LayoutIndicator, type LayoutJson} from './v2'

export interface LayoutIndicatorV3 extends LayoutIndicator { id?: string; yAxisId?: string }
export interface ChartLayoutV3 extends Omit<ChartLayoutV2, 'version'|'indicators'|'overlayData'> {
  version: 3
  indicators: LayoutIndicatorV3[]
  overlayData: Array<{id?:string;paneId?:string;name:string;groupId:string;points:Array<{timestamp?:number;dataIndex?:number;value?:number}>;lock:boolean;visible:boolean;styles?:{[key:string]:LayoutJson};extendData?:LayoutJson}>
  axes: Array<{id?:string;default?:boolean;paneId:string;name:string;reverse:boolean;inside:boolean;position:'left'|'right';scrollZoomEnabled:boolean;gap:{top?:number;bottom?:number}}>
  viewport?: {fromTimestamp:number;toTimestamp:number;barSpace:number}
  annotationRefs?: string[]
}
export type LayoutResult<T> = {status:'ok';value:T} | {status:'missing'} | {status:'error';code:'corrupt'|'migration'|'write'|'read';message:string}
const PREFIX='trading-chest-layout-v3-'
const clean = <T>(value:T):T => JSON.parse(JSON.stringify(value))
export function isChartLayoutV3(value: unknown): value is ChartLayoutV3 {
  if(!value || typeof value!=='object') return false
  const v=value as ChartLayoutV3
  if(!jsonSafe(v) || !Array.isArray(v.overlayData) || v.version!==3 || !Array.isArray(v.axes) || !Array.isArray(v.indicators) || !Array.isArray(v.panes) || v.panes.some(p=>!p||typeof p.id!=='string')) return false
  if(v.axes.some(a=>!a || (a.id!==undefined&&typeof a.id!=='string') || typeof a.paneId!=='string' || !['normal','percentage','logarithm'].includes(a.name) || !['left','right'].includes(a.position) || ['reverse','inside','scrollZoomEnabled'].some(k=>typeof (a as any)[k]!=='boolean') || !a.gap || Object.values(a.gap).some(x=>typeof x!=='number'||!Number.isFinite(x)))) return false
  if(new Set(v.axes.filter(a=>a.id!==undefined).map(a=>a.id)).size!==v.axes.filter(a=>a.id!==undefined).length) return false
  if(v.indicators.some(i=>!i || (i.id!==undefined && typeof i.id!=='string') || (i.yAxisId!==undefined && (!v.axes.some(a=>a.id===i.yAxisId&&a.paneId===i.paneId))))) return false
  const indicatorIds=v.indicators.flatMap(i=>i.id?[i.id]:[])
  if(new Set(indicatorIds).size!==indicatorIds.length)return false
  if(v.annotationRefs && (!Array.isArray(v.annotationRefs)||v.annotationRefs.some(x=>typeof x!=='string'))) return false
  if(v.viewport && (!Object.values(v.viewport).every(x=>typeof x==='number'&&Number.isFinite(x))||v.viewport.fromTimestamp>v.viewport.toTimestamp||v.viewport.barSpace<=0)) return false
  const allowed=['id','paneId','name','groupId','points','lock','visible','styles','extendData']
  if(v.overlayData.some(o=>!o || Object.keys(o).some(k=>!allowed.includes(k)) || typeof o.name!=='string' || typeof o.groupId!=='string' || typeof o.lock!=='boolean' || typeof o.visible!=='boolean' || (o.id!==undefined&&typeof o.id!=='string') || (o.paneId!==undefined&&!v.panes.some(p=>p.id===o.paneId)) || (o.styles!==undefined&&(!o.styles||Array.isArray(o.styles)||typeof o.styles!=='object')) || !Array.isArray(o.points) || o.points.some(p=>!p||Object.keys(p).some(k=>!['timestamp','dataIndex','value'].includes(k))||Object.keys(p).length===0||Object.values(p).some(n=>typeof n!=='number'||!Number.isFinite(n)))))return false
  const overlayIds=v.overlayData.flatMap(o=>o.id?[o.id]:[])
  if(new Set(overlayIds).size!==overlayIds.length)return false
  const {axes,viewport,annotationRefs,...base}=v
  return isChartLayoutV2({...base,version:2,overlayData:[],indicators:v.indicators.map(({id,yAxisId,...i})=>i)})
}
/** Only known v9 semantic fields are converted; unsupported fields return an actionable error. */
export function migrateLayoutToV3(value: unknown): LayoutResult<ChartLayoutV3> {
  const old=(value as {version?:number})?.version===1?migrateLayoutV1(value):value
  if(!isChartLayoutV2(old)) return {status:'error',code:'migration',message:'旧布局结构无效，原件已保留'}
  const data=clean(old), styles=data.styles
  const axes:ChartLayoutV3['axes']=[]
  if(styles?.yAxis && typeof styles.yAxis==='object' && !Array.isArray(styles.yAxis)) {
    const axis=styles.yAxis as Record<string,LayoutJson>, name=axis.type
    if(name!==undefined&&!['normal','percentage','log'].includes(String(name)))return {status:'error',code:'migration',message:'旧布局包含无法迁移的价格轴类型'}
    const config:ChartLayoutV3['axes'][number]={default:true,paneId:'candle_pane',name:name==='log'?'logarithm':String(name??'normal'),reverse:axis.reverse===true,inside:axis.inside===true,position:axis.position==='left'?'left':'right',scrollZoomEnabled:axis.scrollZoomEnabled!==false,gap:(axis.gap??{}) as {top?:number;bottom?:number}}
    axes.push(config)
    for(const key of ['type','reverse','inside','position','scrollZoomEnabled','gap']) delete axis[key]
  }
  // v9 tooltip icons become v10 features; preserve user customization explicitly.
  for(const key of ['indicator','candle']) {
    const tooltip=(styles?.[key] as any)?.tooltip
    if(!tooltip)continue
    if(tooltip.icons) {tooltip.features=tooltip.icons.map((icon:any)=>{const {icon:code,fontFamily:family,...style}=icon;return {...style,type:'icon_font',content:{code,family}}});delete tooltip.icons}
    if(tooltip.defaultValue!==undefined){tooltip.legend={...tooltip.legend,defaultValue:tooltip.defaultValue};delete tooltip.defaultValue}
    if(key==='candle'){
      if(tooltip.text){tooltip.legend={...tooltip.legend,...tooltip.text};delete tooltip.text}
      if(tooltip.custom!==undefined){if(typeof tooltip.custom==='function')return {status:'error',code:'migration',message:'旧提示框回调无法序列化'};tooltip.legend={...tooltip.legend,template:tooltip.custom};delete tooltip.custom}
    }
    if(key==='indicator') {
      if(tooltip.text){tooltip.legend={...tooltip.legend,...tooltip.text};delete tooltip.text}
      if(tooltip.showName!==undefined||tooltip.showParams!==undefined) {tooltip.title={...tooltip.title,showName:tooltip.showName,showParams:tooltip.showParams};delete tooltip.showName;delete tooltip.showParams}
    }
  }
  data.indicators=data.indicators.map(i=>i.placement==='main'?{...i,paneId:'candle_pane'}:i)
  if(data.indicators.some(i=>i.paneId==='candle_pane')&&!data.panes.some(p=>p.id==='candle_pane'))data.panes.unshift({id:'candle_pane'})
  const v3=clean({...data,version:3,axes})
  return isChartLayoutV3(v3)?{status:'ok',value:v3}:{status:'error',code:'migration',message:'旧布局字段无法映射到新版，原件已保留'}
}
export function saveLayoutV3(key:string, value: Omit<ChartLayoutV3,'version'|'timestamp'>,storage:Storage=localStorage):LayoutResult<ChartLayoutV3> {
  try {const data={...value,version:3 as const,timestamp:Date.now()};if(!isChartLayoutV3(data))return {status:'error',code:'write',message:'布局结构无效，未覆盖已保存布局'};storage.setItem(PREFIX+key,JSON.stringify(data));return {status:'ok',value:data}}
  catch(error){return {status:'error',code:'write',message:error instanceof Error?error.message:'布局写入失败'}}
}
export function loadLayoutV3(key:string,storage:Storage=localStorage):LayoutResult<ChartLayoutV3> {
  try {
    const current=storage.getItem(PREFIX+key)
    if(current!==null){const value=JSON.parse(current);return isChartLayoutV3(value)?{status:'ok',value}:{status:'error',code:'corrupt',message:'新版布局已损坏，原件保留；请删除该布局或另存'}}
    for(const prefix of ['trading-chest-layout-v2-','trading-chest-layout-']){const raw=storage.getItem(prefix+key);if(raw!==null)return migrateLayoutToV3(JSON.parse(raw))}
    return {status:'missing'}
  }catch(error){return {status:'error',code:'read',message:error instanceof Error?error.message:'布局读取失败'}}
}
export function deleteLayoutV3(key:string,storage:Storage=localStorage):LayoutResult<null> {try{storage.removeItem(PREFIX+key);return {status:'ok',value:null}}catch(error){return {status:'error',code:'write',message:String(error)}}}
export function listLayoutsV3(storage:Storage=localStorage):LayoutResult<Array<{key:string;timestamp:number}>> {
  try {const result=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX)){const loaded=loadLayoutV3(key.slice(PREFIX.length),storage);if(loaded.status==='ok')result.push({key:key.slice(PREFIX.length),timestamp:loaded.value.timestamp});else if(loaded.status==='error')return loaded}}return {status:'ok',value:result.sort((a,b)=>b.timestamp-a.timestamp)}}catch(error){return {status:'error',code:'read',message:String(error)}}
}
export function captureLayout(chartPro:ChartPro, options:{localDrawingIds?:string[];annotationRefs?:string[];context?:ChartLayoutV3['context']}={}):ChartLayoutV3 {
  const chart=chartPro.getChart();if(!chart)throw Error('图表尚未就绪')
  const runtime=runtimeBindings.get(chart)
  const comparisonAxes=new Set(chart.getIndicators().filter(i=>i.name==='COMPARE').map(i=>i.yAxisId))
  const bars=chart.getDataList(),range=chart.getVisibleRange(),from=bars[Math.max(0,range.from)],to=bars[Math.min(bars.length-1,range.to-1)]
  return clean({version:3,timestamp:Date.now(),theme:chartPro.getTheme(),locale:chartPro.getLocale(),timezone:chartPro.getTimezone(),styles:chart.getStyles(),
    indicators:chart.getIndicators().filter(i=>!['TradeVis','COMPARE'].includes(i.name)&&!runtime?.indicatorIds.has(i.id)).map(i=>({id:i.id,name:i.name,placement:i.paneId==='candle_pane'?'main':'sub',paneId:i.paneId,yAxisId:i.yAxisId,calcParams:i.calcParams,visible:i.visible})),
    panes:(chart.getPaneOptions() as Array<{id:string;height:number;minHeight:number;order:number}>).filter(p=>!runtime?.paneIds.has(p.id)).map(({id,height,minHeight,order})=>({id,height,minHeight,order})),
    axes:(chart.getPaneOptions() as Array<{id:string}>).flatMap(p=>chart.getYAxes({paneId:p.id}).filter(a=>!comparisonAxes.has(a.id)&&!runtime?.axisIds.has(a.id)&&!runtime?.paneIds.has(p.id)).map((a,index)=>({id:a.id,default:index===0,paneId:p.id,name:a.name,reverse:a.reverse,inside:a.inside,position:a.position,scrollZoomEnabled:a.scrollZoomEnabled,gap:a.gap}))),
    overlayData:chart.getOverlays().filter(o=>options.localDrawingIds?.includes(o.id)).map(o=>({id:o.id,paneId:o.paneId,name:o.name,groupId:o.groupId,points:o.points.map(({timestamp,dataIndex,value})=>({timestamp,dataIndex,value})),lock:o.lock,visible:o.visible,styles:o.styles??undefined,extendData:o.extendData??undefined})),
    context:options.context,annotationRefs:options.annotationRefs,viewport:from&&to?{fromTimestamp:from.timestamp,toTimestamp:to.timestamp,barSpace:chart.getBarSpace().bar}:undefined}) as unknown as ChartLayoutV3
}
export async function restoreLayout(chartPro:ChartPro,layout:ChartLayoutV3):Promise<void> {
  if(!isChartLayoutV3(layout))throw Error('布局结构无效')
  const chart=chartPro.getChart();if(!chart)throw Error('图表尚未就绪')
  const epoch=getIdentityEpoch(chart),symbol=chartPro.getSymbol().ticker,period=chartPro.getPeriod()
  const assertReady=()=>{
    if(chartPro.getChart()!==chart)throw Error('图表实例已改变，请重新加载布局')
    const current=chartPro.getPeriod()
    if(getIdentityEpoch(chart)!==epoch||chartPro.getSymbol().ticker!==symbol||current.timespan!==period.timespan||current.multiplier!==period.multiplier)throw new DOMException('布局恢复期间标的或周期已改变','AbortError')
    if(layout.context?.ticker && layout.context.ticker!==chartPro.getSymbol().ticker)throw Error('布局标的与当前图表不匹配')
    if(chartPro.getDrawingHistoryState().pending)throw Error('绘图提交尚未确认，请完成后再恢复布局')
    if(chartPro.getDrawingHistoryState().uncertainLogicalIds.length)throw Error('绘图提交结果待确认，请刷新标注后恢复布局')
  }
  assertReady()
  const {indicatorRegistry}=await import('../indicator')
  const {validateIndicatorParams}=await import('../indicator/catalog')
  const catalog=chartPro.getIndicatorCatalog()
  for(const indicator of layout.indicators){const d=catalog.find(d=>d.name===indicator.name);if(!d||!d.placements.includes(indicator.placement))throw Error(`无法恢复指标 ${indicator.name}：不在当前目录或窗格不支持`);if(indicator.calcParams!==undefined)validateIndicatorParams(d,indicator.calcParams);await indicatorRegistry.ensureRegistered(indicator.name)}
  const {getSupportedIndicators}=await import('klinecharts')
  const supported=new Set(getSupportedIndicators())
  for(const indicator of layout.indicators)if(!supported.has(indicator.name))throw Error(`无法恢复指标 ${indicator.name}：当前引擎未注册该指标，当前工作台已保留`)
  assertReady()
  const backendDrawings=chartPro.getDrawings().filter(d=>d.owner==='backend').map(d=>({drawing:d,names:d.overlay.paneId&&d.overlay.paneId!=='candle_pane'?chart.getIndicators({paneId:d.overlay.paneId}).map(({id,name,calcParams})=>({id,name,calcParams})):[]}))
  chartPro.resetDrawingHistory()
  chartPro.setTheme(layout.theme);chartPro.setLocale(layout.locale);chartPro.setTimezone(layout.timezone)
  chart.setStyles(layout.styles as DeepPartial<Styles> ?? {})
  for(const indicator of chart.getIndicators())if(!['TradeVis','COMPARE'].includes(indicator.name)&&!runtimeBindings.get(chart)?.indicatorIds.has(indicator.id))chart.removeIndicator({id:indicator.id})
  const axisIds=new Map<string,string>()
  for(const axis of layout.axes)if(axis.default && axis.paneId==='candle_pane' && axis.id){const real=chart.getYAxes({paneId:'candle_pane'})[0];if(real)axisIds.set(axis.id,real.id)}
  for(const i of layout.indicators){
    const paneId=i.placement==='main'?'candle_pane':i.paneId,yAxisId=i.yAxisId?axisIds.get(i.yAxisId)??i.yAxisId:undefined
    const id=chart.createIndicator({name:i.name,id:i.id,paneId,yAxisId,calcParams:i.calcParams,visible:i.visible},true)
    const actual=id?chart.getIndicators({id}):[]
    if(actual.length===1){const descriptor=catalog.find(d=>d.name===i.name)!;validateIndicatorParams(descriptor,actual[0].calcParams);configureIndicatorTooltip(chart,actual[0],descriptor)}
    if(!id||actual.length!==1||actual[0].name!==i.name||(i.id&&actual[0].id!==i.id)||(paneId&&actual[0].paneId!==paneId)||(yAxisId&&actual[0].yAxisId!==yAxisId))throw Error(`无法恢复指标 ${i.name}：创建结果或窗格／价格轴绑定不匹配`)
  }
  for(const pane of layout.panes)chart.setPaneOptions(pane)
  for(const axis of layout.axes){
    const {default:isDefault,...config}=axis
    const id=isDefault?chart.getYAxes({paneId:axis.paneId})[0]?.id:axis.id
    if(!id)throw Error('布局价格轴没有对应的真实窗格')
    if(!chart.getYAxes({id,paneId:axis.paneId}).length)chart.createYAxis({...config,id} as YAxisOverride)
    else chart.overrideYAxis({...config,id})
  }
  chartPro.restoreDrawings('local',layout.overlayData.map(overlay=>({logicalId:overlay.id??`local-${crypto.randomUUID()}`,owner:'local',overlay:{...overlay,id:overlay.id??'',styles:overlay.styles,extendData:overlay.extendData} as import('../types').OverlaySnapshot})))
  chartPro.restoreDrawings('backend',backendDrawings.map(({drawing,names})=>{
    return {...drawing,overlay:{...drawing.overlay,paneId:resolveDrawingPane(chart,drawing.overlay.paneId,names)}}
  }))
  if(layout.viewport){chart.setBarSpace(layout.viewport.barSpace);const index=chart.getDataList().findIndex(b=>b.timestamp===layout.viewport!.toTimestamp);if(index>=0)chart.scrollToDataIndex(index,0)}
}
