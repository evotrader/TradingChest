import {createSignal,For,Show,type Component} from 'solid-js'
import type {OverlayCreate} from 'klinecharts'
import {builtinDrawingCatalog,type DrawingToolDescriptor} from '../../drawing/catalog'
import {Icon} from './icons'
import type {DrawingCommand,DrawingCommandResult,DrawingState} from '../../drawing/types'

export interface DrawingBarProps {
  locale:string
  catalog?:DrawingToolDescriptor[]
  state?:DrawingState
  execute?:(command:DrawingCommand)=>Promise<DrawingCommandResult>
  onDrawingItemClick:(overlay:OverlayCreate)=>void
  onModeChange:(mode:string)=>void
  onLockChange:(lock:boolean)=>void
  onVisibleChange:(visible:boolean)=>void
  onRemoveClick:(groupId:string)=>void
}
const DrawingBar:Component<DrawingBarProps>=props=>{
  const [panel,setPanel]=createSignal<'tools'|'snapping'|null>(null),[search,setSearch]=createSignal('')
  const [templateIds,setTemplateIds]=createSignal<Record<string,string>>({})
  let toolsTrigger:HTMLButtonElement|undefined,snappingTrigger:HTMLButtonElement|undefined,searchInput:HTMLInputElement|undefined
  const en=()=>props.locale==='en-US'
  const mode=()=>props.state?.magnet??'normal',locked=()=>props.state?.preventDragging??false,visible=()=>!props.state?.hidden
  const catalog=()=>props.catalog??builtinDrawingCatalog
  const preferences=()=>props.state?.preferences?.value
  const label=(tool:DrawingToolDescriptor)=>tool.labels[en()?'en-US':'zh-CN']
  const shortcut=(tool:DrawingToolDescriptor)=>preferences()?.shortcuts[tool.toolId]??tool.shortcut??''
  const categories=()=>[...new Set(catalog().map(tool=>tool.category))]
  const matches=(tool:DrawingToolDescriptor)=>`${tool.labels['zh-CN']} ${tool.labels['en-US']} ${tool.toolId}`.toLowerCase().includes(search().toLowerCase())
  const filtered=(category:string)=>catalog().filter(tool=>tool.category===category&&matches(tool)&&!recent().some(value=>value.toolId===tool.toolId))
  const recent=()=>(preferences()?.recent??[]).slice(0,12).flatMap(id=>{const tool=catalog().find(tool=>tool.toolId===id);return tool&&matches(tool)?[tool]:[]})
  const close=()=>{const trigger=panel()==='tools'?toolsTrigger:snappingTrigger;setPanel(null);queueMicrotask(()=>{if(trigger?.isConnected)trigger.focus()})}
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();close()}}
  const choose=(tool:DrawingToolDescriptor,templateId?:string)=>{
    if(props.execute)void props.execute({type:'tool',toolId:tool.toolId,...templateId?{templateId}:{}})
    else props.onDrawingItemClick({name:tool.overlayName,groupId:'drawing_tools',mode:mode() as any})
    close()
  }
  const templates=(tool:DrawingToolDescriptor)=>preferences()?.templates.filter(template=>template.toolId===tool.toolId)??[]
  const selectedTemplate=(tool:DrawingToolDescriptor)=>templates(tool).some(template=>template.id===templateIds()[tool.toolId])?templateIds()[tool.toolId]:''
  const favorite=(id:string)=>preferences()?.favorites.includes(id)??false
  const toggleFavorite=(id:string)=>{const current=preferences();if(current)void props.execute?.({type:'preferences',patch:{favorites:favorite(id)?current.favorites.filter(value=>value!==id):[...current.favorites,id]}})}
  const row=(tool:DrawingToolDescriptor)=><div class="tc-drawing-tool-row">
    <button class="tc-drawing-tool-choice" onClick={()=>choose(tool)} aria-pressed={props.state?.toolId===tool.toolId} title={shortcut(tool)}><Icon name={tool.icon}/><span>{label(tool)}</span><kbd>{shortcut(tool)}</kbd></button>
    <Show when={preferences()&&props.execute}><button class="tc-drawing-tool-favorite" aria-label={`${favorite(tool.toolId)?en()?'Unfavorite':'取消收藏':en()?'Favorite':'收藏'} ${label(tool)}`} aria-pressed={favorite(tool.toolId)} onClick={event=>{event.stopPropagation();toggleFavorite(tool.toolId)}}>{favorite(tool.toolId)?'★':'☆'}</button></Show>
    <Show when={templates(tool).length&&props.execute}><div class="tc-drawing-tool-template">
      <select aria-label={`${label(tool)} ${en()?'Pre-draw template':'绘前模板'}`} value={selectedTemplate(tool)} onChange={event=>{const id=event.currentTarget.value;setTemplateIds(value=>({...value,[tool.toolId]:id}))}}><option value="">{en()?'Choose a template':'选择模板'}</option><For each={templates(tool)}>{template=><option value={template.id}>{template.name}</option>}</For></select>
      <button disabled={!selectedTemplate(tool)} onClick={()=>choose(tool,selectedTemplate(tool))}>{en()?'Draw with template':'使用模板绘制'}</button>
    </div></Show>
  </div>
  return <div class="klinecharts-pro-drawing-bar tc-drawing-bar">
    <button ref={toolsTrigger} title={en()?'All drawing tools':'全部绘图工具'} aria-label={en()?'All drawing tools':'全部绘图工具'} aria-expanded={panel()==='tools'} onClick={()=>{if(panel()==='tools')close();else{setPanel('tools');queueMicrotask(()=>{if(searchInput?.isConnected)searchInput.focus()})}}}>+</button>
    <For each={categories()}>{category=>{
      const tool=()=>catalog().find(tool=>tool.category===category&&tool.toolId===props.state?.toolId)??(preferences()?.recent??[]).map(id=>catalog().find(tool=>tool.toolId===id&&tool.category===category)).find(Boolean)??catalog().find(tool=>tool.category===category)!
      return <button title={`${label(tool())}${shortcut(tool())?` (${shortcut(tool())})`:''}`} aria-label={label(tool())} aria-pressed={props.state?.toolId===tool().toolId} onClick={()=>choose(tool())}><Icon name={tool().icon}/></button>
    }}</For>
    <select aria-label={en()?'Magnet mode':'吸附模式'} value={mode()} onChange={event=>props.onModeChange(event.currentTarget.value)}><option value="normal">{en()?'None':'无'}</option><option value="weak_magnet">{en()?'Weak':'弱磁'}</option><option value="strong_magnet">{en()?'Strong':'强磁'}</option></select>
    <Show when={preferences()&&props.execute}>
      <button aria-label={en()?'Continuous drawing':'连续绘制'} aria-pressed={props.state?.toolId?props.state.continuous:preferences()?.ui.continuous} onClick={()=>void props.execute?.({type:'preferences',patch:{ui:{continuous:!(props.state?.toolId?props.state.continuous:preferences()?.ui.continuous)}}})}>↻</button>
      <button ref={snappingTrigger} aria-label={en()?'Snap settings':'吸附设置'} aria-expanded={panel()==='snapping'} onClick={()=>panel()==='snapping'?close():setPanel('snapping')}>⌖</button>
    </Show>
    <button aria-label={en()?'Prevent dragging':'防误拖动'} aria-pressed={locked()} onClick={()=>props.onLockChange(!locked())}><Icon name={locked()?'lock':'unlock'}/></button>
    <button aria-label={en()?'Temporarily hide drawings':'暂时隐藏绘图'} aria-pressed={!visible()} onClick={()=>props.onVisibleChange(!visible())}><Icon name={visible()?'visible':'invisible'}/></button>
    <Show when={panel()==='tools'}><section class="tc-drawing-tool-picker" aria-label={en()?'Drawing tools':'绘图工具'} on:keydown={escape}>
      <input ref={searchInput} aria-label={en()?'Search drawing tools':'搜索绘图工具'} value={search()} onInput={event=>setSearch(event.currentTarget.value)} placeholder={en()?'Search tools':'搜索工具'}/>
      <Show when={recent().length}><div class="tc-drawing-tool-category">{en()?'Recent':'最近使用'}</div><div class="tc-drawing-tool-recent"><For each={recent()}>{row}</For></div></Show>
      <For each={categories()}>{category=><Show when={filtered(category).length}><div class="tc-drawing-tool-category">{category}</div><For each={filtered(category)}>{row}</For></Show>}</For>
      <Show when={!catalog().some(matches)}><p>{en()?'No matching tools':'没有匹配工具'}</p></Show>
      <button onClick={close}>{en()?'Close':'关闭'}</button>
    </section></Show>
    <Show when={panel()==='snapping'&&preferences()}><section class="tc-drawing-snap-settings" aria-label={en()?'Snap settings':'吸附设置'} on:keydown={escape}>
      <label><input type="checkbox" checked={preferences()!.ui.snapping.ohlc} onChange={event=>void props.execute?.({type:'preferences',patch:{ui:{snapping:{ohlc:event.currentTarget.checked}}}})}/>{en()?'OHLC prices':'K 线价格'}</label>
      <label><input type="checkbox" checked={preferences()!.ui.snapping.indicators} onChange={event=>void props.execute?.({type:'preferences',patch:{ui:{snapping:{indicators:event.currentTarget.checked}}}})}/>{en()?'Visible indicators':'可见指标'}</label>
      <label>{en()?'Weak snap distance':'弱磁距离'}<select aria-label={en()?'Weak snap distance':'弱磁距离'} value={preferences()!.ui.snapping.weakSensitivity} onChange={event=>void props.execute?.({type:'preferences',patch:{ui:{snapping:{weakSensitivity:Number(event.currentTarget.value) as 4|8|12|16}}}})}><For each={[4,8,12,16]}>{value=><option value={value}>{value} px</option>}</For></select></label>
      <Show when={!preferences()!.ui.snapping.ohlc&&!preferences()!.ui.snapping.indicators}><p role="status">{en()?'No snap sources selected':'未选择吸附来源'}</p></Show>
      <button onClick={close}>{en()?'Close':'关闭'}</button>
    </section></Show>
  </div>
}
export default DrawingBar
