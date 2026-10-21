import {registerOverlay} from 'klinecharts'

// A third-party template uses only the peer engine's public overlay API.
export const analysisZoneDescriptor={toolId:'example-analysis-zone',overlayName:'EXAMPLE/AnalysisZone',labels:{'zh-CN':'示例分析区','en-US':'Example analysis zone'},category:'geometry',icon:'rect',mode:'points',minPoints:2,maxPoints:2,settings:['style','coordinates','visibility','parameters'],styleControls:['stroke','fill','lineWidth','lineStyle','textColor','fontSize'],parameters:[{key:'midline',label:'显示中线',kind:'boolean',defaultValue:true},{key:'label',label:'分析区名称',kind:'text',choices:['观察区','支撑区','阻力区'],defaultValue:'观察区'}]}
registerOverlay({name:analysisZoneDescriptor.overlayName,totalStep:3,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,styles:{polygon:{color:'#1677ff20'},line:{color:'#1677ff',size:1}},createPointFigures:({overlay,coordinates})=>{
 if(coordinates.length<2)return []
 const [a,b]=coordinates,parameters=overlay.extendData?.drawingParameters??{},middle=(a.y+b.y)/2,figures=[{type:'polygon',attrs:{coordinates:[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}]},styles:{style:'stroke_fill'}},{type:'text',ignoreEvent:true,attrs:{x:(a.x+b.x)/2,y:Math.min(a.y,b.y),text:parameters.label??'观察区',align:'center',baseline:'bottom'}}]
 if(parameters.midline!==false)figures.push({type:'line',attrs:{coordinates:[{x:a.x,y:middle},{x:b.x,y:middle}]}})
 return figures
}})
