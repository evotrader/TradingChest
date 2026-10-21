import type {KLineData} from 'klinecharts'
import {validVolumeBar,vwapSourcePrice,type VwapPriceSource,type VwapBandMode,type VwapBandsSummary} from './analytics'

export interface VwapBandOptions {mode:VwapBandMode;multipliers:number[];fill:boolean;opacity:number}
export function vwapBandOptions(parameters:Record<string,unknown>):VwapBandOptions{
 const mode=(parameters.bandMode??'none') as VwapBandMode,multipliers=parameters.bandMultipliers??[1,2,3],fill=parameters.bandFill??true,opacity=parameters.bandOpacity??.12
 if(!['none','standard-deviation','percentage'].includes(mode)||parameters.bandAlgorithm!==undefined&&parameters.bandAlgorithm!=='ohlcv-vwap-bands-v1')throw Error('VWAP 带算法或模式无效')
 if(!Array.isArray(multipliers)||!multipliers.length||multipliers.length>3||new Set(multipliers).size!==multipliers.length||multipliers.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<=0||mode==='standard-deviation'&&value>10||mode==='percentage'&&value>100))throw Error('VWAP 带需要1至3个互异正数，标准差倍数不超过10，百分比不超过100')
 if(typeof fill!=='boolean'||typeof opacity!=='number'||!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('VWAP 带填充或透明度无效')
 return {mode,multipliers:[...multipliers],fill,opacity}
}
interface Moment {origin:number;scale:number;weightScale:number;weight:number;mean:number;m2:number;bad:boolean}
const minimumNormal=2**-1022
const normalPrecision=(value:number)=>value===0||Math.abs(value)>=minimumNormal
const empty=():Moment=>({origin:0,scale:0,weightScale:0,weight:0,mean:0,m2:0,bad:false})
/** Shifted prices and scaled weights keep Welford's population moments finite. */
export class VwapBandIndex {
 private ranges=new Map<number,Moment[]>()
 private length=0
 constructor(private source:VwapPriceSource){}
 update(bars:readonly KLineData[],tail=false):void{
  if(tail&&this.length&&bars.length>=this.length&&bars.length<=this.length+1){for(const [from,states] of this.ranges)states.length=Math.min(states.length,Math.max(0,this.length-1-from))}
  else this.ranges.clear()
  this.length=bars.length
 }
 private moment(bars:readonly KLineData[],from:number,index:number):Moment{
  let states=this.ranges.get(from)
  if(!states){if(this.ranges.size>=64)this.ranges.delete(this.ranges.keys().next().value!);states=[];this.ranges.set(from,states)}
  for(let i=from+states.length;i<=index;i++){
   const previous=states.at(-1),state=previous?{...previous}:empty(),bar=bars[i]
   const multiply=(a:number,b:number)=>{const value=a*b;if(a!==0&&b!==0&&(value===0||!normalPrecision(value)))state.bad=true;return value}
   if(!validVolumeBar(bar))state.bad=true
   else if(bar.volume!>0&&!state.bad){
    const value=vwapSourcePrice(bar,this.source),volume=bar.volume!
    if(!Number.isFinite(value))state.bad=true
    else if(state.weight===0){state.origin=value;state.weightScale=volume;state.weight=1}
    else{
     const delta=value-state.origin,newScale=Math.max(state.scale,Number.isFinite(delta)?Math.abs(delta):Math.max(Math.abs(value),Math.abs(state.origin)))
     if(newScale>state.scale){const ratio=state.scale/newScale;state.mean*=ratio;state.m2=multiply(multiply(state.m2,ratio),ratio);state.scale=newScale}
     if(volume>state.weightScale){const ratio=state.weightScale/volume;if(!ratio)state.bad=true;state.weight=multiply(state.weight,ratio);state.m2=multiply(state.m2,ratio);state.weightScale=volume}
     const weight=volume/state.weightScale,total=state.weight+weight,q=state.scale?(Number.isFinite(delta)?delta/state.scale:value/state.scale-state.origin/state.scale):0,difference=q-state.mean
     if(!weight||!normalPrecision(weight))state.bad=true
     const increment=multiply(difference,multiply(difference,multiply(state.weight,weight/total))),next=state.mean+difference*(weight/total)
     if(difference!==0&&increment===0)state.bad=true
     state.m2+=increment;state.mean=next;state.weight=total
     if(![state.mean,state.m2,state.weight,state.scale].every(Number.isFinite)||state.m2<0)state.bad=true
    }
   }
   states.push(state)
  }
  return states[index-from]
 }
 deviation(bars:readonly KLineData[],from:number,index:number,center:number):number{
  const state=this.moment(bars,from,index)
  if(state.bad||!state.weight||!Number.isFinite(center))throw Error('VWAP 带累计数据无效或数值精度不足，请缩小范围')
  if(!state.scale)return Math.abs(center-state.origin)
  const difference=center-state.origin,offset=Number.isFinite(difference)?difference/state.scale:center/state.scale-state.origin/state.scale
  // Correct the stable internal mean to the unchanged public VWAP center.
  const variance=state.m2/state.weight
  if(state.m2>0&&(variance===0||!normalPrecision(variance)))throw Error('VWAP 带方差数值精度不足，请缩小范围')
  const sigma=state.scale*Math.hypot(Math.sqrt(variance),state.mean-offset)
  if(!Number.isFinite(sigma))throw Error('VWAP 带标准差溢出，请缩小价格范围')
  return sigma
 }
}
export function vwapBands(center:number|undefined,options:VwapBandOptions,deviation?:()=>number):VwapBandsSummary|undefined{
 if(options.mode==='none')return undefined
 const summary:VwapBandsSummary={mode:options.mode,method:'ohlcv-vwap-bands-v1',values:[]}
 try{
  if(center===undefined||!Number.isFinite(center))throw Error('该时刻均线不可用，无法计算带')
  const sigma=options.mode==='standard-deviation'?deviation!():0
  summary.values=options.multipliers.map(multiplier=>{
   const half=options.mode==='percentage'?Math.abs(center)*(multiplier/100):sigma*multiplier,lower=center-half,upper=center+half
   if(![half,lower,upper].every(Number.isFinite))throw Error('VWAP 带边界溢出，请降低倍数或缩小范围')
   return {multiplier,lower,upper}
  })
 }catch(error){summary.values=[];summary.reason=error instanceof Error?error.message:String(error)}
 return summary
}
