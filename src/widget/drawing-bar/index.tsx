import {createSignal,For,Show,type Component} from 'solid-js'
import type {OverlayCreate} from 'klinecharts'
import {builtinDrawingCatalog,type DrawingToolDescriptor} from '../../drawing/catalog'
import {Icon} from './icons'
import type {DrawingState} from '../../drawing/types'

export interface DrawingBarProps {
  locale:string
  catalog?:DrawingToolDescriptor[]
  state?:DrawingState
  onDrawingItemClick:(overlay:OverlayCreate)=>void
  onModeChange:(mode:string)=>void
  onLockChange:(lock:boolean)=>void
  onVisibleChange:(visible:boolean)=>void
  onRemoveClick:(groupId:string)=>void
}
const DrawingBar:Component<DrawingBarProps>=props=>{
  const [open,setOpen]=createSignal(false),[search,setSearch]=createSignal('')
  const mode=()=>props.state?.magnet??'normal',locked=()=>props.state?.preventDragging??false,visible=()=>!props.state?.hidden
  const catalog=()=>props.catalog??builtinDrawingCatalog
  const label=(tool:DrawingToolDescriptor)=>tool.labels[props.locale==='en-US'?'en-US':'zh-CN']
  const shortcut=(tool:DrawingToolDescriptor)=>props.state?.preferences?.value.shortcuts[tool.toolId]??tool.shortcut??''
  const categories=()=>[...new Set(catalog().map(t=>t.category))]
  const filtered=(category:string)=>catalog().filter(t=>t.category===category&&`${t.labels['zh-CN']} ${t.labels['en-US']} ${t.toolId}`.toLowerCase().includes(search().toLowerCase()))
  const choose=(tool:DrawingToolDescriptor)=>{props.onDrawingItemClick({name:tool.overlayName,groupId:'drawing_tools',mode:mode() as any});setOpen(false)}
  return <div class="klinecharts-pro-drawing-bar tc-drawing-bar">
    <button title={props.locale==='en-US'?'All drawing tools':'全部绘图工具'} aria-label={props.locale==='en-US'?'All drawing tools':'全部绘图工具'} aria-expanded={open()} onClick={()=>setOpen(!open())}>＋</button>
    <For each={categories()}>{category=>{
      const tool=()=>catalog().find(t=>t.category===category&&t.toolId===props.state?.toolId)??catalog().find(t=>t.category===category)!
      return <button title={`${label(tool())}${shortcut(tool())?` (${shortcut(tool())})`:''}`} aria-label={label(tool())} aria-pressed={props.state?.toolId===tool().toolId} onClick={()=>choose(tool())}><Icon name={tool().icon}/></button>
    }}</For>
    <select aria-label={props.locale==='en-US'?'Magnet mode':'吸附模式'} value={mode()} onChange={event=>props.onModeChange(event.currentTarget.value)}><option value="normal">{props.locale==='en-US'?'None':'无'}</option><option value="weak_magnet">{props.locale==='en-US'?'Weak':'弱磁'}</option><option value="strong_magnet">{props.locale==='en-US'?'Strong':'强磁'}</option></select>
    <button aria-label={props.locale==='en-US'?'Prevent dragging':'防误拖动'} aria-pressed={locked()} onClick={()=>props.onLockChange(!locked())}><Icon name={locked()?'lock':'unlock'}/></button>
    <button aria-label={props.locale==='en-US'?'Temporarily hide drawings':'暂时隐藏绘图'} aria-pressed={!visible()} onClick={()=>props.onVisibleChange(!visible())}><Icon name={visible()?'visible':'invisible'}/></button>
    <Show when={open()}><section class="tc-drawing-tool-picker" aria-label={props.locale==='en-US'?'Drawing tools':'绘图工具'} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false)}}}>
      <input aria-label={props.locale==='en-US'?'Search drawing tools':'搜索绘图工具'} value={search()} onInput={event=>setSearch(event.currentTarget.value)} placeholder={props.locale==='en-US'?'Search tools':'搜索工具'}/>
      <For each={categories()}>{category=><Show when={filtered(category).length}><div class="tc-drawing-tool-category">{category}</div><For each={filtered(category)}>{tool=><button onClick={()=>choose(tool)} aria-pressed={props.state?.toolId===tool.toolId} title={shortcut(tool)}><Icon name={tool.icon}/><span>{label(tool)}</span><kbd>{shortcut(tool)}</kbd></button>}</For></Show>}</For>
      <Show when={!catalog().some(t=>`${t.labels['zh-CN']} ${t.labels['en-US']} ${t.toolId}`.toLowerCase().includes(search().toLowerCase()))}><p>{props.locale==='en-US'?'No matching tools':'没有匹配工具'}</p></Show>
      <button onClick={()=>setOpen(false)}>{props.locale==='en-US'?'Close':'关闭'}</button>
    </section></Show>
  </div>
}
export default DrawingBar
