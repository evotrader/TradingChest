import {createMemo,createSignal,onCleanup,For,Show,type Component} from 'solid-js'
import {ColorPalette} from '../overlay-property-bar/ColorPalette'
import {styleControlOptions} from '../../drawing/styleControls'
import {resolveDrawingLevels,instantiateDrawingLevelPreset,validateDrawingLevelSet,type DrawingLevel,type DrawingLevelInput,type DrawingLevelSet} from '../../drawing/levels'

/** Transient form strings are never written to a drawing or preference document. */
export type DrawingLevelDraft=Omit<DrawingLevel,'value'>&{value:string}
export const createDrawingLevelDraft=(value:DrawingLevelInput,defaults:Exclude<DrawingLevelInput,undefined>):DrawingLevelDraft[]=>resolveDrawingLevels(value,defaults).items.map(level=>({...level,value:String(level.value)}))
export function parseDrawingLevelRatio(value:string):number {
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())||!Number.isFinite(Number(value))||Number(value)===0&&/[1-9]/.test(value.split(/[eE]/)[0]))throw Error('请输入可表示的有限级别比例，例如 0.618 或 1e2')
 return Number(value)
}
export function drawingLevelsFromDraft(items:DrawingLevelDraft[]):DrawingLevelSet {
 const value:DrawingLevelSet={version:1,items:items.map(item=>({...item,value:parseDrawingLevelRatio(item.value)}))}
 validateDrawingLevelSet(value);return value
}
export function drawingLevelDraftChanged(items:DrawingLevelDraft[],before:DrawingLevelInput,defaults:Exclude<DrawingLevelInput,undefined>):boolean {
 const actual=drawingLevelsFromDraft(items),original=resolveDrawingLevels(before,defaults)
 const content=(value:DrawingLevelSet)=>value.items.map(item=>[item.id,item.value,item.visible,item.color??null,item.width??null,item.style??null,item.text??''])
 return JSON.stringify(content(actual))!==JSON.stringify(content(original))
}

const LevelEditor:Component<{locale:string;label:string;items:DrawingLevelDraft[];inheritedColor?:string;change:(items:DrawingLevelDraft[])=>void}>=props=>{
 const t=(zh:string,en:string)=>props.locale==='en-US'?en:zh,rows=createMemo(()=>new Map(props.items.map(item=>[item.id,item]))),[palette,setPalette]=createSignal<string>()
 let colorTrigger:HTMLButtonElement|undefined,addButton:HTMLButtonElement|undefined
 const rowNodes=new Map<string,HTMLFieldSetElement>()
 onCleanup(()=>rowNodes.clear())
 const closeColor=()=>{setPalette(undefined);queueMicrotask(()=>{if(colorTrigger?.isConnected)colorTrigger.focus()})}
 const patch=(id:string,values:Partial<Omit<DrawingLevelDraft,'id'>>)=>props.change(props.items.map(item=>{
  if(item.id!==id)return item
  const next={...item,...values};for(const key of Object.keys(values))if((values as any)[key]===undefined)delete (next as any)[key]
  return next
 }))
 const move=(id:string,by:number)=>{const items=[...props.items],index=items.findIndex(item=>item.id===id),target=index+by;if(index<0||target<0||target>=items.length)return;items.splice(target,0,...items.splice(index,1));props.change(items)}
 const remove=(id:string)=>{
  if(props.items.length<=1)return
  const index=props.items.findIndex(item=>item.id===id),item=props.items[index];if(!item)return
  if(item.text?.length&&!window.confirm(t('删除此级别及其正文？确认修改后可撤销。','Delete this level and its text? You can undo after confirming the changes.')))return
  const next=props.items[index+1]?.id??props.items[index-1]?.id;setPalette(undefined);props.change(props.items.filter(item=>item.id!==id))
  queueMicrotask(()=>{const target=next&&rowNodes.get(next)?.querySelector<HTMLInputElement>('input');if(target)target.focus();else addButton?.focus()})
 }
 return <div class="tc-drawing-level-editor" role="group" aria-label={`${props.label} ${t('列表','list')}`} onKeyDown={event=>{if(event.isComposing&&event.key==='Enter'){event.preventDefault();event.stopPropagation()}}}>
  <p>{t('保留 1–64 级；比例可为负数、外延值或重复值。空外观选项继承对象样式。','Keep 1–64 levels. Negative, extended and repeated ratios are supported. Unset appearance inherits the object style.')}</p>
  <For each={props.items.map(item=>item.id)}>{(id,index)=>{
   const initial=rows().get(id)!,row=()=>rows().get(id)??initial,value=createMemo(()=>row().value),text=createMemo(()=>row().text??''),color=createMemo(()=>row().color),width=createMemo(()=>row().width),style=createMemo(()=>row().style),visible=createMemo(()=>row().visible)
   const label=(zh:string,en:string)=>`${props.label} ${index()+1} ${t(zh,en)}`
   const valid=()=>{try{parseDrawingLevelRatio(value());return true}catch{return false}}
   onCleanup(()=>rowNodes.delete(id))
   return <fieldset ref={node=>rowNodes.set(id,node)} aria-label={`${props.label} ${index()+1}`}>
    <legend>{props.label} {index()+1}</legend>
    <label>{t('比例','Ratio')}<input type="text" inputmode="decimal" required aria-label={label('比例','ratio')} aria-invalid={!valid()} value={value()} onInput={event=>patch(id,{value:event.currentTarget.value})}/></label>
    <label><input type="checkbox" aria-label={label('显示','visible')} checked={visible()} onChange={event=>patch(id,{visible:event.currentTarget.checked})}/>{t('显示','Visible')}</label>
    <div class="tc-drawing-level-color"><button type="button" aria-label={label('颜色','color')} aria-expanded={palette()===id} onClick={event=>{colorTrigger=event.currentTarget;setPalette(palette()===id?undefined:id);if(palette())queueMicrotask(()=>colorTrigger?.parentElement?.querySelector<HTMLButtonElement>('.tc-drawing-color-palette button')?.focus())}}>{color()??t('继承颜色','Inherit color')}</button><button type="button" disabled={color()===undefined} aria-label={label('恢复颜色继承','inherit color')} onClick={()=>patch(id,{color:undefined})}>{t('恢复继承','Inherit')}</button>
    <Show when={palette()===id}><ColorPalette locale={props.locale} label={label('颜色','color')} value={color()??props.inheritedColor??''} transparent choose={value=>{patch(id,{color:value});closeColor()}} close={closeColor}/></Show></div>
    <label>{t('线宽','Width')}<select aria-label={label('线宽','width')} value={width()??''} onChange={event=>patch(id,{width:event.currentTarget.value?Number(event.currentTarget.value):undefined})}><option value="">{t('继承对象','Inherit object')}</option><For each={styleControlOptions('lineWidth',width()).filter(value=>typeof value==='number'&&value>=1&&value<=4)}>{value=><option value={value}>{value}</option>}</For></select></label>
    <label>{t('线型','Line style')}<select aria-label={label('线型','line style')} value={style()??''} onChange={event=>patch(id,{style:(event.currentTarget.value||undefined) as DrawingLevel['style']})}><option value="">{t('继承对象','Inherit object')}</option><option value="solid">{t('实线','Solid')}</option><option value="dashed">{t('虚线','Dashed')}</option><option value="dotted">{t('点线','Dotted')}</option></select></label>
    <label>{t('正文','Text')}<input type="text" maxlength={500} aria-label={label('正文','text')} value={text()} onInput={event=>patch(id,{text:event.currentTarget.value})}/></label>
    <div class="tc-drawing-level-actions"><button type="button" aria-label={label('上移','move up')} disabled={index()===0} onClick={()=>move(id,-1)}>↑</button><button type="button" aria-label={label('下移','move down')} disabled={index()===props.items.length-1} onClick={()=>move(id,1)}>↓</button><button type="button" aria-label={label('删除','delete')} disabled={props.items.length<=1} title={props.items.length<=1?t('至少保留一级','Keep at least one level'):undefined} onClick={()=>remove(id)}>{t('删除级别','Delete level')}</button></div>
   </fieldset>
  }}</For>
  <button ref={addButton} type="button" disabled={props.items.length>=64} title={props.items.length>=64?t('最多 64 级','At most 64 levels'):undefined} onClick={()=>{const level=instantiateDrawingLevelPreset({version:1,items:[{value:1,visible:true}]}).items[0];props.change([...props.items,{...level,value:String(level.value)}])}}>{t('添加级别','Add level')}</button>
 </div>
}
export default LevelEditor
