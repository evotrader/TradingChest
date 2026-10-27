import {registerOverlay} from 'klinecharts'

// Capabilities are declarative and use the same public schema as built-in tools.
export const attachedTools=[['ExampleAttachedLine','示例附着线','line'],['ExampleAttachedBox','示例附着矩形','box']].map(([name,label,labelGeometry])=>({toolId:name,overlayName:name,labels:{'zh-CN':label,'en-US':name},category:'geometry',icon:labelGeometry==='box'?'rect':'segment',mode:'points',minPoints:2,maxPoints:2,settings:['style','coordinates','visibility'],styleControls:['stroke','lineWidth','lineStyle'],parameters:[],textMode:'attached',labelGeometry,numericMove:{bars:true,price:true}}))
for(const tool of attachedTools)registerOverlay({name:tool.overlayName,totalStep:3,createPointFigures:({coordinates})=>{
 if(coordinates.length<2)return []
 const [a,b]=coordinates
 return tool.labelGeometry==='line'?[{type:'line',attrs:{coordinates}}]:[{type:'rect',attrs:{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)},styles:{style:'stroke_fill',color:'#1677ff20'}}]
}})
