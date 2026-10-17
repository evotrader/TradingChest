import type { Indicator } from 'klinecharts'
import constraints from '../widget/indicator-setting-modal/data'
import i18n from '../i18n'

export type IndicatorPlacement = 'main' | 'sub'
export type IndicatorParameterValue = number | string | boolean
export type IndicatorParameter = {label:string; optional?:boolean} & (
  | {type:'number'; min?:number; max?:number; step?:number}
  | {type:'select'; options:Array<{label:string;value:IndicatorParameterValue}>}
  | {type:'boolean'}
)
export interface IndicatorParameterSchema {
  items: IndicatorParameter[]
  repeat?: {parameter:IndicatorParameter; minItems:number; maxItems:number}
}
export interface IndicatorDescriptor {
  name:string
  label:string
  labels?:Record<string,string>
  category:string
  placements:IndicatorPlacement[]
  parameters?:IndicatorParameterSchema
}
export interface IndicatorHandle {id:string;name:string;paneId:string;yAxisId:string}
export interface IndicatorInstance extends IndicatorHandle {calcParams:unknown[];visible:boolean}
export interface AddIndicatorOptions {name:string;placement:IndicatorPlacement;calcParams?:IndicatorParameterValue[]}

const main = ['MA','EMA','SMA','BOLL','SAR','BBI','DEMA','TEMA','WMA','HMA','KAMA','VWMA','ZLEMA','MCGINLEY','ENVELOPES','T3','ICHIMOKU','ALLIGATOR','LINEARREGRESSION','KC','DC','PIVOTPOINTS']
const sub = ['MA','EMA','VOL','MACD','BOLL','KDJ','RSI','BIAS','BRAR','CCI','DMI','CR','PSY','DMA','TRIX','OBV','VR','WR','MTM','EMV','SAR','SMA','ROC','PVT','BBI','AO','ATR','SUPERTREND','HV','STDDEV','CV','MI','UI','BBW','VWAP','MFI','CMF','AD','VROC','KVO','FI','ELDER_RAY','StochRSI','ADX','AROON','UO','FISHER','COPPOCK','PPO','DPO','KST','TMF','ZIGZAG']
export const indicatorCategories:Record<string,{names:string[];labelKey:string}> = {
  trend:{names:['MA','EMA','SMA','BOLL','SAR','BBI','ATR','SUPERTREND','ICHIMOKU','ALLIGATOR','DEMA','TEMA','WMA','HMA','KAMA','VWMA','ZLEMA','MCGINLEY','LINEARREGRESSION','ENVELOPES','T3'],labelKey:'category_trend'},
  volatility:{names:['BOLL','KC','DC','HV','STDDEV','CV','MI','UI','BBW'],labelKey:'category_volatility'},
  volume:{names:['VOL','OBV','PVT','VR','VWAP','MFI','CMF','AD','VROC','KVO','FI','ELDER_RAY'],labelKey:'category_volume'},
  momentum:{names:['MACD','KDJ','RSI','BIAS','BRAR','CCI','DMI','CR','PSY','DMA','TRIX','WR','MTM','EMV','ROC','AO','StochRSI','ADX','AROON','UO','FISHER','COPPOCK','PPO','DPO','KST','TMF'],labelKey:'category_momentum'},
  other:{names:['PIVOTPOINTS','ZIGZAG'],labelKey:'category_other'}
}
const period:IndicatorParameter={type:'number',label:'period',min:1,step:1}
const counts:Record<string,number>={ATR:1,SUPERTREND:2,ICHIMOKU:4,ALLIGATOR:3,DEMA:1,TEMA:1,WMA:1,HMA:1,KAMA:3,VWMA:1,ZLEMA:1,MCGINLEY:1,LINEARREGRESSION:1,ENVELOPES:2,T3:2,KC:2,DC:1,HV:1,STDDEV:1,CV:1,MI:2,UI:1,BBW:2,VWAP:0,MFI:1,CMF:1,AD:0,VROC:1,KVO:3,FI:1,ELDER_RAY:1,StochRSI:4,ADX:1,AROON:1,UO:3,FISHER:1,COPPOCK:3,PPO:3,DPO:1,KST:9,TMF:1,PIVOTPOINTS:0,ZIGZAG:1}
const repeatNames=new Set(['MA','EMA','VOL','RSI','BIAS','WR'])
function builtinSchema(name:string):IndicatorParameterSchema {
  if(repeatNames.has(name))return {items:[],repeat:{parameter:period,minItems:1,maxItems:Number.MAX_SAFE_INTEGER}}
  const old=(constraints as Record<string,Array<{paramNameKey:string;min?:number;precision?:number}>>)[name]
  const items:IndicatorParameter[]=old?old.map(p=>({type:'number',label:p.paramNameKey,min:p.min,step:10**-(p.precision??0)})):Array.from({length:counts[name]??0},(_,i)=>({...period,label:`params_${i+1}`}))
  if(['SUPERTREND','ENVELOPES','KC','BBW'].includes(name))items[1]={type:'number',label:name==='ENVELOPES'?'percent':'multiplier',min:0.000001}
  if(name==='T3')items[1]={type:'number',label:'volume_factor',min:0,max:1}
  return {items}
}
export const builtinIndicatorCatalog:IndicatorDescriptor[]=Array.from(new Set([...main,...sub])).map(name=>({
  name,label:name,labels:{'zh-CN':i18n(name.toLowerCase(),'zh-CN'),'en-US':i18n(name.toLowerCase(),'en-US')},
  category:Object.keys(indicatorCategories).find(key=>indicatorCategories[key].names.includes(name))??'other',
  placements:[...(main.includes(name)?['main' as const]:[]),...(sub.includes(name)?['sub' as const]:[])],parameters:builtinSchema(name)
}))
export function indicatorLabel(descriptor:IndicatorDescriptor,locale:string):string {return descriptor.labels?.[locale]??descriptor.label}
export function parameterAt(schema:IndicatorParameterSchema,index:number):IndicatorParameter|undefined{return schema.items[index]??schema.repeat?.parameter}
export function parameterBounds(schema:IndicatorParameterSchema):{min:number;max:number}{
  const firstOptional=schema.items.findIndex(p=>p.optional)
  return {min:firstOptional<0?schema.items.length:firstOptional,max:schema.items.length+(schema.repeat?.maxItems??0)}
}
function validateParameterSchema(p:IndicatorParameter):void {
  if(!p||typeof p.label!=='string'||!['number','select','boolean'].includes(p.type))throw Error('指标参数描述无效')
  if(p.type==='number'&&([p.min,p.max,p.step].some(v=>v!==undefined&&!Number.isFinite(v))||(p.min!==undefined&&p.max!==undefined&&p.min>p.max)||(p.step!==undefined&&p.step<=0)))throw Error('指标数字参数约束无效')
  if(p.type==='select'&&(!Array.isArray(p.options)||!p.options.length||p.options.some(o=>!o||typeof o.label!=='string'||!['number','string','boolean'].includes(typeof o.value)||(typeof o.value==='number'&&!Number.isFinite(o.value)))||new Set(p.options.map(o=>`${typeof o.value}:${o.value}`)).size!==p.options.length))throw Error('指标枚举参数选项无效')
}
export function copyIndicatorCatalog(input:IndicatorDescriptor[]):IndicatorDescriptor[]{
  if(!Array.isArray(input)||new Set(input.map(d=>d?.name)).size!==input.length)throw Error('指标目录名称重复或无效')
  for(const d of input){
    if(!d||!d.name||typeof d.name!=='string'||typeof d.label!=='string'||typeof d.category!=='string'||!Array.isArray(d.placements)||!d.placements.length||d.placements.some(p=>!['main','sub'].includes(p))||new Set(d.placements).size!==d.placements.length)throw Error('指标目录描述无效')
    if(d.labels&&Object.values(d.labels).some(s=>typeof s!=='string'))throw Error('指标翻译无效')
    if(d.parameters){const s=d.parameters;if(!Array.isArray(s.items))throw Error('指标参数结构无效');s.items.forEach(validateParameterSchema)
      let optional=false;for(const p of s.items){if(p.optional)optional=true;else if(optional)throw Error('指标可选参数只能位于尾部')}
      if(s.repeat){validateParameterSchema(s.repeat.parameter);if(s.items.some(p=>p.optional)||![s.repeat.minItems,s.repeat.maxItems].every(Number.isInteger)||s.repeat.minItems<0||s.repeat.maxItems<s.repeat.minItems)throw Error('指标重复参数结构无效')}
    }
  }
  return JSON.parse(JSON.stringify(input))
}
export function validateIndicatorParams(descriptor:IndicatorDescriptor,params:unknown[]):void{
  if(!Array.isArray(params))throw Error('指标参数必须是数组')
  const schema=descriptor.parameters
  if(!schema)return
  const bounds=parameterBounds(schema),min=bounds.min+(schema.repeat?.minItems??0)
  if(params.length<min||params.length>bounds.max)throw Error(`指标 ${descriptor.name} 参数数量无效`)
  params.forEach((value,index)=>{const p=parameterAt(schema,index)!;let valid=false
    if(p.type==='boolean')valid=typeof value==='boolean'
    if(p.type==='select')valid=p.options.some(o=>o.value===value)
    if(p.type==='number'&&typeof value==='number'&&Number.isFinite(value)){const base=p.min??0;valid=(p.min===undefined||value>=p.min)&&(p.max===undefined||value<=p.max)&&(p.step===undefined||Math.abs((value-base)/p.step-Math.round((value-base)/p.step))<1e-7)}
    if(!valid)throw Error(`指标 ${descriptor.name} 参数 ${index+1} 无效`)
  })
}
export function indicatorInstance(i:Indicator):IndicatorInstance{return {id:i.id,name:i.name,paneId:i.paneId,yAxisId:i.yAxisId,calcParams:structuredClone(i.calcParams),visible:i.visible}}
