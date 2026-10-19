import type {OverlayTemplate,OverlayCreateFiguresCallbackParams} from 'klinecharts'
import {marketIndex} from '../drawing/geometry'
import {canProjectAxisValue,linearRegression,toolParameters} from './numerics'

export function regressionFigures(args:OverlayCreateFiguresCallbackParams<unknown>,channel:boolean):ReturnType<NonNullable<OverlayTemplate['createPointFigures']>>{
  const {chart,overlay,coordinates,yAxis,xAxis,bounding}=args
  if(coordinates.length<2)return []
  try{
    if(!xAxis||!yAxis)throw Error('绘图坐标轴尚未就绪')
    if(overlay.paneId!=='candle_pane')throw Error('回归工具仅使用主价格窗格的真实行情')
    const bars=chart.getDataList(),indices=overlay.points.map(point=>point.dataIndex??marketIndex(point.timestamp!,bars)),from=Math.ceil(Math.min(...indices)),to=Math.floor(Math.max(...indices))
    if(from<0||to>=bars.length)throw Error('请先加载回归区间的真实历史，未来区域不能参与回归')
    const params=toolParameters(overlay),source=(params.source??'close') as 'open'|'high'|'low'|'close',multiple=Number(params.deviations??2)
    const fit=linearRegression(bars.slice(from,to+1).map(bar=>bar[source])),end=params.extend===false?to:Math.max(to,xAxis.convertFromPixel(bounding.width))
    const count=Math.min(128,Math.max(2,Math.ceil(end-from)+1))
    const line=(offset:number)=>Array.from({length:count},(_,index)=>{const dataIndex=from+(end-from)*index/(count-1),value=fit.intercept+fit.slope*(dataIndex-from)+offset,y=yAxis.convertToPixel(value);if(!canProjectAxisValue(yAxis,value))throw Error('当前价格轴不能显示回归值，请切换线性轴或选择正值区间');return {x:xAxis.convertToPixel(dataIndex),y}})
    const center=line(0)
    if(!channel)return [{type:'line',attrs:{coordinates:center}}]
    const upper=line(fit.deviation*multiple),lower=line(-fit.deviation*multiple)
    return [{type:'polygon',ignoreEvent:true,attrs:{coordinates:[...upper,...lower.reverse()]},styles:{style:'fill'}},{type:'line',attrs:{coordinates:center}},{type:'line',attrs:[{coordinates:upper},{coordinates:[...lower].reverse()}],styles:{style:'dashed'}}]
  }catch(error){return [{type:'rectText',ignoreEvent:true,attrs:{...coordinates[0],text:error instanceof Error?error.message:String(error),baseline:'bottom'},styles:{color:'#ef5350'}}]}
}
export function regressionTemplate(name:string,channel:boolean):OverlayTemplate{return {name,totalStep:3,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,styles:{polygon:{color:'rgba(22,119,255,.08)'}},createPointFigures:args=>regressionFigures(args,channel)}}
