import {registerIndicator,type Chart,type IndicatorDrawParams,type KLineData} from 'klinecharts'
import type {AnalysisEvent,AnalysisLayerSpec} from './types'
export interface AnalysisResult {value?:number;lower?:number;upper?:number}
export interface AnalysisRendererData {
  type:AnalysisLayerSpec['type'];color:string;unit:string;label:string
  valueAt:(timestamp:number)=>AnalysisResult|undefined;events:AnalysisEvent[]
  indexAt:(timestamp:number)=>number|undefined
  calculate:(bars:KLineData[])=>AnalysisResult[]
  getHits:()=>Array<{x:number;y:number;endX?:number;event:AnalysisEvent}>
}
let registered=false
export {runtimeBindings} from './bindings'
export function registerAnalysisRenderer():void {
  if(registered)return
  registerIndicator<AnalysisResult,unknown,AnalysisRendererData>({name:'TC_ANALYSIS',shortName:'Analysis',calcParams:[],figures:[{key:'value',type:'line'},{key:'lower',type:'line'},{key:'upper',type:'line'}],
    shouldUpdate:(a,b)=>({calc:a.extendData!==b.extendData,draw:true}),
    calc:(bars,indicator)=>indicator.extendData.calculate(bars),
    createTooltipDataSource:({indicator,crosshair,chart})=>{
      const d=indicator.extendData as AnalysisRendererData,time=chart.getDataList()[crosshair.dataIndex??-1]?.timestamp,value=time===undefined?undefined:d.valueAt(time)
      const legends=d.type==='events'?d.events.filter(e=>e.timestamp===time).map(e=>({title:'',value:e.label})):
        Object.entries(value??{}).map(([key,value])=>({title:`${key}: `,value:`${value}${d.unit}`}))
      return {name:d.label,calcParamsText:'',features:[],legends}
    },draw:drawAnalysis})
  registered=true
}
function drawAnalysis({ctx,chart,indicator,bounding,xAxis,yAxis}:IndicatorDrawParams<AnalysisResult,unknown,AnalysisRendererData>):boolean {
  const data=indicator.extendData,bars=chart.getDataList(),range=chart.getVisibleRange()
  const hits=data.getHits();hits.length=0
  ctx.save();ctx.strokeStyle=data.color;ctx.fillStyle=data.color;ctx.lineWidth=2
  const from=Math.max(0,range.from-1),to=Math.min(bars.length,range.to+1)
  if(data.type==='events'){
    const lanes=new Map<number,number>()
    for(const event of data.events){const index=data.indexAt(event.timestamp),end=event.endTimestamp===undefined?undefined:data.indexAt(event.endTimestamp);if(index===undefined||index>=to||(end??index)<from)continue
      const x=xAxis.convertToPixel(index),lane=lanes.get(event.timestamp)??0,y=Math.max(12,bounding.height-20-lane*18);lanes.set(event.timestamp,lane+1)
      ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill()
      const clip=(pixel:number)=>Math.max(1,Math.min(bounding.width-1,pixel))
      let hitX=x,labelX=x,endX:number|undefined
      if(end!==undefined){const pixel=xAxis.convertToPixel(end);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(pixel,y);ctx.stroke();labelX=clip(x);hitX=clip(x);endX=clip(pixel)}
      ctx.font='11px sans-serif';ctx.fillText(event.label,labelX+8,y+3);hits.push({x:hitX,y,endX,event})
    }
  }else if(data.type==='histogram'){
    const zero=yAxis.convertToPixel(0),width=Math.max(1,Math.min(20,chart.getBarSpace().bar*0.7))
    for(let index=from;index<to;index++){const v=data.valueAt(bars[index].timestamp)?.value;if(v===undefined)continue;const y=yAxis.convertToPixel(v);ctx.fillRect(xAxis.convertToPixel(index)-width/2,Math.min(y,zero),width,Math.max(1,Math.abs(zero-y)))}
  }else if(data.type==='band'){
    let segment:Array<{x:number;lower:number;upper:number}>=[]
    const flush=()=>{if(!segment.length)return;ctx.beginPath();segment.forEach((p,i)=>i?ctx.lineTo(p.x,p.upper):ctx.moveTo(p.x,p.upper));[...segment].reverse().forEach(p=>ctx.lineTo(p.x,p.lower));ctx.closePath();ctx.globalAlpha=0.2;ctx.fill();ctx.globalAlpha=1;ctx.stroke();segment=[]}
    for(let index=from;index<to;index++){const v=data.valueAt(bars[index].timestamp);if(v?.lower===undefined||v.upper===undefined){flush();continue}segment.push({x:xAxis.convertToPixel(index),lower:yAxis.convertToPixel(v.lower),upper:yAxis.convertToPixel(v.upper)})}flush()
  }else{
    let connected=false;ctx.beginPath()
    for(let index=from;index<to;index++){const v=data.valueAt(bars[index].timestamp)?.value;if(v===undefined){connected=false;continue}const x=xAxis.convertToPixel(index),y=yAxis.convertToPixel(v);if(connected)ctx.lineTo(x,y);else ctx.moveTo(x,y);connected=true}ctx.stroke()
  }
  ctx.restore();return true
}
