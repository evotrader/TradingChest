import type {OverlayTemplate} from 'klinecharts'
import {canProjectAxisValue,toolLevels} from './numerics'

const gannBox:OverlayTemplate={name:'gannBox',totalStep:3,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,styles:{polygon:{color:'rgba(22,119,255,.15)'}},
 createPointFigures:({coordinates,overlay,yAxis})=>{
   if(coordinates.length<2||!yAxis)return []
   const [a,b]=coordinates,levels=toolLevels(overlay,[0,.25,.5,.75,1]),p0=overlay.points[0].value!,p1=overlay.points[1].value!,ys=levels.map(level=>yAxis.convertToPixel(p0+(p1-p0)*level)),xs=levels.map(level=>a.x+(b.x-a.x)*level)
   if(levels.some(level=>!canProjectAxisValue(yAxis,p0+(p1-p0)*level)))return [{type:'rectText',attrs:{...a,text:'当前价格轴不能显示江恩级别，请调整级别或切换线性轴'}}]
   return [{type:'polygon',attrs:{coordinates:[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}]},styles:{style:'stroke_fill'}},{type:'line',attrs:[...ys.map(y=>({coordinates:[{x:a.x,y},{x:b.x,y}]})),...xs.map(x=>({coordinates:[{x,y:a.y},{x,y:b.y}]}))],styles:{style:'dashed'}},{type:'line',attrs:[{coordinates:[a,b]},{coordinates:[{x:a.x,y:b.y},{x:b.x,y:a.y}]}]}]
 }}
export default gannBox
