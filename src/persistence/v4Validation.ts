import type {DrawingSnapshot,DrawingPresentation} from '../drawing/types'
import type {ChartLayoutV4} from './v4'
import {validateAnchor} from '../drawing/anchors'
import {drawingShareKey} from '../drawing/document'
import {jsonSafe} from './v2'
import {isDrawingLevelSet} from '../drawing/levels'
import {isChartLayoutV3} from './v3'

export function isDrawingPresentation(value:unknown):value is DrawingPresentation {
  if(!value||typeof value!=='object'||Array.isArray(value))return false
  const p=value as DrawingPresentation
  if(Object.keys(p).some(k=>!['name','groupId','groupName','order','intervals','scope'].includes(k)))return false
  if([p.name,p.groupId,p.groupName].some(s=>s!==undefined&&typeof s!=='string')||p.order!==undefined&&(!Number.isFinite(p.order)||!Number.isInteger(p.order))||p.scope!==undefined&&!['chart','workspace','host'].includes(p.scope))return false
  const f=p.intervals
  if(!f)return true
  const period=(v:any)=>v&&typeof v.timespan==='string'&&v.timespan.length>0&&Number.isInteger(v.multiplier)&&v.multiplier>0
  return f.kind==='all'||(['current','higher','lower'].includes(f.kind)&&'period' in f&&period(f.period))||f.kind==='list'&&Array.isArray(f.periods)&&f.periods.every(period)
}
const isSharedReference=(r:any):boolean=>{
  if(!r||typeof r.namespace!=='string'||!r.namespace||typeof r.documentId!=='string'||!r.documentId||typeof r.logicalId!=='string'||!r.logicalId||r.identity?.namespace!==r.namespace)return false
  try{drawingShareKey(r.identity);return true}catch{return false}
}
export function isDrawingSnapshot(value:unknown):value is DrawingSnapshot {
  return jsonSafe(value)&&drawingSnapshotShape(value)
}
/** The containing layout has already traversed every JSON field in this call. */
function drawingSnapshotShape(value:unknown):value is DrawingSnapshot {
  if(!value||typeof value!=='object')return false
  const d=value as DrawingSnapshot,o=d.overlay
  if(typeof d.logicalId!=='string'||!d.logicalId||!['local','backend'].includes(d.owner)||d.backendId!==undefined&&typeof d.backendId!=='string'||!o||o.id!==d.logicalId||typeof o.name!=='string'||!o.name||typeof o.groupId!=='string'||typeof o.lock!=='boolean'||typeof o.visible!=='boolean'||!Array.isArray(o.points)||o.paneId!==undefined&&typeof o.paneId!=='string')return false
  if(o.points.some(p=>!p||typeof p.value!=='number'||!Number.isFinite(p.value)||!['timestamp','dataIndex'].some(k=>typeof (p as any)[k]==='number'&&Number.isFinite((p as any)[k]))))return false
  if(d.migration&&(d.migration.direction!==undefined&&d.migration.direction!=='from-host'||!['prepared','uncertain'].includes(d.migration.status)||!isSharedReference(d.migration.target)||d.migration.target.logicalId!==d.logicalId||d.owner!=='local'))return false
  if(d.yAxisId!==undefined&&typeof d.yAxisId!=='string'||d.presentation!==undefined&&!isDrawingPresentation(d.presentation))return false
  if(d.anchors!==undefined){if(!Array.isArray(d.anchors)||d.anchors.length!==o.points.length)return false;try{d.anchors.forEach(validateAnchor)}catch{return false}}
  return d.parameters===undefined||!!d.parameters&&typeof d.parameters==='object'&&!Array.isArray(d.parameters)&&Object.values(d.parameters).every(v=>typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||Array.isArray(v)&&v.every(n=>typeof n==='number'&&Number.isFinite(n))||isDrawingLevelSet(v))
}
export function isChartLayoutV4(value:unknown):value is ChartLayoutV4 {
  return jsonSafe(value)&&chartLayoutV4Shape(value)
}
/** Internal subtree validator; its caller must have checked the complete containing JSON tree. */
export function chartLayoutV4Shape(value:unknown):value is ChartLayoutV4 {
  if(!value||typeof value!=='object')return false
  const v=value as ChartLayoutV4
  if(v.version!==4||!Array.isArray(v.drawings)||!v.drawingPresentation||typeof v.drawingPresentation!=='object'||Array.isArray(v.drawingPresentation))return false
  if(v.sharedDrawingRefs!==undefined&&(!Array.isArray(v.sharedDrawingRefs)||v.sharedDrawingRefs.some(r=>!isSharedReference(r))||new Set(v.sharedDrawingRefs.map(r=>r.logicalId)).size!==v.sharedDrawingRefs.length))return false
  const {drawings,drawingPresentation,sharedDrawingRefs,...base}=v
  if(!isChartLayoutV3({...base,version:3,overlayData:[]}))return false
  if(drawings.some(d=>!drawingSnapshotShape(d)||d.owner!=='local'||d.presentation?.scope!==undefined&&d.presentation.scope!=='chart'||!d.anchors||d.overlay.paneId&&!v.panes.some(p=>p.id===d.overlay.paneId)||d.yAxisId&&!v.axes.some(a=>a.id===d.yAxisId&&a.paneId===d.overlay.paneId)))return false
  if(new Set(drawings.map(d=>d.logicalId)).size!==drawings.length||Object.values(drawingPresentation).some(p=>!isDrawingPresentation(p)))return false
  const groups=new Map<string,string>()
  for(const d of drawings)if(d.presentation?.groupId){const pane=d.overlay.paneId??'candle_pane',previous=groups.get(d.presentation.groupId);if(previous&&previous!==pane)return false;groups.set(d.presentation.groupId,pane)}
  return true
}
