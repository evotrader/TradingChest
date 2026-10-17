import i18n from '../i18n'
import {registerIndicator,type Chart,type KLineData} from 'klinecharts'
import {visibleTimestamps} from '../workspace/viewportSync'
import {historySnapshot,validateBars} from '../core/engineDataLoader'
import type {HistoryResult,Period,SymbolInfo} from '../types'
import {commonBaseWithPrices,baseClose,priceMap} from './group'
import type {ComparisonDatafeed,ComparisonHandle,ComparisonState} from './types'

const comparisonOwners=new WeakSet<ComparisonDatafeed>()
let registered=false
function registerCompare(){
 if(registered)return
 registerIndicator<{pct?:number},unknown,{valueAt:(timestamp:number)=>number|undefined;base:number;cutoff:number;locale:string}>({name:'COMPARE',shortName:'收益',precision:2,createTooltipDataSource:({indicator,crosshair})=>{const locale=(indicator.extendData as {locale?:string}).locale??'zh-CN',value=indicator.result[crosshair.dataIndex??-1]?.pct;return {name:indicator.shortName,calcParamsText:'',features:[],legends:[{title:i18n('comparison_return',locale)+': ',value:value===undefined?i18n('comparison_no_return',locale):`${value.toFixed(2)}%`}]}},figures:[{key:'pct',title:'收益(%): ',type:'line'}],extendData:{valueAt:()=>undefined,base:Infinity,cutoff:-Infinity,locale:'zh-CN'},shouldUpdate:(previous,current)=>({calc:previous.extendData.valueAt!==current.extendData.valueAt||previous.extendData.base!==current.extendData.base||previous.extendData.cutoff!==current.extendData.cutoff,draw:true}),calc:(bars,indicator)=>bars.map(bar=>({pct:bar.timestamp>=indicator.extendData.base&&bar.timestamp<=indicator.extendData.cutoff?indicator.extendData.valueAt(bar.timestamp):undefined}))})
 registered=true
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const copyBars=(bars:KLineData[])=>bars.map(bar=>({...bar}))
const makeLookup=(prices:Map<number,number>,base:number,locale='zh-CN')=>{const first=prices.get(base);if(first===undefined||!Number.isFinite(first)||first===0)throw Error(i18n('comparison_lookup_invalid',locale));return (timestamp:number)=>{const price=prices.get(timestamp);return timestamp>=base&&price!==undefined?(price/first-1)*100:undefined}}
const abort=()=>new DOMException('比较请求已取消','AbortError')
function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const cleanup=()=>signal.removeEventListener('abort',cancel)
  const cancel=()=>{cleanup();reject(abort())}
  if(signal.aborted){cancel();return}
  signal.addEventListener('abort',cancel,{once:true})
  work.then(value=>{cleanup();resolve(value)},reason=>{cleanup();reject(reason)})
 })
}
type Member={handle:ComparisonHandle;feed:ComparisonDatafeed;bars:KLineData[];basis?:string;stream:number;subscribed:boolean;prices:Map<number,number>;returns?:(timestamp:number)=>number|undefined;returnBase?:number;returnPrices?:Map<number,number>}
interface Options {locale?:()=>string;chart:()=>Chart|null;symbol:()=>SymbolInfo;period:()=>Period;instanceId:string;onChange?:(state:ComparisonState)=>void}
export class ComparisonManager {
 private members=new Map<string,Member>()
 private pending=new Map<string,{symbol:SymbolInfo;controller:AbortController;feed:ComparisonDatafeed;released:boolean}>()
 private emitQueued=false
 private referenceFrom:number|undefined
 private generation=0
 private disposed=false
 private base:number|undefined
 private notice:(()=>string)|undefined
 private error:string|undefined
 private errorsByOwner=new Map<string,string>()
 private replay=false
 private restoring=false
 private cutoff=Infinity
 private fullMain:KLineData[]=[]
 private mainPrices=new Map<number,number>()
 private mainReturns:(timestamp:number)=>number|undefined=()=>undefined
 private mainReturnPrices:Map<number,number>|undefined
 private mainReturnBase:number|undefined
 private mainIndicator:string|undefined
 private axisId:string|undefined
 private resumes=new Set<AbortController>()
 constructor(private options:Options){}
 private checkBase(bars:KLineData[],timestamp:number){return baseClose(bars,timestamp,this.options.locale?.()??'zh-CN')}
 private commonBase(main:KLineData[],maps:Map<number,number>[],from?:number,to?:number){return commonBaseWithPrices(main,maps,from,to,this.options.locale?.()??'zh-CN')}
 private text(key:string){return i18n(key,this.options.locale?.()??'zh-CN')}
 refreshPresentation(){this.render();this.emit()}
 getState():ComparisonState{
  const last=this.options.chart()?.getDataList().at(-1),timestamp=last&&last.timestamp<=this.cutoff?last.timestamp:undefined
  const handles=[...this.members.values()].map(m=>{const value=timestamp===undefined?undefined:m.returns?.(timestamp);return {...clone(m.handle),plottedTimestamp:value===undefined?undefined:timestamp,plottedReturn:value}})
  const errors=[this.error,...[...this.errorsByOwner].map(([owner,message])=>`${owner==='main'?this.text('comparison_main'):this.members.get(owner)?.handle.symbol.ticker??owner}：${message}`)]
  return {handles,pending:[...this.pending].map(([id,p])=>({id,symbol:clone(p.symbol)})),baseTimestamp:this.base,notice:this.notice?.(),error:[...new Set(errors.filter(Boolean))].join('；')||undefined,replay:this.replay,restoring:this.restoring,mainTimestamp:timestamp,mainReturn:timestamp===undefined?undefined:this.mainReturns(timestamp)}
 }
 private emit(){if(this.disposed||this.emitQueued)return;this.emitQueued=true;queueMicrotask(()=>{this.emitQueued=false;if(!this.disposed)this.options.onChange?.(this.getState())})}
 private fail(reason:unknown,owner?:string){const message=reason instanceof Error?reason.message:String(reason);if(owner)this.errorsByOwner.set(owner,message);else this.error=message;this.emit()}
 private chart(){const c=this.options.chart();if(!c)throw Error(this.text('comparison_error_1'));return c}
 private main(){return this.replay?this.fullMain:this.chart().getDataList()}
 private key(symbol:SymbolInfo){const p=this.options.period();return `${this.options.instanceId}|${symbol.ticker}|${p.multiplier}:${p.timespan}`}
 private valid(){if(this.disposed)throw abort()}
 async add(symbol:SymbolInfo,feed:ComparisonDatafeed):Promise<ComparisonHandle>{
  this.valid();const id=this.key(symbol)
  if(comparisonOwners.has(feed))throw Error(this.text('comparison_error_2'))
  if(symbol.ticker===this.options.symbol().ticker||this.members.has(id)||this.pending.has(id)){feed.dispose?.();throw Error(this.text('comparison_error_3'))}
  if(this.restoring){feed.dispose?.();throw Error(this.text('comparison_error_4'))}
  if(this.replay){feed.dispose?.();throw Error(this.text('comparison_error_5'))}
  if([...this.members.values()].some(m=>m.feed===feed)||[...this.pending.values()].some(m=>m.feed===feed))throw Error(this.text('comparison_error_6'))
  const main=this.main();if(!main.length){feed.dispose?.();throw Error(this.text('comparison_error_7'))}
  const controller=new AbortController(),epoch=this.generation,period=clone(this.options.period())
  const pending={symbol,controller,feed,released:false};comparisonOwners.add(feed);this.pending.set(id,pending);this.error=undefined;this.emit()
  try{
   const snapshot=historySnapshot(await abortable(feed.getHistoryKLineData(symbol,period,this.referenceFrom??main[0].timestamp,main.at(-1)!.timestamp,{signal:controller.signal,reason:'initial'}),controller.signal))
   if(this.disposed||epoch!==this.generation||controller.signal.aborted||this.pending.get(id)?.controller!==controller)throw abort()
   const current=this.main(),prices=priceMap(snapshot.bars),base=this.commonBase(current,[...[...this.members.values()].map(m=>m.prices),prices],this.referenceFrom??main[0].timestamp,main.at(-1)!.timestamp)
   const member:Member={handle:{id,symbol:clone(symbol),period,indicatorId:'',readAt:Date.now(),sourceTimestamp:snapshot.bars.at(-1)?.timestamp,basis:snapshot.basis,mode:feed.mode??(feed.subscribeSnapshots?'http-snapshot':'stream')},feed,bars:copyBars(snapshot.bars),basis:snapshot.basis,stream:0,subscribed:false,prices}
   const oldBase=this.base,oldNotice=this.notice;if(!this.members.size)this.mainPrices=priceMap(current);this.members.set(id,member);this.base=base;this.notice=()=>`${this.text('comparison_recalculated')}${new Date(base).toISOString()}`
   try{this.render();this.start(member)}catch(reason){if(member.handle.indicatorId)this.chart().removeIndicator({id:member.handle.indicatorId});this.members.delete(id);this.base=oldBase;this.notice=oldNotice;if(this.members.size)this.render();else this.clearIndicators();throw reason}
   this.referenceFrom??=main[0].timestamp
   return clone(member.handle)
  }catch(reason){this.releasePending(pending,period);if(!(reason instanceof DOMException&&reason.name==='AbortError'))this.fail(Error(`${symbol.ticker}：${reason instanceof Error?reason.message:String(reason)}`));throw reason}
  finally{if(this.pending.get(id)?.controller===controller)this.pending.delete(id);this.emit()}
 }
 private releasePending(p:{symbol:SymbolInfo;feed:ComparisonDatafeed;released:boolean},period:Period){if(p.released)return;p.released=true;comparisonOwners.delete(p.feed);p.feed.unsubscribe(p.symbol,period);p.feed.dispose?.()}
 cancel(id:string){const p=this.pending.get(id);if(!p)return;p.controller.abort();this.pending.delete(id);this.releasePending(p,this.options.period());this.emit()}
 remove(id:string){
  this.cancel(id);const m=this.members.get(id);if(!m)return
  this.stop(m);comparisonOwners.delete(m.feed);m.feed.dispose?.();this.chart().removeIndicator({id:m.handle.indicatorId});this.members.delete(id);this.errorsByOwner.delete(id)
  for(const controller of this.resumes)controller.abort()
  if(!this.members.size){this.clearIndicators();this.base=undefined;this.referenceFrom=undefined;this.notice=undefined;this.error=undefined}
  else {try{this.rebase('comparison_removed_rebase')}catch(reason){this.notice=()=>this.text('comparison_removed_retained');this.fail(reason);this.render()}}
  this.emit()
 }
 async resetRange(){this.valid();if(this.replay)throw Error(this.text('comparison_error_8'));const window=visibleTimestamps(this.chart());if(!window)throw Error(this.text('comparison_error_9'));await this.fetchGroup(true,window)}
 async retry(){this.valid();await this.fetchGroup(false)}
 private rebase(message:string){if(!this.members.size)return;const main=this.main();this.base=this.commonBase(main,[...this.members.values()].map(m=>m.prices),this.referenceFrom);this.notice=()=>`${this.text(message)} · ${this.text('comparison_common_base')}: ${new Date(this.base!).toISOString()}`;this.error=undefined;this.render()}
 private start(m:Member,preparing=false){
  if((this.replay&&!preparing)||this.restoring||this.disposed||m.subscribed||this.members.get(m.handle.id)!==m)return
  const stream=++m.stream;m.subscribed=true
  const active=()=>!this.disposed&&!this.replay&&m.stream===stream&&this.members.get(m.handle.id)===m
  try {
  if(m.feed.subscribeSnapshots)m.feed.subscribeSnapshots(m.handle.symbol,m.handle.period,value=>{if(active())this.update(m,value)},reason=>{if(active())this.fail(reason,m.handle.id)})
  else m.feed.subscribe(m.handle.symbol,m.handle.period,bar=>{if(active())this.updateBar(m,bar)})
  } catch(error) {this.stop(m);throw error}
 }
 private stop(m:Member){++m.stream;if(m.subscribed){m.subscribed=false;m.feed.unsubscribe(m.handle.symbol,m.handle.period)}}
 private cancelReads(){for(const controller of this.resumes)controller.abort();this.resumes.clear();this.restoring=false}
 private updateBar(m:Member,bar:KLineData){
  try{
   validateBars([bar]);if(bar.timestamp===this.base&&bar.close===0)throw Error(this.text('comparison_error_10'))
   let low=0,high=m.bars.length;while(low<high){const mid=(low+high)>>>1;if(m.bars[mid].timestamp<bar.timestamp)low=mid+1;else high=mid}
   const old=m.bars[low],revised=bar.timestamp===this.base&&old?.close!==bar.close
   if(old?.timestamp===bar.timestamp)m.bars[low]={...bar};else m.bars.splice(low,0,{...bar})
   if(!m.prices.has(bar.timestamp)||m.prices.get(bar.timestamp)!==bar.close){m.prices.set(bar.timestamp,bar.close);m.returnPrices=undefined}
   m.handle={...m.handle,readAt:Date.now(),sourceTimestamp:m.bars.at(-1)?.timestamp};this.errorsByOwner.delete(m.handle.id)
   if(revised)this.notice=()=>`${m.handle.symbol.ticker}${this.text('comparison_member_revised')}${new Date(this.base!).toISOString()}`
   this.render();this.emit()
  }catch(reason){this.fail(reason,m.handle.id)}
 }
 private mergeSnapshot(m:Member,snapshot:{bars:KLineData[];basis?:string}){
  if(!snapshot.bars.length)throw Error(`${m.handle.symbol.ticker}: ${this.text('comparison_empty_member')}`)
  const incoming=new Map(snapshot.bars.map(bar=>[bar.timestamp,bar]))
  if(snapshot.basis!==m.basis){if(m.bars.some(bar=>!incoming.has(bar.timestamp)))throw Error(this.text('comparison_error_11'));return snapshot}
  return {...snapshot,bars:[...new Map([...m.bars,...snapshot.bars].map(bar=>[bar.timestamp,bar])).values()].sort((a,b)=>a.timestamp-b.timestamp)}
 }
 private update(m:Member,value:HistoryResult){
  try{
   const snapshot=this.mergeSnapshot(m,historySnapshot(value))
   const base=this.base!,old=m.bars.find(bar=>bar.timestamp===base)?.close,actual=snapshot.bars.find(bar=>bar.timestamp===base)?.close
   this.checkBase(snapshot.bars,base)
   m.bars=copyBars(snapshot.bars);m.prices=priceMap(m.bars);m.basis=snapshot.basis;m.handle={...m.handle,readAt:Date.now(),sourceTimestamp:snapshot.bars.at(-1)?.timestamp,basis:snapshot.basis};this.errorsByOwner.delete(m.handle.id)
   if(old!==actual)this.notice=()=>`${m.handle.symbol.ticker}${this.text('comparison_member_revised')}${new Date(base).toISOString()}`
   this.render();this.emit()
  }catch(reason){this.fail(reason,m.handle.id)}
 }
 mainChanged(){
  if(this.disposed||!this.members.size)return
  try{
   if(!this.replay){const next=this.chart().getDataList();validateBars(next);const old=this.mainPrices.get(this.base!),current=next.find(b=>b.timestamp===this.base)?.close;this.checkBase(next,this.base!);this.mainPrices=priceMap(next);this.errorsByOwner.delete('main');if(old!==undefined&&old!==current)this.notice=()=>`${this.text('comparison_main_revised')}${new Date(this.base!).toISOString()}`}
   this.render();this.emit()
  }catch(reason){this.fail(reason,'main')}
 }
 enterReplay(cutoff:number){
  this.valid();const source=this.chart().getDataList();if(this.members.size)this.checkBase(source,this.base!);this.cancelReads();this.fullMain=copyBars(source);this.mainPrices=priceMap(this.fullMain);this.replay=true;this.cutoff=cutoff
  for(const id of [...this.pending.keys()])this.cancel(id)
  for(const m of this.members.values())this.stop(m)
  this.render();this.emit()
 }
 seek(cutoff:number){if(!this.replay)return;this.cancelReads();this.cutoff=cutoff;this.render();this.emit()}
 async prepareResume(){if(this.replay)await this.fetchGroup(false)}
 private async fetchGroup(rebase:boolean,window?:{from:number;to:number}){
  if(!this.members.size)return
  if(this.restoring)throw Error(this.text('comparison_error_12'))
  const members=[...this.members.values()],epoch=this.generation,controller=new AbortController();this.resumes.add(controller);this.restoring=true
  for(const m of members)this.stop(m);this.emit()
  try{
   const main=this.main(),from=main.length?Math.min(main[0].timestamp,...members.map(m=>m.bars[0]?.timestamp??Infinity)):undefined,to=Math.max(main.at(-1)?.timestamp??0,Date.now())
   if(from===undefined)throw Error(this.text('comparison_error_13'))
   const snapshots=await abortable(Promise.all(members.map(async m=>{
    try{
      const result=await m.feed.getHistoryKLineData(m.handle.symbol,m.handle.period,from,to,{signal:controller.signal,reason:'resume'})
      if(this.disposed||epoch!==this.generation||controller.signal.aborted)throw abort()
      const snapshot=this.mergeSnapshot(m,historySnapshot(result));this.errorsByOwner.delete(m.handle.id);return snapshot
    }catch(reason){
      if(!controller.signal.aborted&&epoch===this.generation){const message=reason instanceof Error?reason.message:String(reason);this.errorsByOwner.set(m.handle.id,message);throw Error(`${m.handle.symbol.ticker}：${message}`)}
      throw reason
    }
   })),controller.signal)
   if(this.disposed||epoch!==this.generation||controller.signal.aborted||members.length!==this.members.size||members.some(m=>this.members.get(m.handle.id)!==m))throw abort()
   const base=rebase?this.commonBase(this.main(),snapshots.map(s=>priceMap(s.bars)),window?.from,window?.to):this.base!
   for(const snapshot of snapshots)this.checkBase(snapshot.bars,base)
   let revised=false
   for(let i=0;i<members.length;i++){const old=members[i].bars.find(b=>b.timestamp===base)?.close,current=snapshots[i].bars.find(b=>b.timestamp===base)?.close;if(old!==current)revised=true;members[i].bars=copyBars(snapshots[i].bars);members[i].prices=priceMap(members[i].bars);members[i].basis=snapshots[i].basis;members[i].handle={...members[i].handle,readAt:Date.now(),sourceTimestamp:snapshots[i].bars.at(-1)?.timestamp,basis:snapshots[i].basis}}
   this.base=base;if(rebase)this.referenceFrom=window?.from
   if(rebase||revised)this.notice=()=>`${this.text(rebase?'comparison_range_reset':'comparison_base_revised')}: ${new Date(base).toISOString()}`
   this.error=undefined;for(const m of members)this.errorsByOwner.delete(m.handle.id);this.render();this.emit()
  }catch(reason){if(!controller.signal.aborted&&epoch===this.generation&&!this.disposed)this.fail(reason);throw reason}finally{controller.abort();const current=this.resumes.delete(controller);if(current&&epoch===this.generation&&!this.disposed){this.restoring=false;if(!this.replay)for(const m of this.members.values())this.start(m);this.emit()}}
 }
 leaveReplay(){
  if(!this.replay)return
  const next=this.chart().getDataList();if(this.members.size)this.checkBase(next,this.base!)
  const previous={cutoff:this.cutoff,fullMain:this.fullMain,mainPrices:this.mainPrices,notice:this.notice,mainReturnPrices:this.mainReturnPrices,mainReturnBase:this.mainReturnBase,mainReturns:this.mainReturns}
  const old=this.mainPrices.get(this.base!),current=next.find(b=>b.timestamp===this.base)?.close
  try {
    // Subscriptions may fail after partially attaching. Keep replay/cutoff until all are prepared.
    for(const m of this.members.values())this.start(m,true)
    this.replay=false;this.cutoff=Infinity;this.fullMain=copyBars(next);this.mainPrices=priceMap(next)
    if(old!==current&&this.base!==undefined)this.notice=()=>`${this.text('comparison_main_revised')}${new Date(this.base!).toISOString()}`
    this.render();this.errorsByOwner.delete('main');this.emit()
  } catch(error) {
    for(const m of this.members.values())this.stop(m)
    this.replay=true;Object.assign(this,previous)
    this.render();this.emit();throw error
  }
 }


 private render(){
  if(!this.members.size||this.base===undefined)return
  const chart=this.chart();registerCompare()
  if(!this.axisId){this.axisId=chart.createYAxis({id:`${this.options.instanceId}_returns`,paneId:'candle_pane',name:'normal',position:'left',createTicks:({defaultTicks})=>defaultTicks.map(t=>({...t,text:`${Number(t.value).toFixed(2)}%`}))})??undefined;if(!this.axisId)throw Error(this.text('comparison_error_14'))}
  const apply=(id:string|undefined,desiredId:string,label:string,valueAt:(timestamp:number)=>number|undefined,color:string)=>{
   const extendData={valueAt,base:this.base!,cutoff:this.cutoff,locale:this.options.locale?.()??'zh-CN'}
   const current=id?chart.getIndicators({id})[0]:undefined
   if(current){const previous=current.extendData as typeof extendData;if(previous.valueAt!==valueAt||previous.base!==this.base||previous.cutoff!==this.cutoff||previous.locale!==extendData.locale||current.shortName!==label)chart.overrideIndicator({id,name:'COMPARE',shortName:label,extendData});return id!}
   const actual=chart.createIndicator({id:desiredId,name:'COMPARE',paneId:'candle_pane',yAxisId:this.axisId,shortName:label,extendData,styles:{lines:[{color,size:1}]}},true)
   if(!actual)throw Error(this.text('comparison_error_15'));return actual
  }
  if(this.mainReturnPrices!==this.mainPrices||this.mainReturnBase!==this.base){this.mainReturns=makeLookup(this.mainPrices,this.base,this.options.locale?.()??'zh-CN');this.mainReturnPrices=this.mainPrices;this.mainReturnBase=this.base}
  this.mainIndicator=apply(this.mainIndicator,`${this.options.instanceId}_main_returns`,`${this.text('comparison_main_return')} ${this.options.symbol().ticker}`,this.mainReturns,'#facc15')
  const colors=['#38bdf8','#a78bfa','#fb7185','#4ade80'];let index=0
  for(const m of this.members.values()){if(m.returnPrices!==m.prices||m.returnBase!==this.base){m.returns=makeLookup(m.prices,this.base,this.options.locale?.()??'zh-CN');m.returnPrices=m.prices;m.returnBase=this.base}m.handle.indicatorId=apply(m.handle.indicatorId||undefined,m.handle.id,`${this.text('comparison_member_return')} ${m.handle.symbol.ticker}`,m.returns!,colors[index++%colors.length])}
 }
 private clearIndicators(){const chart=this.options.chart();if(this.mainIndicator)chart?.removeIndicator({id:this.mainIndicator});if(this.axisId)chart?.removeYAxis({id:this.axisId,paneId:'candle_pane'});this.mainIndicator=undefined;this.axisId=undefined;this.mainReturns=()=>undefined;this.mainReturnBase=undefined;this.mainReturnPrices=undefined;this.mainPrices.clear();this.errorsByOwner.delete('main')}
 clear(){++this.generation;for(const p of this.pending.values()){p.controller.abort();this.releasePending(p,this.options.period())}this.pending.clear();for(const m of this.members.values()){this.stop(m);comparisonOwners.delete(m.feed);m.feed.dispose?.();this.options.chart()?.removeIndicator({id:m.handle.indicatorId})}this.members.clear();for(const c of this.resumes)c.abort();this.clearIndicators();this.base=undefined;this.referenceFrom=undefined;this.notice=undefined;this.error=undefined;this.errorsByOwner.clear();this.replay=false;this.restoring=false;this.cutoff=Infinity;this.fullMain=[];this.emit()}
 dispose(){if(this.disposed)return;this.disposed=true;this.clear()}
}
