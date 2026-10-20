import type {KLineData,Point,Coordinate} from 'klinecharts'
import type {DrawingSnapshot} from './types'
import type {Period} from '../types'
import {anchorsFromPoints} from './anchors'
import {isVolumeDrawing} from './analytics'

/** Locate a market instant geometrically without changing its canonical timestamp. */
export function marketIndex(timestamp:number,bars:KLineData[]):number {
  if(!Number.isFinite(timestamp)||!bars.length||timestamp<bars[0].timestamp||timestamp>bars[bars.length-1].timestamp)throw Error('市场锚点不在当前已加载或回放范围，请加载参考历史后重试')
  let low=0,high=bars.length-1
  while(low<=high){const middle=(low+high)>>>1,time=bars[middle].timestamp;if(time===timestamp)return middle;if(time<timestamp)low=middle+1;else high=middle-1}
  const span=bars[low].timestamp-bars[high].timestamp
  if(span<=0)throw Error('真实历史的时标顺序无效')
  return high+(timestamp-bars[high].timestamp)/span
}
export function constrainedPoint(origin:Coordinate,point:Coordinate,square=false):Coordinate {
  const dx=point.x-origin.x,dy=point.y-origin.y
  if(square){const size=Math.max(Math.abs(dx),Math.abs(dy));return {x:origin.x+Math.sign(dx||1)*size,y:origin.y+Math.sign(dy||1)*size}}
  const radius=Math.hypot(dx,dy),angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4
  return {x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius}
}
export interface DrawingGeometry {
  bars:KLineData[]
  period:Period
  size:(drawing:DrawingSnapshot)=>{width:number;height:number}
  toPixel:(point:Partial<Point>,drawing:DrawingSnapshot)=>Coordinate
  fromPixel:(coordinate:Coordinate,drawing:DrawingSnapshot)=>Partial<Point>
  project:(drawing:DrawingSnapshot)=>Partial<Point>[]
}
/** A single proposed content edit; the confirmed writer still owns validation and history. */
export function translatedDrawing(before:DrawingSnapshot,dx:number,dy:number,geometry:DrawingGeometry):DrawingSnapshot {
  if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('绘图移动距离必须是有限数值')
  const after=structuredClone(before),size=geometry.size(before)
  if(before.anchors?.every(anchor=>anchor.kind==='viewport')){
    if(!size.width||!size.height)throw Error('绘图窗格尺寸尚未就绪')
    after.anchors=before.anchors.map(anchor=>({...anchor,x:Math.max(0,Math.min(1,anchor.x+dx/size.width)),y:Math.max(0,Math.min(1,anchor.y+dy/size.height))}))
    after.overlay.points=geometry.project(after);return after
  }
  after.overlay.points=geometry.project(before).map(point=>{const pixel=geometry.toPixel(point,before),next=geometry.fromPixel({x:pixel.x+dx,y:pixel.y+(isVolumeDrawing(before.overlay.name)?0:dy)},before);if(isVolumeDrawing(before.overlay.name)){const index=Math.round(next.dataIndex??marketIndex(next.timestamp!,geometry.bars)),bar=geometry.bars[index];if(!bar)throw Error('量价绘图只能移动到已加载历史');return {timestamp:bar.timestamp,dataIndex:index,value:point.value}}return next})
  after.anchors=anchorsFromPoints(after.overlay.points,geometry.bars,geometry.period,'interaction')
  return after
}
export function rotatedDrawing(before:DrawingSnapshot,degrees:number,geometry:DrawingGeometry):DrawingSnapshot {
  if(!Number.isFinite(degrees)||before.overlay.name!=='rotatedRect')throw Error('此工具不支持旋转角度')
  const points=geometry.project(before),pixels=points.map(point=>geometry.toPixel(point,before));if(pixels.length<3)throw Error('旋转矩形需要三个控制点')
  const origin=pixels[0],current=Math.atan2(pixels[1].y-origin.y,pixels[1].x-origin.x),angle=-degrees*Math.PI/180-current
  const moved=pixels.map(point=>{const x=point.x-origin.x,y=point.y-origin.y;return geometry.fromPixel({x:origin.x+x*Math.cos(angle)-y*Math.sin(angle),y:origin.y+x*Math.sin(angle)+y*Math.cos(angle)},before)})
  return {...structuredClone(before),overlay:{...structuredClone(before.overlay),points:moved},anchors:anchorsFromPoints(moved,geometry.bars,geometry.period,'interaction')}
}
