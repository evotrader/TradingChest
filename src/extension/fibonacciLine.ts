import type {OverlayTemplate} from 'klinecharts'
import {canProjectAxisValue,fibonacciPrices,toolLevels} from './numerics'

const fibonacciLine:OverlayTemplate={name:'fibonacciLine',totalStep:3,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,
  createPointFigures:({coordinates,overlay,chart,yAxis,bounding})=>{
    if(coordinates.length<2||!yAxis)return []
    const levels=toolLevels(overlay),prices=fibonacciPrices(overlay.points[0].value!,overlay.points[1].value!,levels),precision=chart.getSymbol()?.pricePrecision??2
    if(prices.some(price=>!canProjectAxisValue(yAxis,price)))return [{type:'rectText',attrs:{...coordinates[0],text:'当前价格轴不能显示此级别，请调整级别或切换线性轴'}}]
    return [{type:'line',attrs:prices.map(price=>({coordinates:[{x:0,y:yAxis.convertToPixel(price)},{x:bounding.width,y:yAxis.convertToPixel(price)}]}))},{type:'text',ignoreEvent:true,attrs:prices.map((price,index)=>({x:0,y:yAxis.convertToPixel(price),text:`${price.toFixed(precision)} (${(levels[index]*100).toFixed(1)}%)`,baseline:'bottom'}))}]
  }}
export default fibonacciLine
