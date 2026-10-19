import type {DrawingSnapshot} from './types'
import {isDrawingSnapshot} from '../persistence/v4'
export interface DrawingShareIdentity {
  namespace:string
  symbol:{market:string;exchange:string;ticker:string;priceCurrency:string}
  priceBasisKey:string
}
export interface SharedDrawingDocument {version:1;key:string;identity:DrawingShareIdentity;drawings:DrawingSnapshot[]}
export function drawingShareKey(identity:DrawingShareIdentity):string {
  if(!identity||typeof identity.namespace!=='string'||!identity.priceBasisKey||!identity.symbol||Object.values(identity.symbol).some(value=>typeof value!=='string'||!value))throw Error('共享绘图缺少明确的标的身份或价格口径')
  const {namespace,symbol,priceBasisKey}=identity
  return JSON.stringify([namespace,symbol.market,symbol.exchange,symbol.ticker,symbol.priceCurrency,priceBasisKey])
}
export function isSharedDrawingDocument(value:unknown):value is SharedDrawingDocument {
  if(!value||typeof value!=='object')return false
  const d=value as SharedDrawingDocument
  try{
    return d.version===1&&d.key===drawingShareKey(d.identity)&&Array.isArray(d.drawings)&&new Set(d.drawings.map(v=>v.logicalId)).size===d.drawings.length&&d.drawings.every(v=>isDrawingSnapshot(v)&&v.owner==='local'&&(!v.overlay.paneId||v.overlay.paneId==='candle_pane')&&!!v.anchors?.length&&v.anchors.every(a=>a.kind==='market'))
  }catch{return false}
}
