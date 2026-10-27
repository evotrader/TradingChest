import Decimal from 'decimal.js'
import type {KLineData} from 'klinecharts'
import type {Period} from '../types'
import type {DrawingAnchor,DrawingCommand,DrawingSnapshot} from './types'
import type {DrawingToolDescriptor} from './catalog'
import {projectAnchors,validateAnchor} from './anchors'
import {marketIndex} from './geometry'

type Command=Extract<DrawingCommand,{type:'translate'}>
const PriceDecimal=Decimal.clone({precision:50,rounding:Decimal.ROUND_HALF_UP})
export function numericMoveIsZero(command:Command):boolean {
  if(command.bars!==undefined&&!Number.isSafeInteger(command.bars))throw Error('平移根数必须是安全整数')
  if(command.price!==undefined&&(!command.price||typeof command.price!=='object'||!['price','tick'].includes(command.price.unit)||!Number.isFinite(command.price.amount)||command.price.unit==='tick'&&!Number.isSafeInteger(command.price.amount)))throw Error('价格位移必须有限，tick数量必须是安全整数')
  if(command.bars===undefined&&command.price===undefined)throw Error('请输入平移根数或价格位移')
  return !(command.bars??0)&&!(command.price?.amount??0)
}
/** One confirmed market/axis context and one decimal delta serve the entire batch. */
export function numericMoveDrawings(objects:DrawingSnapshot[],command:Command,context:{bars:readonly KLineData[];period:Period;tickSize?:number;defaultAxisId?:string;tool:(name:string)=>DrawingToolDescriptor|undefined}):DrawingSnapshot[] {
  if(numericMoveIsZero(command))return objects.map(object=>structuredClone(object))
  const bars=command.bars??0,price=command.price
  if(price?.unit==='tick'&&(!(context.tickSize!>0)||!Number.isFinite(context.tickSize)))throw Error('当前标的没有明确的正tickSize，不能按tick平移')
  const delta=new PriceDecimal(price?.amount??0).times(price?.unit==='tick'?context.tickSize!:1)
  if(new Set(objects.map(object=>JSON.stringify([object.presentation?.scope??'chart',object.overlay.paneId??'candle_pane',object.yAxisId??context.defaultAxisId]))).size>1)throw Error('精确平移只能操作同一文档、窗格及价格轴的对象')
  return objects.map(before=>{
    const tool=context.tool(before.overlay.name)
    if(bars&&!tool?.numericMove?.bars||!delta.isZero()&&!tool?.numericMove?.price)throw Error(`工具 ${tool?.labels['zh-CN']??before.overlay.name} 不支持所选位移单位`)
    if(!before.anchors?.length||before.anchors.some(anchor=>anchor.kind!=='market'))throw Error('精确平移只支持可解析的市场时间锚点；逻辑或视口锚点可继续使用原有移动操作')
    if(!tool||before.anchors.length<tool.minPoints||tool.maxPoints!==null&&before.anchors.length>tool.maxPoints||before.overlay.points.length!==before.anchors.length)throw Error('绘图几何与工具控制点数量不一致，整批未写入')
    before.anchors.forEach(validateAnchor)
    const projected=projectAnchors(before.anchors,context.bars,context.period)
    const anchors:DrawingAnchor[]=before.anchors.map((anchor,index)=>{
      if(anchor.kind!=='market')throw Error('精确平移需要市场时间锚点')
      const source=marketIndex(projected[index].timestamp!,context.bars)
      if(anchor.interpolation){marketIndex(anchor.timestamp,context.bars);marketIndex(anchor.interpolation.nextTimestamp,context.bars)}
      const value=delta.isZero()?anchor.value:new PriceDecimal(anchor.value).plus(delta).toNumber()
      if(!Number.isFinite(value))throw Error('平移后的价格超出有限数值范围')
      if(!bars)return {...structuredClone(anchor),value}
      const target=source+bars,left=Math.floor(target),fraction=target-left
      if(target<0||target>context.bars.length-1||!context.bars[left]||fraction&&!context.bars[left+1])throw Error('平移目标超出已加载历史或缺少相邻K线；整批未写入')
      return {kind:'market',timestamp:context.bars[left].timestamp,value,...(fraction?{interpolation:{nextTimestamp:context.bars[left+1].timestamp,fraction}}:{})}
    })
    const after=structuredClone(before);after.anchors=anchors;after.overlay.points=projectAnchors(anchors,context.bars,context.period)
    return after
  })
}
