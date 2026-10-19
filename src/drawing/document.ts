import type {DrawingSnapshot} from './types'
import {isDrawingSnapshot} from '../persistence/v4'
export interface DrawingShareIdentity {
  namespace:string
  symbol:{market:string;exchange:string;ticker:string;priceCurrency:string}
  priceBasisKey:string
}
export interface DrawingTransferRecovery {id:string;scope:'chart'|'workspace';drawings:DrawingSnapshot[];originals:DrawingSnapshot[]}
export interface SharedDrawingDocument {transfers?:DrawingTransferRecovery[];version:1;key:string;identity:DrawingShareIdentity;drawings:DrawingSnapshot[]}
export function drawingShareKey(identity:DrawingShareIdentity):string {
  if(!identity||typeof identity.namespace!=='string'||!identity.namespace||typeof identity.priceBasisKey!=='string'||!identity.priceBasisKey||!identity.symbol||['market','exchange','ticker','priceCurrency'].some(key=>typeof identity.symbol[key as keyof typeof identity.symbol]!=='string'||!identity.symbol[key as keyof typeof identity.symbol]))throw Error('共享绘图缺少明确的标的身份或价格口径')
  const {namespace,symbol,priceBasisKey}=identity
  return JSON.stringify([namespace,symbol.market,symbol.exchange,symbol.ticker,symbol.priceCurrency,priceBasisKey])
}
export function isSharedDrawingDocument(value:unknown):value is SharedDrawingDocument {
  if(!value||typeof value!=='object')return false
  const d=value as SharedDrawingDocument
  try{
    return d.version===1&&d.key===drawingShareKey(d.identity)&&(d.transfers===undefined||Array.isArray(d.transfers)&&new Set(d.transfers.map(r=>r.id)).size===d.transfers.length&&d.transfers.every(r=>typeof r.id==='string'&&!!r.id&&['chart','workspace'].includes(r.scope)&&Array.isArray(r.drawings)&&r.drawings.length>0&&new Set(r.drawings.map(v=>v.logicalId)).size===r.drawings.length&&Array.isArray(r.originals)&&r.originals.length===r.drawings.length&&r.originals.every((v,i)=>isDrawingSnapshot(v)&&v.yAxisId===undefined&&v.owner==='local'&&v.logicalId===r.drawings[i].logicalId&&v.presentation?.scope==='host')&&r.drawings.every(v=>isDrawingSnapshot(v)&&v.owner==='local'&&(!v.overlay.paneId||v.overlay.paneId==='candle_pane')&&!!v.anchors?.length&&v.anchors.every(a=>a.kind==='market')&&v.presentation?.scope===r.scope)))&&Array.isArray(d.drawings)&&new Set(d.drawings.map(v=>v.logicalId)).size===d.drawings.length&&d.drawings.every(v=>isDrawingSnapshot(v)&&v.yAxisId===undefined&&v.owner==='local'&&(!v.overlay.paneId||v.overlay.paneId==='candle_pane')&&!!v.anchors?.length&&v.anchors.every(a=>a.kind==='market'))
  }catch{return false}
}
