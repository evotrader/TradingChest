import {createOpaqueId} from '../ids'
import {yieldTask} from '../core/yieldTask'
import type {ChartPro} from '../types'
import type {KLineData} from 'klinecharts'
import type {DrawingSnapshot,DrawingPresentation} from '../drawing/types'
import {anchorsFromPoints} from '../drawing/anchors'
import {validateDrawingParameters} from '../drawing/catalog'
import {drawingBindings} from '../drawing/bindings'
import {getIdentityEpoch} from '../core/identityEpoch'
import {isChartLayoutV4} from './v4Validation'
export {isChartLayoutV4,isDrawingSnapshot,isDrawingPresentation} from './v4Validation'
import {isChartLayoutV3,migrateLayoutToV3,loadLayoutV3,captureLayout as captureEngineLayout,restoreLayout as restoreEngineLayout,type ChartLayoutV3,type LayoutResult} from './v3'

export interface ChartLayoutV4 extends Omit<ChartLayoutV3,'version'|'overlayData'> {
  sharedDrawingRefs?:import('../drawing/session').DrawingSharedReference[]
  version:4
  drawings:DrawingSnapshot[]
  drawingPresentation:Record<string,DrawingPresentation>
}
const PREFIX='trading-chest-layout-v4-'
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
export function migrateLayoutToV4(value:unknown,options:{bars?:KLineData[];period?:import('../types').Period}={}):LayoutResult<ChartLayoutV4> {
  if(isChartLayoutV4(value))return {status:'ok',value:copy(value)}
  const legacy=isChartLayoutV3(value)?{status:'ok' as const,value}:migrateLayoutToV3(value)
  if(legacy.status!=='ok')return legacy
  try{
    const {overlayData,...base}=copy(legacy.value),period=options.period??{...base.context?.period,multiplier:base.context?.period?.multiplier??1,timespan:base.context?.period?.timespan??'day',text:''}
    const drawings=overlayData.map(overlay=>{
      const id=overlay.id??`drawing-${createOpaqueId()}`
      return {logicalId:id,owner:'local' as const,overlay:{...overlay,id,styles:overlay.styles??null,extendData:overlay.extendData??null},anchors:anchorsFromPoints(overlay.points,options.bars??[],period)}
    })
    const migrated={...base,version:4 as const,drawings,drawingPresentation:{}}
    if(!isChartLayoutV4(migrated))throw Error('旧绘图文档无法映射到 v4')
    return {status:'ok',value:migrated}
  }catch(error){return {status:'error',code:'migration',message:`${error instanceof Error?error.message:String(error)}；原件已保留`}}
}
export function captureLayout(pro:ChartPro,options:Parameters<typeof captureEngineLayout>[1]={}):ChartLayoutV4 {
  const state=pro.getDrawingHistoryState()
  if(state.pending||state.uncertainLogicalIds.length)throw Error('绘图提交尚未确认，请刷新核对后保存')
  const chart=pro.getChart();if(!chart)throw Error('图表尚未就绪')
  const {overlayData,...base}=captureEngineLayout(pro,{...options,localDrawingIds:options.localDrawingIds??[]})
  const objects=pro.getDrawings(),drawings=objects.filter(d=>d.owner==='local'&&(d.presentation?.scope??'chart')==='chart'&&(!options.localDrawingIds||options.localDrawingIds.includes(d.logicalId))).map(d=>({...d,anchors:d.anchors??anchorsFromPoints(d.overlay.points,chart.getDataList(),pro.getPeriod())}))
  if(options.localDrawingIds?.some(id=>!objects.some(value=>value.logicalId===id)&&chart.getOverlays({id}).length))throw Error('指定本地覆盖物尚未进入确认文档，请先通过 commitDrawing 或 restoreDrawings 接管后保存')
  const drawingPresentation=Object.fromEntries(objects.filter(d=>d.owner==='backend'&&d.presentation).map(d=>[d.logicalId,d.presentation!]))
  const sharedDrawingRefs=drawingBindings.get(chart)?.captureSharedReferences?.()??[]
  const layout=copy({...base,version:4 as const,drawings,drawingPresentation,...(sharedDrawingRefs.length?{sharedDrawingRefs}:{})})
  if(!isChartLayoutV4(layout))throw Error('绘图布局无效，未写入存储')
  return layout
}
export async function restoreLayout(pro:ChartPro,layout:ChartLayoutV4):Promise<void> {
  if(!isChartLayoutV4(layout))throw Error('v4 绘图布局无效，当前图表已保留')
  const {getSupportedOverlays}=await import('klinecharts')
  const registered=new Set(getSupportedOverlays()),catalog=pro.getDrawingTools()
  for(const drawing of layout.drawings){
    const tool=catalog.find(t=>t.overlayName===drawing.overlay.name)
    if(!tool||!registered.has(drawing.overlay.name))throw Error(`无法恢复绘图 ${drawing.logicalId}：请先注册工具 ${drawing.overlay.name}，原件已保留`)
    validateDrawingParameters(tool,drawing.parameters??{})
    if(drawing.yAxisId&&!layout.axes.some(a=>a.id===drawing.yAxisId&&a.paneId===drawing.overlay.paneId))throw Error(`绘图 ${drawing.logicalId} 的价格轴不存在`)
  }
  const backendIds=new Set(pro.getDrawings().filter(d=>d.owner==='backend').map(d=>d.logicalId))
  if(layout.drawings.some(d=>backendIds.has(d.logicalId)))throw Error('导入绘图 ID 与后端标注冲突，当前图表已保留')
  const {drawings,drawingPresentation,sharedDrawingRefs,...base}=layout
  const chart=pro.getChart();if(!chart)throw Error('图表尚未就绪')
  const binding=drawingBindings.get(chart),history=binding?.history
  if(!history||!binding)throw Error('绘图恢复事务尚未绑定到当前图表')
  binding.validateRestore('local',drawings,{axes:layout.axes})
  const applyReferences=layout.sharedDrawingRefs?.length?await binding.prepareSharedReferences?.(layout.sharedDrawingRefs):undefined
  if(layout.sharedDrawingRefs?.length&&!applyReferences)throw Error('宿主共享存储未启用，引用与当前画面已保留')
  binding.validateRestore('local',drawings,{axes:layout.axes})
  applyReferences?.validateLocal(drawings)
  const checkpoint=history.checkpoint(),original=captureLayout(pro),epoch=getIdentityEpoch(chart)
  const identity=()=>JSON.stringify([pro.getSymbol(),pro.getPeriod()]),savedIdentity=identity(),lease=history.beginRestore('layout')
  const current=()=>lease.isCurrent()&&pro.getChart()===chart&&getIdentityEpoch(chart)===epoch&&identity()===savedIdentity
  const assertCurrent=()=>{if(!current())throw new DOMException('布局恢复期间图表身份已改变，旧文档不会写入新上下文','AbortError')}
  const transaction={assertCurrent,reset:()=>{assertCurrent();history.reset(false,lease.token)},restore:(owner:import('../drawing/types').DrawingOwner,values:DrawingSnapshot[])=>{assertCurrent();binding.validateRestore(owner,values);history.reconcile(owner,values,lease.token)}}
  try{
    const axisIds=await restoreEngineLayout(pro,{...base,version:3,overlayData:[]},transaction)
    assertCurrent()
    if(drawings.length>=128){await yieldTask();assertCurrent()}
    const local=copy(drawings).map(d=>({...d,yAxisId:d.yAxisId?axisIds.get(d.yAxisId)??d.yAxisId:undefined}))
    if(local.length>=128){
      binding.validateRestore('local',local)
      await history.reconcileCooperatively('local',local,lease.token,assertCurrent,binding.validateRestoreStep)
      assertCurrent()
    }else transaction.restore('local',local)
    applyReferences?.apply()
    transaction.restore('backend',pro.getDrawings().filter(d=>d.owner==='backend').map(d=>({...d,presentation:drawingPresentation[d.logicalId]??d.presentation})))
  }catch(error){
    if(!current())throw error
    applyReferences?.rollback()
    const {drawings:oldDrawings,drawingPresentation:oldPresentation,sharedDrawingRefs:oldReferences,...oldBase}=original
    try{await restoreEngineLayout(pro,{...oldBase,version:3,overlayData:[]},transaction);assertCurrent();history.rollback(checkpoint,lease.token)}catch(rollbackError){
      if(current())history.rollback(checkpoint,lease.token)
      throw new AggregateError([error,rollbackError],'布局恢复失败，原绘图文档已保留；图表配置恢复失败，请重试')
    }
    throw error
  }finally{applyReferences?.release();lease.release()}
}
export function saveLayoutV4(key:string,value:Omit<ChartLayoutV4,'version'|'timestamp'>,storage:Storage=localStorage):LayoutResult<ChartLayoutV4> {
  try{const data={...value,version:4 as const,timestamp:Date.now()};if(!isChartLayoutV4(data))throw Error('布局结构无效，未覆盖已保存布局');storage.setItem(PREFIX+key,JSON.stringify(data));return {status:'ok',value:copy(data)}}catch(error){return {status:'error',code:'write',message:String(error)}}
}
export function loadLayoutV4(key:string,storage:Storage=localStorage):LayoutResult<ChartLayoutV4> {
  try{const raw=storage.getItem(PREFIX+key);if(raw!==null){const value:unknown=JSON.parse(raw);return isChartLayoutV4(value)?{status:'ok',value}:{status:'error',code:'corrupt',message:'v4 布局已损坏，原件保留'}}const old=loadLayoutV3(key,storage);return old.status==='ok'?migrateLayoutToV4(old.value):old}catch(error){return {status:'error',code:'read',message:String(error)}}
}
export function deleteLayoutV4(key:string,storage:Storage=localStorage):LayoutResult<null>{try{storage.removeItem(PREFIX+key);return {status:'ok',value:null}}catch(error){return {status:'error',code:'write',message:String(error)}}}
export function listLayoutsV4(storage:Storage=localStorage):LayoutResult<Array<{key:string;timestamp:number}>> {
  try{const result=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX)){const loaded=loadLayoutV4(key.slice(PREFIX.length),storage);if(loaded.status==='error')return loaded;if(loaded.status==='ok')result.push({key:key.slice(PREFIX.length),timestamp:loaded.value.timestamp})}}return {status:'ok',value:result.sort((a,b)=>b.timestamp-a.timestamp)}}catch(error){return {status:'error',code:'read',message:String(error)}}
}
