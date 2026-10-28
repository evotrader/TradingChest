import {registerOverlay} from 'klinecharts'
import {resolveDrawingLevels} from 'trading-chest/chart'

// A generic host capability; no built-in name, DTO or source alias is required.
export const levelBandsDescriptor={toolId:'example-level-bands',overlayName:'EXAMPLE/LevelBands',labels:{'zh-CN':'示例级别带','en-US':'Example level bands'},category:'fibonacci',icon:'fibonacciLine',mode:'points',minPoints:2,maxPoints:2,settings:['style','coordinates','visibility','parameters'],styleControls:['stroke','lineWidth','lineStyle','textColor','fontSize'],alertLevels:{resolverId:'example/level-bands',parameterKey:'zones'},parameters:[{key:'zones',label:'区域级别',kind:'level-set',defaultValue:[-.25,.5,.5,1.25]}]}
const priceAt=(a,b,ratio)=>b+(a-b)*ratio
// The resolver and renderer share only pure mathematics. UI text/order/style do not
// change comparisonKey, which must include every parameter that changes geometry.
export const levelBandsAlertResolver={id:'example/level-bands',resolve:({anchors,level})=>{
 if(anchors.length!==2)return {status:'unavailable',reason:'示例级别带需要两个市场锚点'}
 const times=anchors.map(a=>a.interpolation?a.timestamp+(a.interpolation.nextTimestamp-a.timestamp)*a.interpolation.fraction:a.timestamp),prices=anchors.map(a=>a.value)
 return {status:'ready',referencePrice:priceAt(prices[0],prices[1],level.value),from:Math.min(...times),to:Math.max(...times),comparisonKey:JSON.stringify([anchors,level.value])}
}}
registerOverlay({name:levelBandsDescriptor.overlayName,totalStep:3,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,styles:{line:{color:'#1677ff',size:1},text:{size:12,color:'#1677ff'}},createPointFigures:({overlay,coordinates,yAxis})=>{
 if(coordinates.length<2||!yAxis)return []
 const levels=resolveDrawingLevels(overlay.extendData?.drawingParameters?.zones,levelBandsDescriptor.parameters[0].defaultValue),figures=[]
 for(const level of levels.items){
  if(!level.visible)continue
  const price=priceAt(overlay.points[0].value,overlay.points[1].value,level.value),y=yAxis.convertToPixel(price)
  if(!Number.isFinite(y))continue
  figures.push({key:'example-level:'+level.id,type:'line',attrs:{coordinates:[{x:coordinates[0].x,y},{x:coordinates[1].x,y}]},styles:{...(level.color===undefined?{}:{color:level.color}),...(level.width===undefined?{}:{size:level.width}),...(level.style?{style:level.style==='solid'?'solid':'dashed',dashedValue:level.style==='dotted'?[1,3]:[6,4]}:{})}})
  if(level.text)figures.push({key:'example-body:'+level.id,type:'text',ignoreEvent:true,attrs:{x:coordinates[0].x,y,text:level.text}})
 }
 return figures
}})
