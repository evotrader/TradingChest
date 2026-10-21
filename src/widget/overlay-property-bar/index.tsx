import {createEffect,createMemo,createSignal,onCleanup,Show,For,type Component} from 'solid-js'
import {commonStyleControls,styleControlOptions} from '../../drawing/styleControls'
import type {DrawingToolDescriptor,DrawingStyleControl} from '../../drawing/catalog'
import type {DrawingCommand,DrawingCommandResult,DrawingSnapshot} from '../../drawing/types'
import type {DrawingTemplate} from '../../drawing/preferences'
import {ColorPalette} from './ColorPalette'

export interface OverlayPropertyBarProps {
  locale:string
  position:{x:number;y:number}
  insetLeft?:number
  objects:DrawingSnapshot[]
  handles:Array<{x:number;y:number}>
  controls:DrawingStyleControl[]
  catalog:DrawingToolDescriptor[]
  values:Partial<Record<DrawingStyleControl,string|number|undefined>>
  reason?:string
  lockReason?:string
  templates:DrawingTemplate[]
  execute:(command:DrawingCommand)=>Promise<DrawingCommandResult>
  onStyle:(control:DrawingStyleControl,value:string|number)=>Promise<DrawingCommandResult>
  onSettings:()=>void
  onTemplates:()=>void
  onClose:()=>void
}
const OverlayPropertyBar:Component<OverlayPropertyBarProps>=props=>{
 const en=()=>props.locale==='en-US',t=(zh:string,en:string)=>props.locale==='en-US'?en:zh
 const labels=()=>({stroke:t('描边颜色','Stroke color'),fill:t('填充颜色','Fill color'),lineWidth:t('线宽','Line width'),lineStyle:t('线型','Line style'),textColor:t('文字颜色','Text color'),fontSize:t('字号','Font size')})
 const [palette,setPalette]=createSignal<DrawingStyleControl>(),[notice,setNotice]=createSignal(''),[template,setTemplate]=createSignal(''),[narrow,setNarrow]=createSignal(false),[layout,setLayout]=createSignal({width:700,height:600,barHeight:154})
 let element:HTMLDivElement|undefined,trigger:HTMLButtonElement|undefined
 const ids=()=>props.objects.map(object=>object.logicalId)
 const selectionKey=createMemo(()=>ids().join('\0'))
 const hasObjects=createMemo(()=>props.objects.length>0)
 const closePalette=()=>{setPalette(undefined);trigger?.focus()}
 createEffect(()=>{selectionKey();setPalette(undefined);setNotice('')})
 const showResult=(result:DrawingCommandResult)=>setNotice(result.status==='completed'?'':[result.message,`${result.status}: ${result.items.filter(item=>item.status==='confirmed').length}/${result.items.length}`,...result.items.filter(item=>item.status!=='confirmed').map(item=>`${props.objects.find(object=>object.logicalId===item.logicalId)?.presentation?.name??item.logicalId}: ${item.status} ${item.message??''}`)].filter(Boolean).join(' · '))
 const send=async(command:DrawingCommand)=>showResult(await props.execute(command))
 const changeStyle=async(control:DrawingStyleControl,value:string|number,target:HTMLElement|undefined)=>{
   const selection=ids().join('\0')
   showResult(await props.onStyle(control,value))
   if(selection===ids().join('\0')&&target?.isConnected&&document.activeElement===document.body)target.focus()
 }
 const compatible=createMemo(()=>props.templates.filter(template=>props.objects.length===1&&template.toolId===props.catalog.find(tool=>tool.overlayName===props.objects[0].overlay.name)?.toolId))
 createEffect(()=>{
   if(!hasObjects())return
   let canceled=false,observer:ResizeObserver|undefined
   queueMicrotask(()=>{const parent=element?.parentElement;if(canceled||!parent)return;const measure=()=>{setNarrow(parent.clientWidth<700);setLayout({width:parent.clientWidth,height:parent.clientHeight,barHeight:element?.clientHeight??154})};observer=new ResizeObserver(measure);measure();observer.observe(parent);if(element)observer.observe(element)})
   onCleanup(()=>{canceled=true;observer?.disconnect()})
 })
 const position=createMemo(()=>{
   const size=layout(),inset=props.insetLeft??8,width=Math.min(660,size.width-inset-8),left=Math.max(inset,Math.min(props.position.x,size.width-width-8)),height=size.barHeight
   const points=props.handles.filter(point=>point.x>=left-22&&point.x<=left+width+22),clamp=(top:number)=>Math.max(8,Math.min(top,size.height-height-8))
   const candidates=[props.position.y,...(points.length?[Math.min(...points.map(point=>point.y))-height-26,Math.max(...points.map(point=>point.y))+26]:[]),8,size.height-height-8].map(clamp)
   const top=candidates.find(top=>points.every(point=>point.y<top-22||point.y>top+height+22))??candidates[0]
   return {left,top}
 })
 return <Show when={props.objects.length}><div ref={element} role="region" aria-label={t('绘图属性','Drawing properties')} class={`klinecharts-pro-overlay-property-bar${narrow()?' tc-drawing-property-docked':''}`} style={{'--tc-drawing-property-inset':`${props.insetLeft??8}px`,left:`${position().left}px`,top:`${position().top}px`}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();if(palette())closePalette();else props.onClose()}}}>
  <span>{t('已选','Selected')} {props.objects.length}</span>
  <For each={props.controls}>{control=><Show when={['stroke','fill','textColor'].includes(control)} fallback={<label>{labels()[control]}<select aria-label={labels()[control]} disabled={!!props.reason} value={props.values[control]??''} onChange={event=>void changeStyle(control,control==='lineStyle'?event.currentTarget.value:Number(event.currentTarget.value),event.currentTarget)}>
    <option value="" disabled>{t('混合','Mixed')}</option>
    <For each={styleControlOptions(control,props.values[control])}>{value=><option value={value}>{value==='solid'?t('实线','Solid'):value==='dashed'?t('虚线','Dashed'):value==='dotted'?t('点线','Dotted'):value}</option>}</For>
   </select></label>}><button type="button" disabled={!!props.reason} aria-label={labels()[control]} aria-expanded={palette()===control} onClick={event=>{const next=palette()===control?undefined:control;trigger=event.currentTarget;setPalette(next);if(next)queueMicrotask(()=>element?.querySelector<HTMLButtonElement>('.tc-drawing-color-palette button')?.focus())}}><span class="tc-drawing-color-swatch" style={{'background-color':typeof props.values[control]==='string'?String(props.values[control]):'transparent'}}/>{labels()[control]} {props.values[control]===undefined?t('混合','Mixed'):''}</button></Show>}</For>
  <button type="button" disabled={!!props.lockReason} aria-label={props.objects.every(o=>o.overlay.lock)?t('解锁绘图','Unlock drawings'):t('锁定绘图','Lock drawings')} onClick={()=>void send({type:'update',ids:ids(),patch:{overlay:{lock:!props.objects.every(o=>o.overlay.lock)}}})}>{props.objects.every(o=>o.overlay.lock)?t('解锁','Unlock'):t('锁定','Lock')}</button>
  <button type="button" disabled={!!props.reason} onClick={()=>void send({type:'delete',ids:ids()})}>{t('删除绘图','Delete drawings')}</button>
  <button type="button" onClick={props.onSettings}>{props.objects.length===1?t('绘图设置','Drawing settings'):t('管理选中对象','Manage selection')}</button>
  <select aria-label={t('快捷绘图模板','Quick drawing template')} disabled={!!props.reason||!props.templates.length} value={template()} onChange={event=>setTemplate(event.currentTarget.value)}><option value="">{props.templates.length?t('选择模板','Choose template'):t('暂无模板','No templates')}</option><For each={props.templates}>{item=><option value={item.id}>{item.name}</option>}</For></select>
  <button type="button" disabled={!!props.reason||!compatible().some(item=>item.id===template())} onClick={()=>void send({type:'template',action:'apply',ids:ids(),templateId:template()})}>{t('应用模板','Apply template')}</button>
  <button type="button" disabled={!!props.reason||!template()||!commonStyleControls([...props.objects.map(object=>props.catalog.find(tool=>tool.overlayName===object.overlay.name)),props.catalog.find(tool=>tool.toolId===props.templates.find(item=>item.id===template())?.toolId)]).length} onClick={()=>void send({type:'template',action:'apply',ids:ids(),templateId:template(),styleOnly:true})}>{t('只应用共同样式','Apply common styles only')}</button>
  <button type="button" onClick={props.onTemplates}>{t('管理模板','Manage templates')}</button>
  <button type="button" aria-label={t('关闭绘图属性','Close drawing properties')} onClick={props.onClose}>×</button>
  <Show when={props.reason||props.lockReason}><small role="status">{en()?'Selection cannot be edited: ':''}{props.reason??props.lockReason}</small></Show>
  <Show when={notice()}><small role="alert">{notice()}</small></Show>
  <Show when={palette()}>{control=><ColorPalette locale={props.locale} label={labels()[control()]} value={String(props.values[control()]??'')} transparent={control()==='fill'} choose={color=>{void changeStyle(control(),color,trigger);closePalette()}} close={closePalette}/>}</Show>
 </div></Show>
}
export default OverlayPropertyBar
