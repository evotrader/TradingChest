import type {DrawingStyleControl,DrawingToolDescriptor} from './catalog'
import type {DrawingSnapshot,DrawingState} from './types'

type Styles=NonNullable<DrawingSnapshot['overlay']['styles']>
/** Internal figure role; it does not change engine events or serialized definitions. */
export const drawingStyleAuxiliary=Symbol.for('trading-chest:drawing-style-auxiliary')
/** Some analytical figures project a standard input field into a different rendered group. */
export const drawingStyleInput=Symbol.for('trading-chest:drawing-style-input')
export const styleControls=(tool:DrawingToolDescriptor|undefined):DrawingStyleControl[]=>!tool?.settings.includes('style')?[]:[...(tool.styleControls??['stroke','lineWidth','lineStyle'])]
export function commonStyleControls(tools:Array<DrawingToolDescriptor|undefined>):DrawingStyleControl[]{
  return tools.length?styleControls(tools[0]).filter(control=>tools.every(tool=>styleControls(tool).includes(control))):[]
}
export function styleControlOptions(control:DrawingStyleControl,current:string|number|undefined):Array<string|number>{
 const values:Array<string|number>=control==='lineStyle'?['solid','dashed','dotted']:control==='fontSize'?[10,12,14,16,20,24,32]:[1,2,3,4,6,8,14]
 return [...new Set([...values,...(current!==undefined?[current]:[])])]
}
/** Standard figure keys are shared by built-in and third-party tools. */
export function drawingStylePatch(control:DrawingStyleControl,value:string|number):Styles {
  const result:any={},shapes=['polygon','rect','circle']
  if(control==='stroke'){for(const group of ['line','arc'])result[group]={color:value};for(const group of shapes)result[group]={borderColor:value}}
  if(control==='fill'){for(const group of shapes)result[group]={color:value};result.text={backgroundColor:value}}
  if(control==='lineWidth'){for(const group of ['line','arc'])result[group]={size:value};for(const group of shapes)result[group]={borderSize:value}}
  if(control==='lineStyle'){
    const style=value==='solid'?'solid':'dashed',dashedValue=value==='dotted'?[1,3]:[6,4]
    for(const group of ['line','arc'])result[group]={style,dashedValue}
    for(const group of shapes)result[group]={borderStyle:style,borderDashedValue:dashedValue}
  }
  if(control==='textColor')result.text={color:value}
  if(control==='fontSize')result.text={size:value}
  return result
}
/** Templates only contribute fields advertised by every target and the source. */
export function commonStylePatch(styles:Styles,controls:DrawingStyleControl[]):Styles{
  const result:any={}
  for(const control of controls)for(const [group,fields] of Object.entries(drawingStylePatch(control,''))){
    for(const key of Object.keys(fields as object)){const value=(styles as any)[group]?.[key];if(value!==undefined){result[group]??={};result[group][key]=structuredClone(value)}}
  }
  return result
}
export function templateStylePatch(styles:Styles,controls:DrawingStyleControl[]):Styles{
  const result:any={}
  for(const control of controls){
    const explicit=commonStylePatch(styles,[control])
    const semantics=Object.entries(styles).flatMap(([group,fields])=>{const value=styleSemantic(group,fields,control);return value?[value]:[]})
    const partial=Object.entries(explicit).some(([group,fields])=>!Object.hasOwn(fields as object,styleFields(group,control)[0]))
    const single=!partial&&semantics.length&&semantics.every(value=>value.key===semantics[0].key)?semantics[0]:undefined
    let patch:any=single?drawingStylePatch(control,single.value):explicit
    if(single&&control==='lineStyle')for(const [group,fields] of Object.entries(patch)){
      const key=['line','arc'].includes(group)?'dashedValue':'borderDashedValue'
      if(single.dash===undefined)delete (fields as any)[key]
      else (fields as any)[key]=structuredClone(single.dash)
    }
    // Partial groups constrain expansion too: an absent primary field must not hide an explicit dash.
    if(single&&Object.entries(explicit).some(([group,fields])=>Object.entries(fields as object).some(([key,value])=>JSON.stringify(patch[group]?.[key])!==JSON.stringify(value))))patch=explicit
    for(const [group,fields] of Object.entries(patch))result[group]={...result[group],...(fields as object)}
  }
  return result
}
export type DrawingStyleFigure={type:string;styles?:unknown;ignoreEvent?:unknown;[drawingStyleAuxiliary]?:boolean;[drawingStyleInput]?:Partial<Record<DrawingStyleControl,{group:string;fields:object}>>}
type Semantic={value:string|number;key:string;dash?:unknown}
function styleFields(group:string,control:DrawingStyleControl):string[]{
  const shape=['polygon','rect','circle'].includes(group),line=['line','arc'].includes(group)
  if(control==='stroke')return shape?['borderColor']:line?['color']:[]
  if(control==='fill')return shape?['color']:group==='text'?['backgroundColor']:[]
  if(control==='lineWidth')return shape?['borderSize']:line?['size']:[]
  if(control==='lineStyle')return shape?['borderStyle','borderDashedValue']:line?['style','dashedValue']:[]
  return group==='text'?[control==='textColor'?'color':'size']:[]
}
function styleSemantic(group:string,fields:any,control:DrawingStyleControl):Semantic|undefined{
  const keys=styleFields(group,control);if(!keys.length)return
  const value=fields?.[keys[0]]
  if(typeof value!=='string'&&(typeof value!=='number'||!Number.isFinite(value)))return
  if(control==='lineStyle'){
    const dash=fields?.[keys[1]]
    return {value:value==='dashed'&&Array.isArray(dash)&&dash[0]===1?'dotted':value,key:JSON.stringify([value,value==='dashed'?dash:undefined]),dash}
  }
  return {value,key:JSON.stringify(value)}
}
export function drawingStyleValue(drawing:DrawingSnapshot,control:DrawingStyleControl,resolved:Styles={},figures?:DrawingStyleFigure[]):string|number|undefined{
  const styles:any={...resolved};for(const [group,fields] of Object.entries(drawing.overlay.styles??{}))styles[group]={...styles[group],...(fields as object)}
  const entries=figures?.length?figures.map(figure=>{
    const input=figure[drawingStyleInput]?.[control],group=input?.group??(figure.type==='rectText'?'text':figure.type)
    const fields={...styles[group],...(input?.fields??figure.styles as object),...(drawing.overlay.styles as any)?.[group]},mode=(figure.styles as any)?.style??styles[group]?.style,shape=['polygon','rect','circle'].includes(group)
    const painted=!figure[drawingStyleAuxiliary]&&(!!input||!(shape&&['stroke','lineWidth','lineStyle'].includes(control)&&mode==='fill')&&!(control==='fill'&&(figure.type==='text'||(shape||figure.type==='rectText')&&mode==='stroke')))
    return {group,fields,painted,fixed:!input&&styleFields(group,control).some(key=>Object.hasOwn(figure.styles as object??{},key))}
  }):Object.entries(styles).map(([group,fields])=>({group,fields,painted:true,fixed:false}))
  const relevant=entries.filter(entry=>entry.painted&&styleFields(entry.group,control).length),inherited=relevant.filter(entry=>!entry.fixed)
  // Fixed auxiliary styles do not describe the editable field. Noninteractive fills/text remain relevant.
  const values=(inherited.length?inherited:relevant).flatMap(entry=>{const value=styleSemantic(entry.group,entry.fields,control);return value?[value]:[]})
  return values.length&&values.every(value=>value.key===values[0].key)?values[0].value:undefined
}
export function selectionWriteReason(state:DrawingState|undefined,objects:DrawingSnapshot[],editable:(drawing:DrawingSnapshot)=>boolean,allowLocked=false,locale='zh-CN'):string|undefined{
  const t=(zh:string,en:string)=>locale==='en-US'?en:zh
  if(!objects.length)return t('请选择绘图','Select a drawing')
  if(state?.history.pending)return t('正在确认，请稍候','Confirming, please wait')
  if(objects.some(object=>!editable(object)))return t('选择中含宿主管理的只读对象','Selection includes host-managed read-only drawings')
  if(objects.some(object=>object.migration))return t('绘图转移结果待核对，请刷新共享文档','Refresh the shared document to resolve the pending transfer')
  if(objects.some(object=>state?.history.uncertainLogicalIds.includes(object.logicalId)))return t('提交结果待确认，请刷新宿主标注','Submission is uncertain; refresh host annotations')
  if(new Set(objects.map(object=>object.presentation?.scope??'chart')).size>1)return t('不同绘图文档不能同时修改，请分别选择','Select drawings from one writable document at a time')
  const scope=objects[0].presentation?.scope??'chart',session=scope==='chart'?undefined:state?.sharing?.[scope]
  if(scope!=='chart'&&(!session||['loading','uncertain'].includes(session.status)))return t('共享文档尚不可写，请先处理文档状态','Resolve the shared document state before editing')
  if(!allowLocked&&objects.some(object=>object.overlay.lock))return t('选择中含锁定对象，请先解锁','Selection includes locked drawings; unlock first')
  return undefined
}
