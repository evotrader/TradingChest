import type {DrawingStyleControl,DrawingToolDescriptor} from './catalog'
import type {DrawingSnapshot,DrawingState} from './types'

type Styles=NonNullable<DrawingSnapshot['overlay']['styles']>
export const styleControls=(tool:DrawingToolDescriptor|undefined):DrawingStyleControl[]=>!tool?.settings.includes('style')?[]:[...(tool.styleControls??['stroke','lineWidth','lineStyle'])]
export function commonStyleControls(tools:Array<DrawingToolDescriptor|undefined>):DrawingStyleControl[]{
  return tools.length?styleControls(tools[0]).filter(control=>tools.every(tool=>styleControls(tool).includes(control))):[]
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
export function templateStylePatch(styles:Styles,sourceName:string,controls:DrawingStyleControl[]):Styles{
  const result:any={}
  const source={overlay:{name:sourceName,styles}} as DrawingSnapshot
  for(const control of controls){
    if(!Object.keys(commonStylePatch(styles,[control])).length)continue
    const value=drawingStyleValue(source,control)
    if(value===undefined)continue
    for(const [group,fields] of Object.entries(drawingStylePatch(control,value)))result[group]={...result[group],...(fields as object)}
  }
  return result
}
const shapeGroup=(name:string)=>['circle','fibonacciCircle'].includes(name)?'circle':['rect','triangle','parallelogram','ellipse','rotatedRect','gannBox'].includes(name)?'polygon':undefined
export function drawingStyleValue(drawing:DrawingSnapshot,control:DrawingStyleControl,resolved:Styles={}):string|number|undefined{
  const styles:any={...resolved};for(const [group,fields] of Object.entries(drawing.overlay.styles??{}))styles[group]={...styles[group],...(fields as object)}
  const group=shapeGroup(drawing.overlay.name),line=group?styles[group]:styles.line
  if(control==='stroke')return group?line?.borderColor:line?.color
  if(control==='fill')return group?line?.color:['textAnnotation','note','anchoredText','priceLabel','callout'].includes(drawing.overlay.name)?styles.text?.backgroundColor:styles.polygon?.color
  if(control==='lineWidth')return (group?line?.borderSize:line?.size)??1
  if(control==='lineStyle'){const style=group?line?.borderStyle:line?.style,dash=group?line?.borderDashedValue:line?.dashedValue;return style==='dashed'&&dash?.[0]===1?'dotted':style??'solid'}
  if(control==='textColor')return styles.text?.color
  if(control==='fontSize')return styles.text?.size??12
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
