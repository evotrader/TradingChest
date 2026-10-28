import {marketIndex} from '../core/marketIndex'
import type {DrawingAlertAnchor} from './drawingTypes'

export function drawingAlertTimestamp(anchor:DrawingAlertAnchor):number {
 if(!anchor||anchor.kind!=='market'||!Number.isFinite(anchor.timestamp)||!Number.isFinite(anchor.value))throw Error('提醒需要有限的市场时间和价格锚点')
 const extra=anchor.interpolation
 if(extra&&(!Number.isFinite(extra.nextTimestamp)||extra.nextTimestamp<=anchor.timestamp||!Number.isFinite(extra.fraction)||extra.fraction<=0||extra.fraction>=1))throw Error('市场插值锚点无效')
 const timestamp=extra?anchor.timestamp+(extra.nextTimestamp-anchor.timestamp)*extra.fraction:anchor.timestamp
 if(!Number.isFinite(timestamp))throw Error('市场锚点时标无效')
 return timestamp
}
export function validateDrawingAlertAnchors(anchors:readonly DrawingAlertAnchor[],bars:readonly {timestamp:number}[]):void {
 if(!Array.isArray(anchors)||!anchors.length)throw Error('提醒缺少原始市场锚点')
 for(const anchor of anchors)marketIndex(drawingAlertTimestamp(anchor),bars)
}
