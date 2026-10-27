import type {KLineData,Point} from 'klinecharts'
import type {Period} from '../types'
import type {DrawingAnchor,DrawingIntervalFilter} from './types'

const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)
export function validateAnchor(anchor:DrawingAnchor):void {
  if(!anchor||typeof anchor!=='object')throw Error('绘图锚点无效')
  if(anchor.kind==='market'&&finite(anchor.timestamp)&&finite(anchor.value)&&(!anchor.interpolation||(finite(anchor.interpolation.nextTimestamp)&&anchor.interpolation.nextTimestamp>anchor.timestamp&&finite(anchor.interpolation.fraction)&&anchor.interpolation.fraction>0&&anchor.interpolation.fraction<1)))return
  if(anchor.kind==='logical'&&finite(anchor.referenceTimestamp)&&finite(anchor.offsetBars)&&finite(anchor.value)&&anchor.period&&finite(anchor.period.multiplier)&&anchor.period.multiplier>0&&typeof anchor.period.timespan==='string')return
  if(anchor.kind==='viewport'&&finite(anchor.x)&&finite(anchor.y)&&anchor.x>=0&&anchor.x<=1&&anchor.y>=0&&anchor.y<=1)return
  throw Error('绘图锚点坐标或周期无效')
}
export function anchorsFromPoints(points:Partial<Point>[],bars:KLineData[],period:Period,source:'migration'|'interaction'='migration'):DrawingAnchor[] {
  return points.map(point=>{
    if(!finite(point.value))throw Error('绘图缺少有效数值')
    if(source==='interaction'&&finite(point.dataIndex)&&(point.dataIndex<0||point.dataIndex>bars.length-1)){
      if(!bars.length)throw Error('绘图参考历史尚未加载，请加载后重试')
      const index=point.dataIndex<0?0:bars.length-1
      return {kind:'logical',referenceTimestamp:bars[index].timestamp,offsetBars:point.dataIndex-index,period:{multiplier:period.multiplier,timespan:period.timespan},value:point.value}
    }
    if(source==='interaction'&&finite(point.dataIndex)&&!Number.isInteger(point.dataIndex)&&point.dataIndex>=0&&point.dataIndex<bars.length-1){
      const index=Math.floor(point.dataIndex)
      return {kind:'market',timestamp:bars[index].timestamp,value:point.value,interpolation:{nextTimestamp:bars[index+1].timestamp,fraction:point.dataIndex-index}}
    }
    if(finite(point.timestamp))return {kind:'market',timestamp:point.timestamp,value:point.value}
    if(!finite(point.dataIndex)||!bars.length)throw Error('无法解析旧绘图下标，请加载原始历史后重试；原件已保留')
    const index=Math.max(0,Math.min(bars.length-1,Math.floor(point.dataIndex))),offset=point.dataIndex-index
    return offset===0?{kind:'market',timestamp:bars[index].timestamp,value:point.value}:{kind:'logical',referenceTimestamp:bars[index].timestamp,offsetBars:offset,period:{multiplier:period.multiplier,timespan:period.timespan},value:point.value}
  })
}
export function projectAnchors(anchors:DrawingAnchor[],bars:readonly KLineData[],period:Period,viewport?:(x:number,y:number)=>Partial<Point>):Partial<Point>[] {
  return anchors.map(anchor=>{
    validateAnchor(anchor)
    if(anchor.kind==='viewport'){if(!viewport)throw Error('视口尺寸尚未就绪');return viewport(anchor.x,anchor.y)}
    if(anchor.kind==='market'){
      // An interpolated engine timestamp is a rendering projection, never a stored market timestamp.
      return {timestamp:anchor.interpolation?anchor.timestamp+(anchor.interpolation.nextTimestamp-anchor.timestamp)*anchor.interpolation.fraction:anchor.timestamp,value:anchor.value}
    }
    if(anchor.period.multiplier!==period.multiplier||anchor.period.timespan!==period.timespan)throw Error('此绘图使用原周期的后续根数，当前周期不显示')
    const index=bars.findIndex(b=>b.timestamp===anchor.referenceTimestamp)
    if(index<0)throw Error('绘图参考历史尚未加载，请加载后重试')
    return {dataIndex:index+anchor.offsetBars,value:anchor.value}
  })
}
/** Calendar units are ordered semantically; months are never approximated as milliseconds. */
export function intervalVisible(filter:DrawingIntervalFilter|undefined,current:Period):boolean {
  if(!filter||filter.kind==='all')return true
  const equal=(p:Pick<Period,'multiplier'|'timespan'>)=>p.multiplier===current.multiplier&&p.timespan===current.timespan
  if(filter.kind==='list')return filter.periods.some(equal)
  if(filter.kind==='current')return equal(filter.period)
  const rank=['second','minute','hour','day','week','month','year']
  const a=rank.indexOf(current.timespan),b=rank.indexOf(filter.period.timespan)
  if(a<0||b<0)return false
  const fixed=[1,60,3600,86400,604800]
  // Calendar months/years form a separate semantic family; no guessed month length.
  const comparison=a<5&&b<5?current.multiplier*fixed[a]-filter.period.multiplier*fixed[b]
    :a>=5&&b>=5?current.multiplier*(a===6?12:1)-filter.period.multiplier*(b===6?12:1):a-b
  return filter.kind==='higher'?comparison>=0:comparison<=0
}
