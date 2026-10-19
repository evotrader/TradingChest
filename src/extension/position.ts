import type {OverlayTemplate,OverlayFigure} from 'klinecharts'
import {positionValues} from './numerics'

/** Price-only risk/reward drawing; no account, quantity, margin or order model. */
export function positionTemplate(name:string,direction:1|-1):OverlayTemplate{return {name,totalStep:4,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,
 createPointFigures:({coordinates,overlay,chart})=>{
   if(coordinates.length<2)return []
   const [entry,stop,target]=overlay.points.map(point=>point.value!),values=positionValues(entry,stop,target,direction,typeof chart.getSymbol()?.tickSize==='number'?chart.getSymbol()!.tickSize as number:undefined),precision=chart.getSymbol()?.pricePrecision??2,en=chart.getLocale()==='en-US',x0=coordinates[0].x,x1=coordinates[1].x,y0=coordinates[0].y,figures:OverlayFigure[]=[]
   const format=(value:number|undefined,digits=precision)=>value===undefined?'—':value.toFixed(digits)
   const labels=[`${en?'Entry':'入场'} ${format(entry)}`]
   if(values.message)labels.push(values.message)
   else {labels.push(`${en?'Risk':'风险'} ${format(values.risk)} · ${format(values.riskPercentage,2)}%${values.riskTicks===undefined?'':` · ${format(values.riskTicks,2)} tick`}`);if(target!==undefined)labels.push(`${en?'Reward':'收益'} ${format(values.reward)} · ${format(values.rewardPercentage,2)}%${values.rewardTicks===undefined?'':` · ${format(values.rewardTicks,2)} tick`} · R/R ${format(values.ratio,2)}`)}
   if(entry<=0)labels.push(en?'Percentage unavailable for non-positive entry':'非正入场价不计算百分比')
   for(const [index,color] of [[1,'rgba(239,83,80,.18)'],[2,'rgba(38,166,154,.18)']] as const){if(!coordinates[index])continue;const y=coordinates[index].y;figures.push({type:'polygon',attrs:{coordinates:[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y},{x:x0,y}]},styles:{style:'stroke_fill',color,borderColor:overlay.styles?.polygon?.borderColor??color,borderSize:overlay.styles?.polygon?.borderSize??1}}, {type:'line',attrs:{coordinates:[{x:x0,y},{x:x1,y}]}})}
   figures.push({type:'line',attrs:{coordinates:[{x:x0,y:y0},{x:x1,y:y0}]}},{type:'rectText',ignoreEvent:true,attrs:{x:(x0+x1)/2,y:y0-8,text:labels.join('\n'),baseline:'bottom',align:'center'},styles:{size:12,color:values.message?'#ef5350':overlay.styles?.text?.color??'#1677ff',backgroundColor:'rgba(128,128,128,.08)',...overlay.styles?.text}})
   return figures
 }}}
