import type {Coordinate,OverlayFigure,TextStyle} from 'klinecharts'
import type {DrawingToolDescriptor} from './catalog'
import type {DrawingSnapshot} from './types'
import {drawingText} from './text'

const coordinate=(value:any):value is Coordinate=>Number.isFinite(value?.x)&&Number.isFinite(value?.y)
/** Clip the actual reference segment; no replacement tool geometry is inferred. */
function clip(a:Coordinate,b:Coordinate,width:number,height:number):[Coordinate,Coordinate]|undefined {
  const dx=b.x-a.x,dy=b.y-a.y,p=[-dx,dx,-dy,dy],q=[a.x,width-a.x,a.y,height-a.y]
  let from=0,to=1
  for(let i=0;i<4;i++){
    if(p[i]===0){if(q[i]<0)return;continue}
    const ratio=q[i]/p[i]
    if(p[i]<0)from=Math.max(from,ratio);else to=Math.min(to,ratio)
    if(from>to)return
  }
  return [{x:a.x+from*dx,y:a.y+from*dy},{x:a.x+to*dx,y:a.y+to*dy}]
}
/** Keep the complete native path, including a visible tail after an offscreen first segment. */
function lineTarget(coordinates:Coordinate[],size:{width:number;height:number},fraction:number):Coordinate|undefined {
  const segments:Array<[Coordinate,Coordinate]>=[]
  for(let i=1;i<coordinates.length;i++){
    if(!coordinate(coordinates[i-1])||!coordinate(coordinates[i]))continue
    const segment=clip(coordinates[i-1],coordinates[i],size.width,size.height)
    if(segment)segments.push(segment)
  }
  if(!segments.length)return
  const first=segments[0][0],last=segments.at(-1)![1]
  if(first.x>last.x||first.x===last.x&&first.y>last.y){segments.reverse();for(const segment of segments)segment.reverse()}
  let distance=segments.reduce((total,[a,b])=>total+Math.hypot(b.x-a.x,b.y-a.y),0)*fraction
  for(const [a,b]of segments){const length=Math.hypot(b.x-a.x,b.y-a.y);if(distance<=length){const t=length?distance/length:0;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}}distance-=length}
  return segments.at(-1)![1]
}
export function attachedTextFigures(figures:OverlayFigure[],tool:DrawingToolDescriptor|undefined,drawing:DrawingSnapshot,size:{width:number;height:number},defaults:Partial<TextStyle>={}):OverlayFigure[] {
  if(tool?.textMode!=='attached'||!drawing.parameters?.labelVisible||drawing.overlay.points.length<tool.minPoints)return figures
  const text=drawingText(drawing.overlay.extendData)
  if(!text||!(size.width>0&&size.height>0))return figures
  const align=(drawing.parameters.labelAlign??'center') as 'left'|'center'|'right',position=drawing.parameters.labelPosition??'above'
  let target:Coordinate|undefined
  outer:for(const figure of figures)for(const attrs of [figure.attrs].flat() as any[]){
    if(tool.labelGeometry==='line'&&figure.type==='line'&&Array.isArray(attrs?.coordinates)&&attrs.coordinates.length>=2){
      target=lineTarget(attrs.coordinates,size,align==='left'?0:align==='right'?1:.5)
      if(target)break outer
    }
    if(tool.labelGeometry==='box'){
      let bounds:{left:number;right:number;top:number;bottom:number}|undefined
      const rect=attrs as Coordinate&{width:number;height:number}
      if(figure.type==='rect'&&coordinate(rect)&&Number.isFinite(rect.width)&&Number.isFinite(rect.height))bounds={left:Math.min(rect.x,rect.x+rect.width),right:Math.max(rect.x,rect.x+rect.width),top:Math.min(rect.y,rect.y+rect.height),bottom:Math.max(rect.y,rect.y+rect.height)}
      if(figure.type==='polygon'&&Array.isArray(attrs?.coordinates)&&attrs.coordinates.length===4&&attrs.coordinates.every(coordinate)){
        const xs=[...new Set<number>(attrs.coordinates.map((p:Coordinate)=>p.x))],ys=[...new Set<number>(attrs.coordinates.map((p:Coordinate)=>p.y))]
        if(xs.length===2&&ys.length===2&&new Set(attrs.coordinates.map((p:Coordinate)=>`${p.x},${p.y}`)).size===4)bounds={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)}
      }
      if(bounds&&bounds.right>=0&&bounds.left<=size.width&&bounds.bottom>=0&&bounds.top<=size.height){target={x:align==='left'?bounds.left:align==='right'?bounds.right:(bounds.left+bounds.right)/2,y:position==='above'?bounds.top:position==='below'?bounds.bottom:(bounds.top+bounds.bottom)/2};break outer}
    }
  }
  if(!target)return figures
  const baseline=position==='above'?'bottom':position==='below'?'top':'middle'
  return [...figures,{type:'rectText',key:'attached-text',attrs:{...target,y:target.y+(position==='above'?-8:position==='below'?8:0),text,align,baseline},styles:{...defaults,backgroundColor:'transparent',borderSize:0,...drawing.overlay.styles?.text}}]
}
