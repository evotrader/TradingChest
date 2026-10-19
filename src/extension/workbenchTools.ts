import type {OverlayTemplate,Coordinate} from 'klinecharts'
import brush from './brush'
import textAnnotation from './textAnnotation'

export function rotatedRectangle(a:Coordinate,b:Coordinate,c:Coordinate):Coordinate[] {
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)
  if(!length)return []
  const nx=-dy/length,ny=dx/length,width=(c.x-a.x)*nx+(c.y-a.y)*ny
  return [a,b,{x:b.x+nx*width,y:b.y+ny*width},{x:a.x+nx*width,y:a.y+ny*width}]
}
export function ellipseCoordinates(a:Coordinate,b:Coordinate):Coordinate[]{
  const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2
  return Array.from({length:65},(_,i)=>({x:cx+rx*Math.cos(i*Math.PI/32),y:cy+ry*Math.sin(i*Math.PI/32)}))
}
export function screenAngle(a:Coordinate,b:Coordinate):number{return Math.atan2(a.y-b.y,b.x-a.x)*180/Math.PI}
const geometry={needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true}
export const highlighter:OverlayTemplate={...brush,name:'highlighter',styles:{line:{color:'rgba(255,213,0,0.35)',size:14}}}
export const polyline:OverlayTemplate={...geometry,name:'polyline',totalStep:Number.MAX_SAFE_INTEGER,createPointFigures:({coordinates})=>coordinates.length<2?[]:[{type:'line',attrs:{coordinates}}]}
export const ellipse:OverlayTemplate={...geometry,name:'ellipse',totalStep:3,styles:{polygon:{color:'rgba(22,119,255,.15)'}},createPointFigures:({coordinates})=>coordinates.length<2?[]:[{type:'polygon',attrs:{coordinates:ellipseCoordinates(coordinates[0],coordinates[1])},styles:{style:'stroke_fill'}}]}
export const rotatedRect:OverlayTemplate={...geometry,name:'rotatedRect',totalStep:4,styles:{polygon:{color:'rgba(22,119,255,.15)'}},createPointFigures:({coordinates})=>coordinates.length<3?[]:[{type:'polygon',attrs:{coordinates:rotatedRectangle(coordinates[0],coordinates[1],coordinates[2])},styles:{style:'stroke_fill'}}]}
export const trendAngle:OverlayTemplate={...geometry,name:'trendAngle',totalStep:3,createPointFigures:({coordinates})=>coordinates.length<2?[]:[
  {type:'line',attrs:{coordinates:[coordinates[0],coordinates[1]]}},
  {type:'line',ignoreEvent:true,attrs:{coordinates:[coordinates[0],{x:coordinates[1].x,y:coordinates[0].y}]},styles:{style:'dashed'}},
  {type:'text',ignoreEvent:true,attrs:{x:coordinates[0].x,y:coordinates[0].y,text:`${screenAngle(coordinates[0],coordinates[1]).toFixed(1)}°`,baseline:'bottom'}}
]}
export const crossLine:OverlayTemplate={...geometry,name:'crossLine',totalStep:2,createPointFigures:({coordinates,bounding})=>coordinates.length<1?[]:[
  {type:'line',attrs:{coordinates:[{x:0,y:coordinates[0].y},{x:bounding.width,y:coordinates[0].y}]}},
  {type:'line',attrs:{coordinates:[{x:coordinates[0].x,y:0},{x:coordinates[0].x,y:bounding.height}]}}
]}
export const priceLabel:OverlayTemplate={...geometry,name:'priceLabel',totalStep:2,createPointFigures:({coordinates,overlay,chart})=>coordinates.length<1?[]:[{type:'rectText',attrs:{...coordinates[0],text:Number.isFinite(overlay.points[0]?.value)?overlay.points[0].value!.toFixed(chart.getSymbol()?.pricePrecision??2):'—',baseline:'middle',align:'left'},styles:{style:'stroke_fill',paddingLeft:8,paddingRight:8,paddingTop:4,paddingBottom:4,...overlay.styles?.text}}]}
export const anchoredText:OverlayTemplate={...textAnnotation,name:'anchoredText',needDefaultXAxisFigure:false,needDefaultYAxisFigure:false}
export default [highlighter,polyline,ellipse,rotatedRect,trendAngle,crossLine,priceLabel,anchoredText]
