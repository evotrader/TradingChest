import type {DrawingSnapshot} from '../../drawing/types'
export type DrawingTreeRow={key:string;top:number;height:number;object?:DrawingSnapshot;group?:{id:string;name:string;members:DrawingSnapshot[]};level:1|2}
export const drawingGroupKey=(drawing:DrawingSnapshot)=>JSON.stringify([drawing.presentation?.scope??'chart',drawing.overlay.paneId??'candle_pane',drawing.presentation?.groupId??null])
export function flattenDrawingRows(objects:DrawingSnapshot[],collapsed:ReadonlySet<string>,searching=false):DrawingTreeRow[]{
  const groups=new Map<string,DrawingSnapshot[]>()
  for(const object of objects)if(object.presentation?.groupId){const key=drawingGroupKey(object);const members=groups.get(key)??[];members.push(object);groups.set(key,members)}
  const rows:DrawingTreeRow[]=[],seen=new Set<string>()
  let top=0
  const append=(row:Omit<DrawingTreeRow,'top'>)=>{rows.push({...row,top});top+=row.height}
  for(const object of objects){
    if(!object.presentation?.groupId){append({key:`object:${object.logicalId}`,object,height:56,level:1});continue}
    const id=drawingGroupKey(object);if(seen.has(id))continue;seen.add(id)
    const members=groups.get(id)!
    append({key:`group:${id}`,height:48,level:1,group:{id,name:object.presentation.groupName??object.presentation.groupId,members}})
    if(searching||!collapsed.has(id))for(const member of members)append({key:`object:${member.logicalId}`,object:member,height:56,level:2})
  }
  return rows
}
export function visibleDrawingRows(rows:DrawingTreeRow[],scrollTop:number,height:number,overscan=4):DrawingTreeRow[]{
  let a=0,b=rows.length
  while(a<b){const m=(a+b)>>>1;if(rows[m].top+rows[m].height<=scrollTop)a=m+1;else b=m}
  const from=Math.max(0,a-overscan),bottom=scrollTop+height
  while(a<rows.length&&rows[a].top<bottom)a++
  return rows.slice(from,Math.min(rows.length,a+overscan))
}
export function legalReorderTargets(objects:DrawingSnapshot[],ids:string[],uncertain:readonly string[]=[]):DrawingSnapshot[]{
  const selected=objects.filter(o=>ids.includes(o.logicalId))
  if(!selected.length||selected.length!==ids.length||selected.some(o=>o.overlay.lock||o.migration||uncertain.includes(o.logicalId))||new Set(selected.map(drawingGroupKey)).size!==1)return []
  const key=drawingGroupKey(selected[0])
  return objects.filter(o=>!ids.includes(o.logicalId)&&drawingGroupKey(o)===key&&!o.overlay.lock&&!o.migration&&!uncertain.includes(o.logicalId))
}
