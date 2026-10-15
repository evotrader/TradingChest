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
 registerIndicator<{pct?:number},unknown,{valueAt:(timestamp:number)=>number|undefined;base:number;cutoff:number}>({name:'COMPARE',shortName:'收益',precision:2,createTooltipDataSource:({indicator,crosshair})=>{const value=indicator.result[crosshair.dataIndex??-1]?.pct;return {name:indicator.shortName,calcParamsText:'',features:[],legends:[{title:'收益：',value:value===undefined?'无可比收益':`${value.toFixed(2)}%`}]}},figures:[{key:'pct',title:'收益(%): ',type:'line'}],extendData:{valueAt:()=>undefined,base:Infinity,cutoff:-Infinity},shouldUpdate:(previous,current)=>({calc:previous.extendData.valueAt!==current.extendData.valueAt||previous.extendData.base!==current.extendData.base||previous.extendData.cutoff!==current.extendData.cutoff,draw:true}),calc:(bars,indicator)=>bars.map(bar=>({pct:bar.timestamp>=indicator.extendData.base&&bar.timestamp<=indicator.extendData.cutoff?indicator.extendData.valueAt(bar.timestamp):undefined}))})
 registered=true
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const copyBars=(bars:KLineData[])=>bars.map(bar=>({...bar}))
const makeLookup=(prices:Map<number,number>,base:number)=>{const first=prices.get(base);if(first===undefined||!Number.isFinite(first)||first===0)throw Error('固定基准缺失或价格无效，请重读行情');return (timestamp:number)=>{const price=prices.get(timestamp);return timestamp>=base&&price!==undefined?(price/first-1)*100:undefined}}
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
interface Options {chart:()=>Chart|null;symbol:()=>SymbolInfo;period:()=>Period;instanceId:string;onChange?:(state:ComparisonState)=>void}
export class ComparisonManager {
 private members=new Map<string,Member>()
 private pending=new Map<string,{symbol:SymbolInfo;controller:AbortController;feed:ComparisonDatafeed;released:boolean}>()
 private emitQueued=false
 private referenceFrom:number|undefined
 private generation=0
 private disposed=false
 private base:number|undefined
 private notice:string|undefined
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
 getState():ComparisonState{
  const last=this.options.chart()?.getDataList().at(-1),timestamp=last&&last.timestamp<=this.cutoff?last.timestamp:undefined
  const handles=[...this.members.values()].map(m=>{const value=timestamp===undefined?undefined:m.returns?.(timestamp);return {...clone(m.handle),plottedTimestamp:value===undefined?undefined:timestamp,plottedReturn:value}})
  const errors=[this.error,...[...this.errorsByOwner].map(([owner,message])=>`${owner==='main'?'主图':this.members.get(owner)?.handle.symbol.ticker??owner}：${message}`)]
  return {handles,pending:[...this.pending].map(([id,p])=>({id,symbol:clone(p.symbol)})),baseTimestamp:this.base,notice:this.notice,error:[...new Set(errors.filter(Boolean))].join('；')||undefined,replay:this.replay,restoring:this.restoring,mainTimestamp:timestamp,mainReturn:timestamp===undefined?undefined:this.mainReturns(timestamp)}
 }
 private emit(){if(this.disposed||this.emitQueued)return;this.emitQueued=true;queueMicrotask(()=>{this.emitQueued=false;if(!this.disposed)this.options.onChange?.(this.getState())})}
 private fail(reason:unknown,owner?:string){const message=reason instanceof Error?reason.message:String(reason);if(owner)this.errorsByOwner.set(owner,message);else this.error=message;this.emit()}
 private chart(){const c=this.options.chart();if(!c)throw Error('主图尚未就绪');return c}
 private main(){return this.replay?this.fullMain:this.chart().getDataList()}
 private key(symbol:SymbolInfo){const p=this.options.period();return `${this.options.instanceId}|${symbol.ticker}|${p.multiplier}:${p.timespan}`}
 private valid(){if(this.disposed)throw abort()}
 async add(symbol:SymbolInfo,feed:ComparisonDatafeed):Promise<ComparisonHandle>{
  this.valid();const id=this.key(symbol)
  if(comparisonOwners.has(feed))throw Error('每条比较必须使用独立的数据通道，已有通道保持不变')
  if(symbol.ticker===this.options.symbol().ticker||this.members.has(id)||this.pending.has(id)){feed.dispose?.();throw Error('该标的已在当前比较组中')}
  if(this.restoring){feed.dispose?.();throw Error('比较正在重读，请稍后添加')}
  if(this.replay){feed.dispose?.();throw Error('回放中请先退出，再添加比较标的')}
  if([...this.members.values()].some(m=>m.feed===feed)||[...this.pending.values()].some(m=>m.feed===feed))throw Error('每条比较必须使用独立的数据通道')
  const main=this.main();if(!main.length){feed.dispose?.();throw Error('主图没有真实行情，无法添加比较')}
  const controller=new AbortController(),epoch=this.generation,period=clone(this.options.period())
  const pending={symbol,controller,feed,released:false};comparisonOwners.add(feed);this.pending.set(id,pending);this.error=undefined;this.emit()
  try{
   const snapshot=historySnapshot(await abortable(feed.getHistoryKLineData(symbol,period,this.referenceFrom??main[0].timestamp,main.at(-1)!.timestamp,{signal:controller.signal,reason:'initial'}),controller.signal))
   if(this.disposed||epoch!==this.generation||controller.signal.aborted||this.pending.get(id)?.controller!==controller)throw abort()
   const current=this.main(),prices=priceMap(snapshot.bars),base=commonBaseWithPrices(current,[...[...this.members.values()].map(m=>m.prices),prices],this.referenceFrom??main[0].timestamp,main.at(-1)!.timestamp)
   const member:Member={handle:{id,symbol:clone(symbol),period,indicatorId:'',readAt:Date.now(),sourceTimestamp:snapshot.bars.at(-1)?.timestamp,basis:snapshot.basis,mode:feed.mode??(feed.subscribeSnapshots?'http-snapshot':'stream')},feed,bars:copyBars(snapshot.bars),basis:snapshot.basis,stream:0,subscribed:false,prices}
   const oldBase=this.base,oldNotice=this.notice;if(!this.members.size)this.mainPrices=priceMap(current);this.members.set(id,member);this.base=base;this.notice=`比较组已重算，共同基准：${new Date(base).toISOString()}`
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
  else {try{this.rebase('移除成员，比较组已重算')}catch(reason){this.notice='成员已移除，仍保留此前已确认的共同基准';this.fail(reason);this.render()}}
  this.emit()
 }
 async resetRange(){this.valid();if(this.replay)throw Error('回放中不能重设比较区间');const window=visibleTimestamps(this.chart());if(!window)throw Error('当前视窗没有真实行情，不能重设比较区间');await this.fetchGroup(true,window)}
 async retry(){this.valid();await this.fetchGroup(false)}
 private rebase(message:string){if(!this.members.size)return;const main=this.main();this.base=commonBaseWithPrices(main,[...this.members.values()].map(m=>m.prices),this.referenceFrom);this.notice=`${message}，共同基准：${new Date(this.base).toISOString()}`;this.error=undefined;this.render()}
 private start(m:Member){
  if(this.replay||this.restoring||this.disposed||m.subscribed||this.members.get(m.handle.id)!==m)return
  const stream=++m.stream;m.subscribed=true
  const active=()=>!this.disposed&&!this.replay&&m.stream===stream&&this.members.get(m.handle.id)===m
  if(m.feed.subscribeSnapshots)m.feed.subscribeSnapshots(m.handle.symbol,m.handle.period,value=>{if(active())this.update(m,value)},reason=>{if(active())this.fail(reason,m.handle.id)})
  else m.feed.subscribe(m.handle.symbol,m.handle.period,bar=>{if(active())this.updateBar(m,bar)})
 }
 private stop(m:Member){++m.stream;if(m.subscribed){m.subscribed=false;m.feed.unsubscribe(m.handle.symbol,m.handle.period)}}
 private cancelReads(){for(const controller of this.resumes)controller.abort();this.resumes.clear();this.restoring=false}
 private updateBar(m:Member,bar:KLineData){
  try{
   validateBars([bar]);if(bar.timestamp===this.base&&bar.close===0)throw Error('基准价格为零，保留已确认比较；请重读行情')
   let low=0,high=m.bars.length;while(low<high){const mid=(low+high)>>>1;if(m.bars[mid].timestamp<bar.timestamp)low=mid+1;else high=mid}
   const old=m.bars[low],revised=bar.timestamp===this.base&&old?.close!==bar.close
   if(old?.timestamp===bar.timestamp)m.bars[low]={...bar};else m.bars.splice(low,0,{...bar})
   if(!m.prices.has(bar.timestamp)||m.prices.get(bar.timestamp)!==bar.close){m.prices.set(bar.timestamp,bar.close);m.returnPrices=undefined}
   m.handle={...m.handle,readAt:Date.now(),sourceTimestamp:m.bars.at(-1)?.timestamp};this.errorsByOwner.delete(m.handle.id)
   if(revised)this.notice=`${m.handle.symbol.ticker} 的基准价格被修订，已统一重算：${new Date(this.base!).toISOString()}`
   this.render();this.emit()
  }catch(reason){this.fail(reason,m.handle.id)}
 }
 private mergeSnapshot(m:Member,snapshot:{bars:KLineData[];basis?:string}){
  if(!snapshot.bars.length)throw Error(`${m.handle.symbol.ticker} 返回空行情，保留已确认比较`)
  const incoming=new Map(snapshot.bars.map(bar=>[bar.timestamp,bar]))
  if(snapshot.basis!==m.basis){if(m.bars.some(bar=>!incoming.has(bar.timestamp)))throw Error('新复权口径没有覆盖已加载比较历史，保留确认图形；请重试');return snapshot}
  return {...snapshot,bars:[...new Map([...m.bars,...snapshot.bars].map(bar=>[bar.timestamp,bar])).values()].sort((a,b)=>a.timestamp-b.timestamp)}
 }
 private update(m:Member,value:HistoryResult){
  try{
   const snapshot=this.mergeSnapshot(m,historySnapshot(value))
   const base=this.base!,old=m.bars.find(bar=>bar.timestamp===base)?.close,actual=snapshot.bars.find(bar=>bar.timestamp===base)?.close
   baseClose(snapshot.bars,base)
   m.bars=copyBars(snapshot.bars);m.prices=priceMap(m.bars);m.basis=snapshot.basis;m.handle={...m.handle,readAt:Date.now(),sourceTimestamp:snapshot.bars.at(-1)?.timestamp,basis:snapshot.basis};this.errorsByOwner.delete(m.handle.id)
   if(old!==actual)this.notice=`${m.handle.symbol.ticker} 的基准价格被修订，已统一重算：${new Date(base).toISOString()}`
   this.render();this.emit()
  }catch(reason){this.fail(reason,m.handle.id)}
 }
 mainChanged(){
  if(this.disposed||!this.members.size)return
  try{
   if(!this.replay){const next=this.chart().getDataList();validateBars(next);const old=this.mainPrices.get(this.base!),current=next.find(b=>b.timestamp===this.base)?.close;baseClose(next,this.base!);this.mainPrices=priceMap(next);this.errorsByOwner.delete('main');if(old!==undefined&&old!==current)this.notice=`主图基准价格被修订，已统一重算：${new Date(this.base!).toISOString()}`}
   this.render();this.emit()
  }catch(reason){this.fail(reason,'main')}
 }
 enterReplay(cutoff:number){
  this.valid();const source=this.chart().getDataList();if(this.members.size)baseClose(source,this.base!);this.cancelReads();this.fullMain=copyBars(source);this.mainPrices=priceMap(this.fullMain);this.replay=true;this.cutoff=cutoff
  for(const id of [...this.pending.keys()])this.cancel(id)
  for(const m of this.members.values())this.stop(m)
  this.render();this.emit()
 }
 seek(cutoff:number){if(!this.replay)return;this.cancelReads();this.cutoff=cutoff;this.render();this.emit()}
 async prepareResume(){if(this.replay)await this.fetchGroup(false)}
 private async fetchGroup(rebase:boolean,window?:{from:number;to:number}){
  if(!this.members.size)return
  if(this.restoring)throw Error('比较正在重读，请稍候')
  const members=[...this.members.values()],epoch=this.generation,controller=new AbortController();this.resumes.add(controller);this.restoring=true
  for(const m of members)this.stop(m);this.emit()
  try{
   const main=this.main(),from=main.length?Math.min(main[0].timestamp,...members.map(m=>m.bars[0]?.timestamp??Infinity)):undefined,to=Math.max(main.at(-1)?.timestamp??0,Date.now())
   if(from===undefined)throw Error('主图区间丢失，无法恢复比较')
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
   const base=rebase?commonBaseWithPrices(this.main(),snapshots.map(s=>priceMap(s.bars)),window?.from,window?.to):this.base!
   for(const snapshot of snapshots)baseClose(snapshot.bars,base)
   let revised=false
   for(let i=0;i<members.length;i++){const old=members[i].bars.find(b=>b.timestamp===base)?.close,current=snapshots[i].bars.find(b=>b.timestamp===base)?.close;if(old!==current)revised=true;members[i].bars=copyBars(snapshots[i].bars);members[i].prices=priceMap(members[i].bars);members[i].basis=snapshots[i].basis;members[i].handle={...members[i].handle,readAt:Date.now(),sourceTimestamp:snapshots[i].bars.at(-1)?.timestamp,basis:snapshots[i].basis}}
   this.base=base;if(rebase)this.referenceFrom=window?.from
   if(rebase||revised)this.notice=`${rebase?'已显式重设比较区间':'比较基准价格被修订，已统一重算'}：${new Date(base).toISOString()}`
   this.error=undefined;for(const m of members)this.errorsByOwner.delete(m.handle.id);this.render();this.emit()
  }catch(reason){if(!controller.signal.aborted&&epoch===this.generation&&!this.disposed)this.fail(reason);throw reason}finally{controller.abort();const current=this.resumes.delete(controller);if(current&&epoch===this.generation&&!this.disposed){this.restoring=false;if(!this.replay)for(const m of this.members.values())this.start(m);this.emit()}}
 }
 leaveReplay(){
  if(!this.replay)return
  const next=this.chart().getDataList();if(this.members.size)baseClose(next,this.base!)
  const old=this.mainPrices.get(this.base!),current=next.find(b=>b.timestamp===this.base)?.close
  this.replay=false;this.cutoff=Infinity;this.fullMain=copyBars(next);this.mainPrices=priceMap(next);this.errorsByOwner.delete('main')
  if(old!==current&&this.base!==undefined)this.notice=`主图基准价格被修订，已统一重算：${new Date(this.base).toISOString()}`
  this.render();for(const m of this.members.values())this.start(m);this.emit()
 }

 private render(){
  if(!this.members.size||this.base===undefined)return
  const chart=this.chart();registerCompare()
  if(!this.axisId){this.axisId=chart.createYAxis({id:`${this.options.instanceId}_returns`,paneId:'candle_pane',name:'normal',position:'left',createTicks:({defaultTicks})=>defaultTicks.map(t=>({...t,text:`${Number(t.value).toFixed(2)}%`}))})??undefined;if(!this.axisId)throw Error('比较收益轴创建失败')}
  const apply=(id:string|undefined,desiredId:string,label:string,valueAt:(timestamp:number)=>number|undefined,color:string)=>{
   const extendData={valueAt,base:this.base!,cutoff:this.cutoff}
   const current=id?chart.getIndicators({id})[0]:undefined
   if(current){const previous=current.extendData as typeof extendData;if(previous.valueAt!==valueAt||previous.base!==this.base||previous.cutoff!==this.cutoff||current.shortName!==label)chart.overrideIndicator({id,name:'COMPARE',shortName:label,extendData});return id!}
   const actual=chart.createIndicator({id:desiredId,name:'COMPARE',paneId:'candle_pane',yAxisId:this.axisId,shortName:label,extendData,styles:{lines:[{color,size:1}]}},true)
   if(!actual)throw Error('比较收益指标创建失败');return actual
  }
  if(this.mainReturnPrices!==this.mainPrices||this.mainReturnBase!==this.base){this.mainReturns=makeLookup(this.mainPrices,this.base);this.mainReturnPrices=this.mainPrices;this.mainReturnBase=this.base}
  this.mainIndicator=apply(this.mainIndicator,`${this.options.instanceId}_main_returns`,`主收益 ${this.options.symbol().ticker}`,this.mainReturns,'#facc15')
  const colors=['#38bdf8','#a78bfa','#fb7185','#4ade80'];let index=0
  for(const m of this.members.values()){if(m.returnPrices!==m.prices||m.returnBase!==this.base){m.returns=makeLookup(m.prices,this.base);m.returnPrices=m.prices;m.returnBase=this.base}m.handle.indicatorId=apply(m.handle.indicatorId||undefined,m.handle.id,`比较收益 ${m.handle.symbol.ticker}`,m.returns!,colors[index++%colors.length])}
 }
 private clearIndicators(){const chart=this.options.chart();if(this.mainIndicator)chart?.removeIndicator({id:this.mainIndicator});if(this.axisId)chart?.removeYAxis({id:this.axisId,paneId:'candle_pane'});this.mainIndicator=undefined;this.axisId=undefined;this.mainReturns=()=>undefined;this.mainReturnBase=undefined;this.mainReturnPrices=undefined;this.mainPrices.clear();this.errorsByOwner.delete('main')}
 clear(){++this.generation;for(const p of this.pending.values()){p.controller.abort();this.releasePending(p,this.options.period())}this.pending.clear();for(const m of this.members.values()){this.stop(m);comparisonOwners.delete(m.feed);m.feed.dispose?.();this.options.chart()?.removeIndicator({id:m.handle.indicatorId})}this.members.clear();for(const c of this.resumes)c.abort();this.clearIndicators();this.base=undefined;this.referenceFrom=undefined;this.notice=undefined;this.error=undefined;this.errorsByOwner.clear();this.replay=false;this.restoring=false;this.cutoff=Infinity;this.fullMain=[];this.emit()}
 dispose(){if(this.disposed)return;this.disposed=true;this.clear()}
}
