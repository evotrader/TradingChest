import type {Period,SymbolInfo} from '../types'
import {seriesIdentityKey,type SeriesIdentity} from '../datafeed/session'
import {jsonSafe} from '../persistence/v2'
import {replayTime} from '../replay/history'
import {WorkspaceReplayError,type ReplayBookmark,type WorkspaceReplayRecord} from '../replay/types'
import type {WorkspaceCell} from './types'

const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:Record<string,any>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k))
const text=(v:unknown,max=Infinity):v is string=>typeof v==='string'&&v.length<=max
const id=(v:unknown):v is string=>text(v)&&v.length>0
const period=(v:unknown):v is Period=>object(v)&&keys(v,['multiplier','timespan','text'])&&Number.isSafeInteger(v.multiplier)&&v.multiplier>0&&id(v.timespan)&&text(v.text)
const symbol=(v:unknown):v is SymbolInfo=>object(v)&&keys(v,['ticker','name','shortName','exchange','market','pricePrecision','tickSize','volumePrecision','priceCurrency','type','logo'])&&id(v.ticker)
  &&['name','shortName','exchange','market','priceCurrency','type','logo'].every(k=>v[k]===undefined||text(v[k]))
  &&['pricePrecision','volumePrecision'].every(k=>v[k]===undefined||Number.isInteger(v[k])&&v[k]>=0)
  &&(v.tickSize===undefined||Number.isFinite(v.tickSize)&&v.tickSize>0)
function identity(value:unknown):value is SeriesIdentity{
  if(!object(value)||!keys(value,['source','ticker','market','exchange','currency','multiplier','timespan','adjustment','sessionFilter','timezone']))return false
  try{seriesIdentityKey(value as SeriesIdentity);return true}catch{return false}
}
function matches(value:SeriesIdentity,s:SymbolInfo,p:Period){return value.ticker===s.ticker&&value.multiplier===p.multiplier&&value.timespan===p.timespan&&(!s.market||s.market===value.market)&&(!s.exchange||s.exchange===value.exchange)&&(!s.priceCurrency||s.priceCurrency===value.currency)}
export function isReplayBookmark(value:unknown,record:Pick<WorkspaceReplayRecord,'from'|'to'|'participants'>):value is ReplayBookmark{
  if(!object(value)||!keys(value,['id','timestamp','title','note','cellId','eventRef'])||!id(value.id)||!replayTime(value.timestamp)||value.timestamp<record.from||value.timestamp>=record.to||!text(value.title,120)||!text(value.note,4000))return false
  if(value.cellId!==undefined&&!record.participants.some(p=>p.cellId===value.cellId))return false
  const ref=value.eventRef
  return ref===undefined||value.cellId!==undefined&&object(ref)&&keys(ref,['layerId','eventId','timestamp'])&&id(ref.layerId)&&id(ref.eventId)&&replayTime(ref.timestamp)
}
export function isReplayRecord(value:unknown,cells:WorkspaceCell[],alreadyJsonSafe=false):value is WorkspaceReplayRecord{
  if(!object(value)||!alreadyJsonSafe&&!jsonSafe(value)||!keys(value,['version','mode','historyKind','from','to','cursor','driverCellId','speed','participants','notes','bookmarks']))return false
  const r=value as WorkspaceReplayRecord
  if(r.version!==1||!['live','paused'].includes(r.mode)||r.historyKind!=='current-history'||![r.from,r.to,r.cursor].every(replayTime)||r.from>=r.to||r.cursor<r.from||r.cursor>=r.to||![1,2,4,8,16].includes(r.speed)||!text(r.notes,20000))return false
  if(!Array.isArray(r.participants)||r.participants.length!==cells.length||new Set(r.participants.map(p=>p?.cellId)).size!==cells.length||!cells.some(c=>c.cellId===r.driverCellId))return false
  for(const p of r.participants){
    const cell=cells.find(c=>c.cellId===p?.cellId)
    if(!cell||!object(p)||!keys(p,['cellId','identity','basis','comparisons'])||!identity(p.identity)||!matches(p.identity,cell.symbol,cell.period)||p.basis!==undefined&&!text(p.basis)||!Array.isArray(p.comparisons))return false
    const tickers=new Set<string>()
    for(const c of p.comparisons){
      if(!object(c)||!keys(c,['symbol','period','identity','basis'])||!symbol(c.symbol)||!period(c.period)||!identity(c.identity)||!matches(c.identity,c.symbol,c.period)||c.period.multiplier!==cell.period.multiplier||c.period.timespan!==cell.period.timespan||c.basis!==undefined&&!text(c.basis)||c.symbol.ticker===cell.symbol.ticker||tickers.has(c.symbol.ticker))return false
      tickers.add(c.symbol.ticker)
    }
  }
  return Array.isArray(r.bookmarks)&&r.bookmarks.length<=1000&&r.bookmarks.every(b=>isReplayBookmark(b,r))&&new Set(r.bookmarks.map(b=>b.id)).size===r.bookmarks.length
}
export function assertReplayRecord(record:unknown,cells:WorkspaceCell[]):asserts record is WorkspaceReplayRecord{
  if(!isReplayRecord(record,cells))throw new WorkspaceReplayError('INVALID_HISTORY','复盘记录无效：请检查时间范围、参与图表、书签引用和文本长度')
}
