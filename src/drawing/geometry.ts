import type {KLineData,Point,Coordinate} from 'klinecharts'
import type {DrawingSnapshot} from './types'
import type {Period} from '../types'
import {anchorsFromPoints} from './anchors'
import {isVolumeDrawing} from './analytics'
import {marketIndex} from '../core/marketIndex'
export {marketIndex} from '../core/marketIndex'

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
/** Keyboard intent uses actual bars for time-only tools and pixels for ordinary drawings. */
export function nudgedDrawing(before:DrawingSnapshot,dx:number,dy:number,geometry:DrawingGeometry):DrawingSnapshot {
  if(!isVolumeDrawing(before.overlay.name))return translatedDrawing(before,dx,dy,geometry)
  if(!Number.isInteger(dx)||!Number.isFinite(dy))throw Error('量价绘图微调必须使用整数根数')
  if(!dx)return structuredClone(before)
  const after=structuredClone(before)
  after.overlay.points=geometry.project(before).map(point=>{
    const index=Math.round(marketIndex(point.timestamp!,geometry.bars))+dx,bar=geometry.bars[index]
    if(!bar)throw Error('量价绘图只能移动到已加载历史')
    return {timestamp:bar.timestamp,dataIndex:index,value:point.value}
  })
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
