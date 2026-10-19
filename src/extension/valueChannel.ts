import type {OverlayTemplate,OverlayCreateFiguresCallbackParams} from 'klinecharts'
import {marketIndex} from '../drawing/geometry'
import {canProjectAxisValue} from './numerics'

type ValuePoint={index:number;value:number}
/** Affine channel definitions use bar indexes and original prices before projection. */
export function valueChannelFigures(args:OverlayCreateFiguresCallbackParams<unknown>,kind:'parallel'|'channel'|'pitchfork'|'schiff'):ReturnType<NonNullable<OverlayTemplate['createPointFigures']>>{
 const {overlay,coordinates,bounding,xAxis,yAxis,chart}=args
 if(coordinates.length<2)return []
 try{
  if(!xAxis||!yAxis)throw Error('绘图坐标轴尚未就绪')
  const points:ValuePoint[]=overlay.points.slice(0,coordinates.length).map(p=>({index:p.dataIndex??marketIndex(p.timestamp!,chart.getDataList()),value:p.value!}))
  if(points.some(p=>!Number.isFinite(p.index)||!canProjectAxisValue(yAxis,p.value)))throw Error('当前价格轴不能显示通道坐标')
  const mid=(a:ValuePoint,b:ValuePoint):ValuePoint=>({index:(a.index+b.index)/2,value:(a.value+b.value)/2})
  let definitions:Array<[ValuePoint,ValuePoint,boolean]>=[]
  const [a,b,c]=points
  if(kind==='parallel'||kind==='channel'){
   definitions=[[a,b,false]]
   if(c){const dy=b.value-a.value,dx=b.index-a.index,end={index:c.index+dx,value:c.value+dy};definitions.push([c,end,false]);if(kind==='channel'){const reflected={index:2*a.index-c.index,value:2*a.value-c.value};definitions.push([reflected,{index:reflected.index+dx,value:reflected.value+dy},false])}}
  }else if(!c)return [{type:'line',ignoreEvent:true,attrs:{coordinates}}]
  else{
   const pivot=kind==='schiff'?{index:a.index,value:(a.value+b.value)/2}:a,center=mid(b,c),dx=center.index-pivot.index,dy=center.value-pivot.value
   definitions=[pivot,b,c,mid(center,b),mid(center,c)].map(start=>[start,{index:start.index+dx,value:start.value+dy},true])
  }
  const paths=definitions.map(([start,end,ray])=>{
   if(Math.abs(end.index-start.index)<1e-12){const x=xAxis.convertToPixel(start.index);return {coordinates:[{x,y:0},{x,y:bounding.height}]}}
   const left=xAxis.convertFromPixel(0),right=xAxis.convertFromPixel(bounding.width),forward=end.index>start.index
   const from=ray&&forward?Math.max(left,start.index):left,to=ray&&!forward?Math.min(right,start.index):right
   if(to<from)return {coordinates:[]}
   const n=65,slope=(end.value-start.value)/(end.index-start.index)
   const line=Array.from({length:n},(_,i)=>{const index=from+(to-from)*i/(n-1),value=start.value+(index-start.index)*slope;if(!canProjectAxisValue(yAxis,value))throw Error('当前价格轴不能显示通道派生值，请切换线性轴或调整坐标');return {x:xAxis.convertToPixel(index),y:yAxis.convertToPixel(value)}})
   return {coordinates:line}
  })
  return [{type:'line',attrs:paths}]
 }catch(error){return [{type:'rectText',ignoreEvent:true,attrs:{...coordinates[0],text:error instanceof Error?error.message:String(error),baseline:'bottom'},styles:{color:'#ef5350'}}]}
}
export function valueChannelTemplate(name:string,kind:Parameters<typeof valueChannelFigures>[1]):OverlayTemplate{return {name,totalStep:4,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,createPointFigures:args=>valueChannelFigures(args,kind)}}
export const parallelStraightLine=valueChannelTemplate('parallelStraightLine','parallel')
export const priceChannelLine=valueChannelTemplate('priceChannelLine','channel')
