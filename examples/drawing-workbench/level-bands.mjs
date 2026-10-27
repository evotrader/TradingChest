import {registerOverlay} from 'klinecharts'
import {resolveDrawingLevels} from 'trading-chest/chart'

// A generic host capability; no built-in name, DTO or source alias is required.
export const levelBandsDescriptor={toolId:'example-level-bands',overlayName:'EXAMPLE/LevelBands',labels:{'zh-CN':'示例级别带','en-US':'Example level bands'},category:'fibonacci',icon:'fibonacciLine',mode:'points',minPoints:2,maxPoints:2,settings:['style','coordinates','visibility','parameters'],styleControls:['stroke','lineWidth','lineStyle','textColor','fontSize'],parameters:[{key:'zones',label:'区域级别',kind:'level-set',defaultValue:[-.25,.5,.5,1.25]}]}
registerOverlay({name:levelBandsDescriptor.overlayName,totalStep:3,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,styles:{line:{color:'#1677ff',size:1},text:{size:12,color:'#1677ff'}},createPointFigures:({overlay,coordinates,yAxis})=>{
 if(coordinates.length<2||!yAxis)return []
 const levels=resolveDrawingLevels(overlay.extendData?.drawingParameters?.zones,levelBandsDescriptor.parameters[0].defaultValue),figures=[]
 for(const level of levels.items){
  if(!level.visible)continue
  const price=overlay.points[1].value+(overlay.points[0].value-overlay.points[1].value)*level.value,y=yAxis.convertToPixel(price)
  if(!Number.isFinite(y))continue
  figures.push({key:'example-level:'+level.id,type:'line',attrs:{coordinates:[{x:coordinates[0].x,y},{x:coordinates[1].x,y}]},styles:{...(level.color===undefined?{}:{color:level.color}),...(level.width===undefined?{}:{size:level.width}),...(level.style?{style:level.style==='solid'?'solid':'dashed',dashedValue:level.style==='dotted'?[1,3]:[6,4]}:{})}})
  if(level.text)figures.push({key:'example-body:'+level.id,type:'text',ignoreEvent:true,attrs:{x:coordinates[0].x,y,text:level.text}})
 }
 return figures
}})
