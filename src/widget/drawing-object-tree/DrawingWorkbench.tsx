import {createMemo,createSignal,For,Show,type Component} from 'solid-js'
import type {DrawingCommand,DrawingCommandResult,DrawingSnapshot,DrawingState,DrawingAnchor} from '../../drawing/types'
import type {DrawingToolDescriptor} from '../../drawing/catalog'
import type {Period} from '../../types'

export interface DrawingWorkbenchProps {
  locale:string
  state:DrawingState
  catalog:DrawingToolDescriptor[]
  period:Period
  periods:Period[]
  tickSize?:number
  execute:(command:DrawingCommand)=>Promise<DrawingCommandResult>
  locate:(object:DrawingSnapshot)=>void
  convertAnchor:(object:DrawingSnapshot,index:number,kind:DrawingAnchor['kind'])=>DrawingAnchor
  onClose:()=>void
}
const clone=<T,>(value:T):T=>structuredClone(value)
const DrawingWorkbench:Component<DrawingWorkbenchProps>=props=>{
  const en=()=>props.locale==='en-US',t=(zh:string,enText:string)=>en()?enText:zh
  const [tab,setTab]=createSignal<'objects'|'settings'|'templates'|'preferences'>('objects'),[query,setQuery]=createSignal(''),[limit,setLimit]=createSignal(100),[groupName,setGroupName]=createSignal(''),[templateName,setTemplateName]=createSignal(''),[templateId,setTemplateId]=createSignal(''),[notice,setNotice]=createSignal('')
  const [draft,setDraft]=createSignal<DrawingSnapshot>(),[original,setOriginal]=createSignal<DrawingSnapshot>(),[text,setText]=createSignal('')
  const objects=createMemo(()=>new Map(props.state.objects.map(object=>[object.logicalId,object])))
  const tool=(object:DrawingSnapshot)=>props.catalog.find(t=>t.overlayName===object.overlay.name)
  const label=(object:DrawingSnapshot)=>object.presentation?.name||tool(object)?.labels[en()?'en-US':'zh-CN']||object.overlay.name
  const filtered=createMemo(()=>props.state.objects.filter(object=>`${label(object)} ${object.overlay.name} ${object.logicalId} ${object.presentation?.groupName??''}`.toLowerCase().includes(query().toLowerCase())).sort((a,b)=>(b.presentation?.order??0)-(a.presentation?.order??0)))
  const selected=()=>props.state.selectedIds
  const send=async(command:DrawingCommand)=>{const result=await props.execute(command);setNotice(result.message??(result.status==='completed'?'':`${result.status}: ${result.items.filter(i=>i.status==='confirmed').length}/${result.items.length}`));return result}
  const edit=(object:DrawingSnapshot)=>{void send({type:'select',ids:[object.logicalId]});setDraft(clone(object));setOriginal(clone(object));setText(typeof object.overlay.extendData==='string'?object.overlay.extendData:String((object.overlay.extendData as any)?.text??''));setTab('settings');setNotice('')}
  const style=(group:string,key:string,value:unknown)=>{const d=clone(draft()!);d.overlay.styles={...d.overlay.styles,[group]:{...(d.overlay.styles as any)?.[group],[key]:value}};setDraft(d)}
  const anchor=(index:number,key:string,value:unknown)=>{const d=clone(draft()!);(d.anchors![index] as any)[key]=value;setDraft(d)}
  const confirm=async()=>{
    const d=draft(),base=original();if(!d||!base)return
    const patch:Extract<DrawingCommand,{type:'update'}>['patch']={}
    const styles:any={}
    for(const [group,fields] of Object.entries(d.overlay.styles??{})){
      if(fields&&typeof fields==='object'&&!Array.isArray(fields)){for(const [key,value] of Object.entries(fields))if(JSON.stringify(value)!==JSON.stringify((base.overlay.styles as any)?.[group]?.[key])){styles[group]??={};styles[group][key]=clone(value)}}
      else if(JSON.stringify(fields)!==JSON.stringify((base.overlay.styles as any)?.[group]))styles[group]=clone(fields)
    }
    if(Object.keys(styles).length)patch.overlay={styles}
    if(JSON.stringify(d.anchors)!==JSON.stringify(base.anchors))patch.anchors=d.anchors
    if(JSON.stringify(d.parameters)!==JSON.stringify(base.parameters))patch.parameters=Object.fromEntries(Object.entries(d.parameters??{}).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(base.parameters?.[key])))
    if(JSON.stringify(d.presentation)!==JSON.stringify(base.presentation))patch.presentation=Object.fromEntries(Object.entries(d.presentation??{}).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify((base.presentation as any)?.[key])))
    if(d.yAxisId!==base.yAxisId)patch.yAxisId=d.yAxisId
    const previous=typeof base.overlay.extendData==='string'?base.overlay.extendData:String((base.overlay.extendData as any)?.text??'')
    if(text()!==previous)patch.text=text()
    if(!Object.keys(patch).length){setTab('objects');return}
    const result=await send({type:'update',ids:[d.logicalId],patch})
    if(result.status==='completed'){setTab('objects');setDraft(undefined);setOriginal(undefined)}
  }
  const intervalChecked=(period:Period)=>{const filter=draft()?.presentation?.intervals;return filter?.kind==='list'&&filter.periods.some(p=>p.multiplier===period.multiplier&&p.timespan===period.timespan)}
  const prefs=()=>props.state.preferences
  const templates=()=>prefs()?.value.templates??[]
  const toggleFavorite=(id:string)=>{const favorites=prefs()?.value.favorites??[];void send({type:'preferences',patch:{favorites:favorites.includes(id)?favorites.filter(v=>v!==id):[...favorites,id]}})}
  return <aside class="tc-drawing-workbench" aria-label={t('绘图管理','Drawing manager')} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();props.onClose()}}}>
    <header><strong>{t('绘图管理','Drawing manager')}</strong><button aria-label={t('关闭绘图管理','Close drawing manager')} onClick={()=>props.onClose()}>×</button></header>
    <nav aria-label={t('绘图管理页面','Drawing manager pages')}><For each={['objects','settings','templates','preferences'] as const}>{key=><button aria-pressed={tab()===key} disabled={key==='settings'&&!draft()} onClick={()=>setTab(key)}>{({objects:t('对象','Objects'),settings:t('设置','Settings'),templates:t('模板','Templates'),preferences:t('偏好','Preferences')})[key]}</button>}</For></nav>
    <Show when={notice()}><p role="alert">{notice()}</p></Show>
    <Show when={props.state.history.pending}><p role="status">{t('正在确认，请稍候','Confirming, please wait')}</p></Show>
    <Show when={props.state.history.uncertainLogicalIds.length}><p role="alert">{t('部分提交结果待确认，请刷新宿主标注；不会自动重发','Some submissions are uncertain. Refresh host annotations; writes are never replayed automatically.')}</p></Show>
    <fieldset><legend>{t('绘图作用域','Drawing scope')}</legend>
      <select aria-label={t('新绘图作用域','Scope for new drawings')} value={props.state.scope} onChange={e=>void send({type:'scope',scope:e.currentTarget.value as any})}>
        <option value="chart">{t('本图','This chart')}</option><option value="workspace" disabled={!props.state.sharing?.workspace}>{t('当前工作台','This workspace')}</option><option value="host" disabled={!props.state.sharing?.host}>{t('宿主共享','Host shared')}</option>
      </select>
      <For each={['chart','workspace','host'] as const}>{scope=><button disabled={!selected().length||scope!=='chart'&&!props.state.sharing?.[scope]} onClick={()=>void send({type:'transfer',ids:selected(),scope})}>{t('移至','Move to')} {({chart:t('本图','This chart'),workspace:t('工作台','Workspace'),host:t('宿主共享','Host shared')})[scope]}</button>}</For>
      <Show when={props.state.sharing?.reason}><p role="status">{props.state.sharing?.reason}</p></Show>
      <For each={['workspace','host'] as const}>{scope=><Show when={props.state.sharing?.[scope]}>{state=><p role="status">{scope}: {state().status} {state().message}<Show when={scope==='host'}><button disabled={!props.state.sharing?.canSaveAs||['saving','loading','uncertain'].includes(state().status)} onClick={()=>void send({type:'shared',scope,action:'save-as'})}>{t('另存共享草稿','Save shared draft as')}</button><button disabled={['saving','loading','uncertain'].includes(state().status)} onClick={()=>void send({type:'shared',scope,action:'save'})}>{t('保存共享绘图','Save shared drawings')}</button><button onClick={()=>void send({type:'shared',scope,action:'refresh'})}>{t('刷新共享文档','Refresh shared document')}</button><button onClick={()=>{if(window.confirm(t('丢弃尚未保存的共享绘图草稿并读取远端文档？','Discard unsaved shared drafts and read the stored document?')))void send({type:'shared',scope,action:'discard-refresh'})}}>{t('丢弃草稿并刷新','Discard draft and refresh')}</button></Show></p>}</Show>}</For>
    <For each={props.state.sharing?.host?.recoveries??[]}>{record=><p>{t('可恢复已移出的绘图','Recover moved drawings')}: {record.count} · {record.scope}<button onClick={()=>void send({type:'recover-transfer',id:record.id,scope:record.scope})}>{t('完成原目标恢复','Complete original recovery')}</button></p>}</For>
    </fieldset>
    <Show when={tab()==='objects'}>
      <input aria-label={t('搜索绘图对象','Search drawing objects')} placeholder={t('搜索名称、工具或分组','Search name, tool, or group')} value={query()} onInput={event=>{setQuery(event.currentTarget.value);setLimit(100)}}/>
      <p>{t('已选择','Selected')} {selected().length} / {props.state.objects.length}</p>
      <div class="tc-drawing-actions">
        <button onClick={()=>void send({type:'select',ids:filtered().map(o=>o.logicalId)})}>{t('选择搜索结果','Select results')}</button>
        <button onClick={()=>void send({type:'select',ids:[]})}>{t('清空选择','Clear selection')}</button>
        <button disabled={!selected().length} onClick={()=>void send({type:'duplicate',ids:selected()})}>{t('克隆','Duplicate')}</button>
        <button disabled={!selected().length} onClick={()=>void send({type:'copy',ids:selected()})}>{t('复制','Copy')}</button>
        <button onClick={()=>void send({type:'paste'})}>{t('粘贴','Paste')}</button>
        <button disabled={!selected().length} onClick={()=>void send({type:'delete',ids:selected()})}>{t('删除选中对象','Delete selected')}</button>
      </div>
      <div class="tc-drawing-actions"><input aria-label={t('分组名称','Group name')} value={groupName()} onInput={event=>setGroupName(event.currentTarget.value)}/><button disabled={selected().length<2||!groupName().trim()} onClick={()=>void send({type:'group',ids:selected(),name:groupName()})}>{t('分组','Group')}</button><button disabled={!selected().length} onClick={()=>void send({type:'ungroup',ids:selected()})}>{t('解组','Ungroup')}</button></div>
      <div class="tc-drawing-actions"><For each={['front','back','up','down'] as const}>{direction=><button disabled={!selected().length} onClick={()=>void send({type:'reorder',ids:selected(),direction})}>{({front:t('置顶','Front'),back:t('置底','Back'),up:t('上移','Forward'),down:t('下移','Backward')})[direction]}</button>}</For></div>
      <Show when={!props.state.objects.length}><p>{t('暂无绘图，请从左侧选择工具后在图中绘制','No drawings. Choose a tool and draw on the chart.')}</p></Show>
      <Show when={props.state.objects.length&&!filtered().length}><p>{t('没有匹配的绘图','No matching drawings')}</p></Show>
      <div role="tree" aria-label={t('绘图对象','Drawing objects')} aria-multiselectable="true"><For each={filtered().slice(0,limit()).map(o=>o.logicalId)}>{id=>{
        const object=()=>objects().get(id)!
        return <div role="treeitem" aria-selected={selected().includes(id)} class="tc-drawing-object" data-drawing-id={id}>
          <label><input type="checkbox" aria-label={`${t('选择','Select')} ${label(object())}`} checked={selected().includes(id)} onChange={event=>void send({type:'select',ids:event.currentTarget.checked?[...selected(),id]:selected().filter(v=>v!==id)})}/></label>
          <button class="tc-drawing-object-name" onClick={event=>{void send({type:'select',ids:[id],additive:event.ctrlKey||event.metaKey||event.shiftKey});props.locate(object())}}>{label(object())}<small>{object().presentation?.groupName??t('未分组','Ungrouped')} · {object().overlay.paneId==='candle_pane'?t('主图','Price pane'):object().overlay.paneId??t('主图','Price pane')} · {object().owner==='backend'?t('后端标注','Host annotation'):t('本地绘图','Local drawing')}</small></button>
          <button aria-label={`${object().overlay.visible?t('隐藏','Hide'):t('显示','Show')} ${label(object())}`} onClick={()=>void send({type:'update',ids:[id],patch:{overlay:{visible:!object().overlay.visible}}})}>{object().overlay.visible?'◉':'○'}</button>
          <button aria-label={`${object().overlay.lock?t('解锁','Unlock'):t('锁定','Lock')} ${label(object())}`} onClick={()=>void send({type:'update',ids:[id],patch:{overlay:{lock:!object().overlay.lock}}})}>{object().overlay.lock?'🔒':'🔓'}</button>
          <button aria-label={`${t('编辑','Edit')} ${label(object())}`} onClick={()=>edit(object())}>⚙</button>
          <Show when={props.state.history.projectionErrors?.[id]}><small role="status">{props.state.history.projectionErrors?.[id]}</small></Show>
        </div>
      }}</For></div>
      <Show when={filtered().length>limit()}><button onClick={()=>setLimit(limit()+100)}>{t('显示更多','Show more')} ({filtered().length-limit()})</button></Show>
      <For each={props.state.groups}>{group=><fieldset><legend>{group.name}</legend><button onClick={()=>void send({type:'select',ids:props.state.objects.filter(d=>d.presentation?.groupId===group.id).map(d=>d.logicalId)})}>{t('选择组','Select group')}</button><button onClick={()=>void send({type:'update',ids:props.state.objects.filter(d=>d.presentation?.groupId===group.id).map(d=>d.logicalId),patch:{overlay:{visible:false}}})}>{t('隐藏组','Hide group')}</button><button onClick={()=>void send({type:'update',ids:props.state.objects.filter(d=>d.presentation?.groupId===group.id).map(d=>d.logicalId),patch:{overlay:{visible:true}}})}>{t('显示组','Show group')}</button></fieldset>}</For>
    </Show>
    <Show when={tab()==='settings'&&draft()}>{_=>{
      const d=()=>draft()!,descriptor=()=>tool(d())
      return <form onSubmit={event=>{event.preventDefault();void confirm()}}>
        <label>{t('对象名称','Object name')}<input value={d().presentation?.name??''} placeholder={label(d())} onInput={event=>setDraft({...d(),presentation:{...d().presentation,name:event.currentTarget.value}})}/></label>
        <fieldset><legend>{t('样式','Style')}</legend>
          <label>{t('线条颜色','Line color')}<input type="color" value={/^#[a-f0-9]{6}$/i.test(d().overlay.styles?.line?.color??'')?d().overlay.styles!.line!.color:'#1677ff'} onInput={event=>{style('line','color',event.currentTarget.value);style('text','color',event.currentTarget.value)}}/></label>
          <label>{t('线宽','Line width')}<select value={d().overlay.styles?.line?.size??1} onChange={event=>style('line','size',Number(event.currentTarget.value))}><For each={[1,2,3,4,6,8,14]}>{value=><option value={value}>{value}px</option>}</For></select></label>
          <label>{t('线型','Line style')}<select value={d().overlay.styles?.line?.style??'solid'} onChange={event=>style('line','style',event.currentTarget.value)}><option value="solid">{t('实线','Solid')}</option><option value="dashed">{t('虚线','Dashed')}</option></select></label>
          <label>{t('填充颜色','Fill color')}<input type="color" onInput={event=>{style('polygon','color',event.currentTarget.value);style('polygon','style','stroke_fill')}}/></label>
        </fieldset>
        <Show when={descriptor()?.settings.includes('text')}><fieldset><legend>{t('文字','Text')}</legend><textarea rows={4} aria-label={t('标注正文','Drawing text')} value={text()} onInput={event=>setText(event.currentTarget.value)}/><label>{t('字体','Font')}<select value={d().overlay.styles?.text?.family??'sans-serif'} onChange={event=>style('text','family',event.currentTarget.value)}><For each={['sans-serif','serif','monospace']}>{value=><option value={value}>{value}</option>}</For></select></label><label>{t('字号','Font size')}<select value={d().overlay.styles?.text?.size??12} onChange={event=>style('text','size',Number(event.currentTarget.value))}><For each={[10,12,14,16,20,24,32]}>{value=><option value={value}>{value}</option>}</For></select></label><label>{t('对齐','Alignment')}<select value={String(d().parameters?.textAlign??'left')} onChange={event=>setDraft({...d(),parameters:{...d().parameters,textAlign:event.currentTarget.value}})}><For each={['left','center','right']}>{value=><option value={value}>{value}</option>}</For></select></label></fieldset></Show>
        <Show when={d().anchors?.length}><fieldset><legend>{t('坐标','Coordinates')}</legend><Show when={props.tickSize!==undefined}><small>Tick: {props.tickSize}</small></Show><For each={d().anchors}>{(point,index)=><div class="tc-drawing-coordinate"><strong>{index()+1}</strong><select aria-label={`${t('锚点模式','Anchor mode')} ${index()+1}`} value={point.kind} onChange={event=>{try{const next=clone(d());next.anchors![index()]=props.convertAnchor(next,index(),event.currentTarget.value as DrawingAnchor['kind']);setDraft(next)}catch(error){setNotice(String(error))}}}><option value="market">{t('市场时间','Market time')}</option><option value="logical">{t('逻辑根数','Logical bars')}</option><option value="viewport">{t('视口位置','Viewport position')}</option></select>
          <Show when={point.kind==='market'}><label>UTC<input type="datetime-local" required step="0.001" value={point.kind==='market'?new Date(point.timestamp).toISOString().slice(0,23):''} onChange={event=>anchor(index(),'timestamp',new Date(`${event.currentTarget.value}Z`).getTime())}/></label></Show>
          <Show when={point.kind==='logical'}><label>{t('参考时刻','Reference UTC')}<span>{point.kind==='logical'?new Date(point.referenceTimestamp).toISOString():''}</span></label><label>{t('后续根数','Bar offset')}<input type="number" required step="any" value={point.kind==='logical'?point.offsetBars:0} onChange={event=>anchor(index(),'offsetBars',Number(event.currentTarget.value))}/></label></Show>
          <Show when={point.kind!=='viewport'}><label>{t('数值','Value')}<input type="number" required step="any" value={'value' in point?point.value:0} onChange={event=>anchor(index(),'value',Number(event.currentTarget.value))}/></label></Show>
          <Show when={point.kind==='viewport'}><label>X %<input type="number" required min="0" max="100" step="any" value={point.kind==='viewport'?point.x*100:0} onChange={event=>anchor(index(),'x',Number(event.currentTarget.value)/100)}/></label><label>Y %<input type="number" required min="0" max="100" step="any" value={point.kind==='viewport'?point.y*100:0} onChange={event=>anchor(index(),'y',Number(event.currentTarget.value)/100)}/></label></Show>
        </div>}</For></fieldset></Show>
        <fieldset><legend>{t('周期可见性','Interval visibility')}</legend><select aria-label={t('周期可见性','Interval visibility')} value={d().presentation?.intervals?.kind??'all'} onChange={event=>{const kind=event.currentTarget.value as 'all'|'current'|'higher'|'lower'|'list';setDraft({...d(),presentation:{...d().presentation,intervals:kind==='all'?{kind}:kind==='list'?{kind,periods:[{multiplier:props.period.multiplier,timespan:props.period.timespan}]}:{kind,period:{multiplier:props.period.multiplier,timespan:props.period.timespan}}}})}}><For each={['all','current','higher','lower','list']}>{kind=><option value={kind}>{({all:t('全部周期','All intervals'),current:t('当前周期','Current interval'),higher:t('当前及更高','Current and higher'),lower:t('当前及更低','Current and lower'),list:t('自选周期','Selected intervals')})[kind]}</option>}</For></select><Show when={d().presentation?.intervals?.kind==='list'}><For each={props.periods}>{period=><label><input type="checkbox" checked={intervalChecked(period)} onChange={event=>{const current=d().presentation!.intervals!;if(current.kind!=='list')return;const periods=current.periods.filter(p=>p.multiplier!==period.multiplier||p.timespan!==period.timespan);if(event.currentTarget.checked)periods.push({multiplier:period.multiplier,timespan:period.timespan});setDraft({...d(),presentation:{...d().presentation,intervals:{kind:'list',periods}}})}}/>{period.text}</label>}</For></Show></fieldset>
        <For each={descriptor()?.parameters??[]}>{parameter=><fieldset><legend>{parameter.label}</legend><Show when={parameter.kind==='levels'}><For each={(d().parameters?.[parameter.key]??parameter.defaultValue) as number[]}>{(level,index)=><label>{index()+1}<input type="number" required step="any" value={level} onChange={event=>{const levels=[...((d().parameters?.[parameter.key]??parameter.defaultValue) as number[])];levels[index()]=Number(event.currentTarget.value);setDraft({...d(),parameters:{...d().parameters,[parameter.key]:levels}})}}/></label>}</For></Show></fieldset>}</For>
        <Show when={d().overlay.lock}><p>{t('此对象已锁定，请先在对象列表解锁后修改内容','This drawing is locked. Unlock it in the object list before editing content.')}</p></Show>
        <button type="button" onClick={()=>{setDraft(undefined);setOriginal(undefined);setTab('objects')}}>{t('取消修改','Cancel changes')}</button><button type="submit" disabled={props.state.history.pending>0||d().overlay.lock}>{t('确认修改','Confirm changes')}</button>
      </form>
    }}</Show>
    <Show when={tab()==='templates'}>
      <p>{t('模板只保存样式和工具参数，不包含坐标、正文或后端身份','Templates contain styles and tool parameters only, never positions, text, or backend identity.')}</p>
      <input aria-label={t('模板名称','Template name')} value={templateName()} onInput={event=>setTemplateName(event.currentTarget.value)} maxLength={80}/>
      <button disabled={selected().length!==1||!templateName().trim()} onClick={()=>void send({type:'template',action:'save',ids:selected(),name:templateName()})}>{t('保存为新模板','Save new template')}</button>
      <button disabled={selected().length!==1} onClick={()=>void send({type:'template',action:'default',ids:selected()})}>{t('设为工具默认','Set tool default')}</button>
      <select aria-label={t('选择绘图模板','Choose drawing template')} value={templateId()} onChange={event=>setTemplateId(event.currentTarget.value)}><option value="">{t('选择模板','Choose template')}</option><For each={templates()}>{template=><option value={template.id}>{template.name} · {props.catalog.find(t=>t.toolId===template.toolId)?.labels[en()?'en-US':'zh-CN']??template.toolId}</option>}</For></select>
      <button disabled={!templateId()||!selected().length} onClick={()=>void send({type:'template',action:'apply',templateId:templateId(),ids:selected()})}>{t('应用模板','Apply template')}</button>
      <button disabled={!templateId()||!selected().length} onClick={()=>void send({type:'template',action:'apply',templateId:templateId(),ids:selected(),styleOnly:true})}>{t('只应用共同样式','Apply common styles only')}</button>
      <button disabled={!templateId()||!templateName().trim()} onClick={()=>void send({type:'template',action:'rename',templateId:templateId(),name:templateName()})}>{t('重命名选中模板','Rename selected template')}</button>
      <button disabled={!templateId()} onClick={()=>{const template=templates().find(t=>t.id===templateId());if(template)setNotice(t(`再次点击确认删除模板「${template.name}」`,`Click again to delete template “${template.name}”`));}}>{t('删除模板…','Delete template…')}</button>
      <Show when={notice().includes('Click again to delete')||notice().includes('再次点击确认删除模板')}><button onClick={()=>void send({type:'template',action:'delete',templateId:templateId()})}>{t('确认删除此模板','Confirm template deletion')}</button></Show>
      <Show when={!templates().length}><p>{t('暂无模板，请选择一个绘图保存样式','No templates. Select a drawing and save its style.')}</p></Show>
    </Show>
    <Show when={tab()==='preferences'&&prefs()}>
      <p role="status">{({loading:t('正在读取偏好','Loading preferences'),saving:t('正在保存偏好','Saving preferences'),saved:t('偏好已保存','Preferences saved'),'session-only':t('偏好仅本次会话有效','Preferences apply to this session only'),error:t('偏好尚未保存','Preferences not saved')})[prefs()!.status]}</p>
      <Show when={prefs()?.error}><p role="alert">{prefs()?.error}</p><button onClick={()=>void send({type:'preferences-retry'})}>{t('重试偏好存储','Retry preferences storage')}</button></Show>
      <label><input type="checkbox" checked={prefs()!.value.ui.continuous} onChange={event=>void send({type:'preferences',patch:{ui:{...prefs()!.value.ui,continuous:event.currentTarget.checked}}})}/>{t('连续绘制','Keep drawing')}</label>
      <For each={props.catalog}>{descriptor=><div class="tc-drawing-preference"><button aria-pressed={prefs()!.value.favorites.includes(descriptor.toolId)} onClick={()=>toggleFavorite(descriptor.toolId)}>{prefs()!.value.favorites.includes(descriptor.toolId)?'★':'☆'} {descriptor.labels[en()?'en-US':'zh-CN']}</button><select aria-label={`${t('快捷键','Shortcut')} ${descriptor.labels[en()?'en-US':'zh-CN']}`} value={prefs()!.value.shortcuts[descriptor.toolId]??descriptor.shortcut?.toLowerCase()??''} onChange={event=>{const shortcuts={...prefs()!.value.shortcuts};if(event.currentTarget.value)shortcuts[descriptor.toolId]=event.currentTarget.value;else delete shortcuts[descriptor.toolId];void send({type:'preferences',patch:{shortcuts}})}}><option value="">{t('使用默认','Default')}</option><For each={['alt+t','alt+h','alt+v','alt+f','alt+r','alt+b','alt+c','shift+m',...Array.from({length:10},(_,i)=>`alt+${i}`)]}>{combo=><option value={combo}>{combo}</option>}</For></select></div>}</For>
      <For each={prefs()!.value.favorites}>{(id,index)=><div><span>{props.catalog.find(t=>t.toolId===id)?.labels[en()?'en-US':'zh-CN']}</span><button disabled={index()===0} onClick={()=>{const favorites=[...prefs()!.value.favorites];[favorites[index()-1],favorites[index()]]=[favorites[index()],favorites[index()-1]];void send({type:'preferences',patch:{favorites}})}}>{t('收藏前移','Move favorite earlier')}</button></div>}</For>
    </Show>
  </aside>
}
export default DrawingWorkbench
