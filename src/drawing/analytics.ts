import type {KLineData} from 'klinecharts'
import type {Period} from '../types'

export type VwapPriceSource='close'|'hl2'|'hlc3'|'ohlc4'
export type DrawingAnalyticsMethod='bar-price-volume-v1'|'bar-range-uniform-v1'
export interface DrawingAnalyticsState {
  status:'calculating'|'ready'|'unavailable'|'stale'
  method:DrawingAnalyticsMethod
  period?:Period
  requestedRange:{from:number;to?:number}
  actualRange?:{from:number;to:number}
  count:number
  coverage:'loaded-bars'
  boundarySampled?:boolean
  replayPartial?:boolean
  reason?:string
  summary?:{vwap?:number;volume:number;poc?:number;vah?:number;val?:number;valueArea?:number;rows?:number;source?:VwapPriceSource}
}
export interface VwapPoint {timestamp:number;value?:number;volume:number}
export interface VolumeBin {lower:number;upper:number;volume:number;up:number;down:number}
export interface VolumeProfile {bins:VolumeBin[];volume:number;poc:number;vah:number;val:number;valueArea:number;pocIndex:number;vaFrom:number;vaTo:number}
export const isVolumeDrawing=(name:string)=>name==='anchoredVwap'||name==='fixedRangeVolumeProfile'

export function lowerBound(bars:readonly KLineData[],timestamp:number):number {
  let a=0,b=bars.length
  while(a<b){const m=(a+b)>>>1;if(bars[m].timestamp<timestamp)a=m+1;else b=m}
  return a
}
export function validVolumeBar(bar:KLineData):boolean {
  return [bar.timestamp,bar.open,bar.high,bar.low,bar.close,bar.volume].every(v=>typeof v==='number'&&Number.isFinite(v))&&
    bar.volume!>=0&&bar.low<=Math.min(bar.open,bar.close)&&bar.high>=Math.max(bar.open,bar.close)&&bar.high>=bar.low
}
const price=(bar:KLineData,source:VwapPriceSource)=>source==='close'?bar.close:source==='hl2'?bar.high/2+bar.low/2:source==='hlc3'?bar.high/3+bar.low/3+bar.close/3:bar.open/4+bar.high/4+bar.low/4+bar.close/4
class Sum {
  value=0
  compensation=0
  add(value:number):number {const adjusted=value-this.compensation,next=this.value+adjusted;this.compensation=(next-this.value)-adjusted;return this.value=next}
}

/** Prefixes are per confirmed series/source; a replaced last candle never contributes twice. */
export class VwapIndex {
  private ranges=new Map<number,{amount:Sum;volume:Sum;bad:boolean;points:VwapPoint[]}>()
  private amounts:number[]=[0]
  private volumes:number[]=[0]
  private amountErrors:number[]=[0]
  private volumeErrors:number[]=[0]
  private invalid:number[]=[0]
  private amount=new Sum()
  private volume=new Sum()
  constructor(private source:VwapPriceSource){}
  update(bars:readonly KLineData[],tail=false):void {
    this.ranges.clear()
    let start=0
    if(tail&&this.amounts.length>1&&bars.length>=this.amounts.length-1&&bars.length<=this.amounts.length){
      start=this.amounts.length-2
      this.amounts.length=start+1;this.volumes.length=start+1;this.invalid.length=start+1;this.amountErrors.length=start+1;this.volumeErrors.length=start+1
      this.amount=new Sum();this.amount.value=this.amounts[start]
      this.volume=new Sum();this.volume.value=this.volumes[start]
      this.amount.compensation=this.amountErrors[start];this.volume.compensation=this.volumeErrors[start]
    }else{this.amounts=[0];this.volumes=[0];this.invalid=[0];this.amountErrors=[0];this.volumeErrors=[0];this.amount=new Sum();this.volume=new Sum()}
    for(let i=start;i<bars.length;i++){
      const bar=bars[i],valid=validVolumeBar(bar),contribution=valid?price(bar,this.source)*bar.volume!:0
      const size=valid?bar.volume!:0,amount=this.amount.add(Number.isFinite(contribution)?contribution:0),volume=this.volume.add(size)
      if(!Number.isFinite(amount)||!Number.isFinite(volume)){this.amount=new Sum();this.volume=new Sum()}
      this.amounts.push(this.amount.value);this.volumes.push(this.volume.value)
      this.amountErrors.push(this.amount.compensation);this.volumeErrors.push(this.volume.compensation)
      this.invalid.push(this.invalid[i]+(!valid||!Number.isFinite(contribution)||!Number.isFinite(amount)||!Number.isFinite(volume)?1:0))
    }
  }
  at(bars:readonly KLineData[],from:number,index:number):VwapPoint {
    const volume=(this.volumes[index+1]-this.volumes[from])+(this.volumeErrors[from]-this.volumeErrors[index+1]),amount=(this.amounts[index+1]-this.amounts[from])+(this.amountErrors[from]-this.amountErrors[index+1])
    const amountError=Number.EPSILON*8*(Math.abs(this.amounts[index+1])+Math.abs(this.amounts[from])+Math.abs(this.amountErrors[from])+Math.abs(this.amountErrors[index+1]))
    const volumeError=Number.EPSILON*8*(Math.abs(this.volumes[index+1])+Math.abs(this.volumes[from])+Math.abs(this.volumeErrors[from])+Math.abs(this.volumeErrors[index+1]))
    // A compensated global prefix still cannot recover information below its own resolution.
    // Cache a stable local accumulation when cancellation cannot preserve twelve digits.
    if(from>0&&(amountError>=Math.abs(amount)*1e-12||volumeError>=Math.abs(volume)*1e-12))return this.local(bars,from,index)
    const value=this.invalid[index+1]===this.invalid[from]&&volume>0&&Number.isFinite(volume)&&Number.isFinite(amount)?amount/volume:undefined
    return {timestamp:bars[index].timestamp,volume:Number.isFinite(volume)?volume:0,value:value!==undefined&&Number.isFinite(value)?value:undefined}
  }
  private local(bars:readonly KLineData[],from:number,index:number):VwapPoint {
    let range=this.ranges.get(from)
    if(!range){if(this.ranges.size>=64)this.ranges.delete(this.ranges.keys().next().value!);range={amount:new Sum(),volume:new Sum(),bad:false,points:[]};this.ranges.set(from,range)}
    for(let i=from+range.points.length;i<=index;i++){
      const bar=bars[i],valid=validVolumeBar(bar),contribution=valid?price(bar,this.source)*bar.volume!:NaN
      if(!valid||!Number.isFinite(contribution))range.bad=true
      else{range.amount.add(contribution);range.volume.add(bar.volume!)}
      const value=!range.bad&&range.volume.value>0?range.amount.value/range.volume.value:undefined
      range.points.push({timestamp:bar.timestamp,volume:Number.isFinite(range.volume.value)?range.volume.value:0,value:value!==undefined&&Number.isFinite(value)?value:undefined})
    }
    return range.points[index-from]
  }
}
export function calculateAnchoredVwap(bars:readonly KLineData[],from:number,source:VwapPriceSource='hlc3'):VwapPoint[] {
  const index=new VwapIndex(source);index.update(bars)
  return bars.slice(from).map((_,offset)=>index.at(bars,from,from+offset))
}

/** Uniform price-range allocation is an explicit OHLCV estimate, not trade-at-price data. */
export function calculateVolumeProfile(bars:readonly KLineData[],from:number,to:number,rows=48,valueArea=.7):VolumeProfile {
  if(!Number.isInteger(rows)||rows<1||rows>256||!Number.isFinite(valueArea)||valueArea<=0||valueArea>1)throw Error('成交量分布参数无效')
  if(from<0||to>=bars.length||from>to)throw Error('成交量分布区间无效')
  let low=Infinity,high=-Infinity
  const total=new Sum(),upTotal=new Sum(),downTotal=new Sum()
  for(let i=from;i<=to;i++){
    const bar=bars[i];if(!validVolumeBar(bar))throw Error('区间包含缺失或无效 OHLCV，请修正数据后重试')
    low=Math.min(low,bar.low);high=Math.max(high,bar.high);total.add(bar.volume!);(bar.close>=bar.open?upTotal:downTotal).add(bar.volume!)
  }
  if(!Number.isFinite(total.value))throw Error('成交量累计溢出')
  if(total.value===0)throw Error('区间无成交量，无法计算 POC 和价值区')
  if(low===high)rows=1
  const width=(high-low)/rows
  if(!Number.isFinite(width)||width<0)throw Error('价格范围无法分箱')
  const up=new Float64Array(rows),down=new Float64Array(rows),upDiff=new Float64Array(rows+1),downDiff=new Float64Array(rows+1)
  const bin=(value:number)=>width===0?0:Math.max(0,Math.min(rows-1,Math.floor((value-low)/width)))
  for(let i=from;i<=to;i++){
    const bar=bars[i],volume=bar.volume!;if(volume===0)continue
    const target=bar.close>=bar.open?up:down,diff=bar.close>=bar.open?upDiff:downDiff,first=bin(bar.low),last=bin(bar.high)
    if(first===last||bar.low===bar.high){target[first]+=volume;continue}
    const span=bar.high-bar.low
    target[first]+=volume*((low+(first+1)*width-bar.low)/span)
    target[last]+=volume*((bar.high-(low+last*width))/span)
    if(last>first+1){const middle=volume*(width/span);diff[first+1]+=middle;diff[last]-=middle}
  }
  let currentUp=0,currentDown=0
  const tolerance=1e-9*Math.max(1,Math.abs(total.value)),actual=new Sum(),actualUp=new Sum(),actualDown=new Sum()
  const bins:VolumeBin[]=Array.from({length:rows},(_,i)=>{
    currentUp+=upDiff[i];currentDown+=downDiff[i]
    const clean=(value:number)=>{if(!Number.isFinite(value)||value < -tolerance)throw Error('成交量分箱发生数值错误');return Math.max(0,value)}
    const u=clean(up[i]+currentUp),d=clean(down[i]+currentDown),volume=u+d
    actual.add(volume);actualUp.add(u);actualDown.add(d)
    return {lower:low+i*width,upper:i===rows-1?high:low+(i+1)*width,volume,up:u,down:d}
  })
  if(Math.abs(actual.value-total.value)>tolerance||Math.abs(actualUp.value-upTotal.value)>tolerance||Math.abs(actualDown.value-downTotal.value)>tolerance)throw Error('成交量分布未通过总量守恒检查')
  let pocIndex=0
  const center=(i:number)=>bins[i].lower/2+bins[i].upper/2,mid=low/2+high/2
  for(let i=1;i<rows;i++)if(bins[i].volume>bins[pocIndex].volume||bins[i].volume===bins[pocIndex].volume&&Math.abs(center(i)-mid)<Math.abs(center(pocIndex)-mid))pocIndex=i
  let a=pocIndex,b=pocIndex,covered=bins[pocIndex].volume
  while(covered<total.value*valueArea&&(a>0||b<rows-1)){
    if(b===rows-1||a>0&&bins[a-1].volume>=bins[b+1].volume)covered+=bins[--a].volume
    else covered+=bins[++b].volume
  }
  return {bins,volume:total.value,poc:center(pocIndex),val:bins[a].lower,vah:bins[b].upper,valueArea:covered/total.value,pocIndex,vaFrom:a,vaTo:b}
}
