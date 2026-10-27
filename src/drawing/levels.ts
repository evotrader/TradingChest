import {createOpaqueId} from '../ids'

export interface DrawingLevel {
 id:string
 value:number
 visible:boolean
 color?:string
 width?:number
 style?:'solid'|'dashed'|'dotted'
 text?:string
}
export interface DrawingLevelSet {version:1;items:DrawingLevel[]}
export type DrawingLevelAppearance=Omit<DrawingLevel,'id'|'text'>
export interface DrawingLevelPresetSet {version:1;items:DrawingLevelAppearance[]}
export type DrawingLevelInput=DrawingLevelSet|readonly number[]|undefined
export type DrawingLevelPresetInput=DrawingLevelPresetSet|readonly number[]|undefined
export const defaultDrawingLevelValues=Object.freeze([0,.236,.382,.5,.618,.786,1])

const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)
const color=/^(?:#[a-f0-9]{6}(?:[a-f0-9]{2})?|transparent)$/i
function validate(value:unknown,preset:boolean):void {
 if(!record(value)||!Object.hasOwn(value,'version')||value.version!==1||!Object.hasOwn(value,'items')||!Array.isArray(value.items)||value.items.length<1||value.items.length>64||Object.keys(value).some(key=>!['version','items'].includes(key)))throw Error('绘图级别集格式无效，必须包含 1–64 个级别')
 const ids=new Set<string>(),allowed=preset?['value','visible','color','width','style']:['id','value','visible','color','width','style','text']
 for(const item of value.items){
  if(!record(item)||Object.keys(item).some(key=>!allowed.includes(key))||!Object.hasOwn(item,'value')||typeof item.value!=='number'||!Number.isFinite(item.value)||!Object.hasOwn(item,'visible')||typeof item.visible!=='boolean')throw Error('绘图级别的比例、显隐或字段无效')
  if(!preset){if(!Object.hasOwn(item,'id')||typeof item.id!=='string'||!item.id||ids.has(item.id))throw Error('绘图级别 ID 不能为空或重复');ids.add(item.id)}
  if(Object.hasOwn(item,'color')&&(typeof item.color!=='string'||!color.test(item.color)))throw Error('绘图级别颜色无效')
  if(Object.hasOwn(item,'width')&&(typeof item.width!=='number'||!Number.isFinite(item.width)||item.width<1||item.width>4))throw Error('绘图级别线宽必须在 1–4 之间')
  if(Object.hasOwn(item,'style')&&!['solid','dashed','dotted'].includes(item.style as string))throw Error('绘图级别线型无效')
  if(Object.hasOwn(item,'text')&&(typeof item.text!=='string'||item.text.length>500||/[\r\n\u0085\u2028\u2029]/.test(item.text)))throw Error('级别正文必须为不超过 500 个 UTF-16 单元的单行纯文本')
 }
}
export function validateDrawingLevelSet(value:unknown):asserts value is DrawingLevelSet {validate(value,false)}
export function validateDrawingLevelPresetSet(value:unknown):asserts value is DrawingLevelPresetSet {validate(value,true)}
export function isDrawingLevelSet(value:unknown):value is DrawingLevelSet {try{validateDrawingLevelSet(value);return true}catch{return false}}
export function isDrawingLevelValues(value:unknown):value is number[] {return Array.isArray(value)&&value.length>=1&&value.length<=64&&value.every(item=>typeof item==='number'&&Number.isFinite(item))}

/** Legacy arrays are read without rewriting the stored document or generating random IDs. */
export function resolveDrawingLevels(value:DrawingLevelInput,defaults:Exclude<DrawingLevelInput,undefined>=defaultDrawingLevelValues):DrawingLevelSet {
 const source=value??defaults
 if(Array.isArray(source)){
  if(!isDrawingLevelValues(source))throw Error('绘图级别必须为 1–64 个有限数值')
  return {version:1,items:source.map((value,index)=>({id:`legacy-${index}`,value,visible:true}))}
 }
 validateDrawingLevelSet(source)
 return structuredClone(source)
}

/** Presets carry appearance only; IDs and level bodies remain document content. */
export function extractDrawingLevelPreset(value:DrawingLevelInput,defaults:Exclude<DrawingLevelInput,undefined>=defaultDrawingLevelValues):DrawingLevelPresetSet {
 return {version:1,items:resolveDrawingLevels(value,defaults).items.map(({id,text,...appearance})=>appearance)}
}
function presetItems(value:DrawingLevelPresetInput,defaults:Exclude<DrawingLevelInput,undefined>):DrawingLevelAppearance[] {
 if(value===undefined)return extractDrawingLevelPreset(undefined,defaults).items
 if(Array.isArray(value))return extractDrawingLevelPreset(value,defaults).items
 validateDrawingLevelPresetSet(value);return structuredClone(value.items)
}
/** Instantiate once per preview; a continuous session calls this again for its next object. */
export function instantiateDrawingLevelPreset(value:DrawingLevelPresetInput,defaults:Exclude<DrawingLevelInput,undefined>=defaultDrawingLevelValues):DrawingLevelSet {
 const result:DrawingLevelSet={version:1,items:presetItems(value,defaults).map(appearance=>({...appearance,id:createOpaqueId()}))}
 validateDrawingLevelSet(result);return result
}
/** Match equal ratios in occurrence order and reject implicit removal of existing bodies. */
export function applyDrawingLevelPreset(previous:DrawingLevelInput,value:DrawingLevelPresetInput,defaults:Exclude<DrawingLevelInput,undefined>=defaultDrawingLevelValues):DrawingLevelSet {
 const source=resolveDrawingLevels(previous,defaults),byValue=new Map<number,DrawingLevel[]>()
 for(const item of source.items){const matches=byValue.get(item.value)??[];matches.push(item);byValue.set(item.value,matches)}
 const items=presetItems(value,defaults).map(appearance=>{const matched=byValue.get(appearance.value)?.shift();return {...appearance,id:matched?.id??createOpaqueId(),...(matched&&Object.hasOwn(matched,'text')?{text:matched.text}:{})}})
 const removed=[...byValue.values()].flat().find(item=>item.text?.length)
 if(removed)throw Error(`模板将移除带正文的级别 ${removed.id}（${removed.value}）；请先显式处理正文或只应用共同样式`)
 const result:DrawingLevelSet={version:1,items};validateDrawingLevelSet(result);return result
}
