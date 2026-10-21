import DrawingObjectTree from './DrawingObjectTree'
import {parameterLabel,parameterChoice} from '../../drawing/parameterLabels'
import {styleControls,styleControlOptions,drawingStylePatch,drawingStyleValue} from '../../drawing/styleControls'
import {ColorPalette} from '../overlay-property-bar/ColorPalette'
import type {DrawingStyleControl} from '../../drawing/catalog'
import {isVolumeDrawing} from '../../drawing/analytics'
import AnalyticsSummary from './AnalyticsSummary'
import {createMemo,createSignal,createEffect,on,untrack,onCleanup,For,Show,type Component} from 'solid-js'
import type {DrawingCommand,DrawingCommandResult,DrawingSnapshot,DrawingState,DrawingAnchor} from '../../drawing/types'
import type {DrawingToolDescriptor} from '../../drawing/catalog'
import type {Period} from '../../types'

export interface DrawingWorkbenchProps {
  contextKey?:string
  locale:string
  state:DrawingState
  catalog:DrawingToolDescriptor[]
  period:Period
  periods:Period[]
  tickSize?:number
  rotation:{read:(object:DrawingSnapshot)=>number;apply:(object:DrawingSnapshot,degrees:number)=>DrawingSnapshot}
  page?:'objects'|'settings'|'templates'
  requestVersion?:number
  onDirtyChange?:(dirty:boolean)=>void
  editId?:string
  axes:(object:DrawingSnapshot)=>Array<{id:string;name:string}>
  execute:(command:DrawingCommand)=>Promise<DrawingCommandResult>
  locate:(object:DrawingSnapshot)=>void
  convertAnchor:(object:DrawingSnapshot,index:number,kind:DrawingAnchor['kind'])=>DrawingAnchor
  onClose:()=>void
}
const clone=<T,>(value:T):T=>structuredClone(value)
const DrawingWorkbench:Component<DrawingWorkbenchProps>=props=>{
  const en=()=>props.locale==='en-US',t=(zh:string,enText:string)=>en()?enText:zh
  const [tab,setTab]=createSignal<'objects'|'settings'|'templates'|'preferences'>('objects'),[query,setQuery]=createSignal(''),[groupName,setGroupName]=createSignal(''),[templateName,setTemplateName]=createSignal(''),[templateId,setTemplateId]=createSignal(''),[notice,setNotice]=createSignal(''),[deleteTemplate,setDeleteTemplate]=createSignal<{id:string;name:string}>()
  const [draft,setDraft]=createSignal<DrawingSnapshot>(),[original,setOriginal]=createSignal<DrawingSnapshot>(),[text,setText]=createSignal('')
  const objects=createMemo(()=>new Map(props.state.objects.map(object=>[object.logicalId,object])))
  const tool=(object:DrawingSnapshot)=>props.catalog.find(t=>t.overlayName===object.overlay.name)
  const label=(object:DrawingSnapshot)=>object.presentation?.name||tool(object)?.labels[en()?'en-US':'zh-CN']||object.overlay.name
  const filtered=createMemo(()=>props.state.objects.filter(object=>`${label(object)} ${object.overlay.name} ${object.logicalId} ${object.presentation?.groupName??''}`.toLowerCase().includes(query().toLowerCase())).sort((a,b)=>(b.presentation?.order??0)-(a.presentation?.order??0)))
  const selected=()=>props.state.selectedIds
  const send=async(command:DrawingCommand)=>{const result=await props.execute(command);setNotice(result.message??(result.status==='completed'?'':`${result.status}: ${result.items.filter(i=>i.status==='confirmed').length}/${result.items.length}`));return result}
  const [pendingEdit,setPendingEdit]=createSignal<DrawingSnapshot>(),[closing,setClosing]=createSignal(false),[palette,setPalette]=createSignal<DrawingStyleControl>(),[parameterPalette,setParameterPalette]=createSignal<string>()
  let colorTrigger:HTMLButtonElement|undefined
  const closeColor=()=>{setPalette(undefined);setParameterPalette(undefined);colorTrigger?.focus()}
  const focusColor=()=>queueMicrotask(()=>colorTrigger?.parentElement?.querySelector<HTMLButtonElement>('.tc-drawing-color-palette button')?.focus())
  const dirty=()=>{const base=original(),d=draft();return !!base&&!!d&&(JSON.stringify(base)!==JSON.stringify(d)||text()!==(typeof base.overlay.extendData==='string'?base.overlay.extendData:String((base.overlay.extendData as any)?.text??'')))}
  createEffect(()=>props.onDirtyChange?.(dirty()))
  onCleanup(()=>props.onDirtyChange?.(false))
  const edit=(object:DrawingSnapshot)=>{
    if(dirty()){if(original()?.logicalId!==object.logicalId)setPendingEdit(object);else setTab('settings');return}
    void send({type:'select',ids:[object.logicalId]});setDraft(clone(object));setOriginal(clone(object));setText(typeof object.overlay.extendData==='string'?object.overlay.extendData:String((object.overlay.extendData as any)?.text??''));setTab('settings');setNotice('');setPalette(undefined);setParameterPalette(undefined)
  }
  const discardDraft=()=>{setDraft(undefined);setOriginal(undefined);setPalette(undefined);setParameterPalette(undefined)}
  const close=()=>{if(dirty())setClosing(true);else props.onClose()}
  createEffect(on(()=>[props.editId,props.requestVersion] as const,([id])=>{if(id){const object=untrack(()=>objects().get(id));if(object)edit(object)}}))
  createEffect(on(()=>[props.page,props.requestVersion] as const,([page])=>{if(page==='templates'||page==='objects')setTab(page);else if(page==='settings'&&draft())setTab('settings')}))
  const draftStyle=(control:DrawingStyleControl,value:string|number)=>{const d=clone(draft()!),patch=drawingStylePatch(control,value);for(const [group,fields] of Object.entries(patch))d.overlay.styles={...d.overlay.styles,[group]:{...(d.overlay.styles as any)?.[group],...(fields as object)}};setDraft(d)}
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
  return <aside class="tc-drawing-workbench" aria-label={t('绘图管理','Drawing manager')} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close()}}}>
    <header><strong>{t('绘图管理','Drawing manager')}</strong><button aria-label={t('关闭绘图管理','Close drawing manager')} onClick={close}>×</button></header>
    <Show when={pendingEdit()||closing()}><div role="alertdialog" aria-label={t('尚未确认的设置草稿','Unconfirmed settings draft')}><p>{t('保留当前草稿，或放弃后继续？','Keep the current draft, or discard it and continue?')}</p><button onClick={()=>{setPendingEdit(undefined);setClosing(false);setTab('settings')}}>{t('保留草稿','Keep draft')}</button><button onClick={()=>{const next=pendingEdit(),exit=closing();discardDraft();setPendingEdit(undefined);setClosing(false);if(exit)props.onClose();else if(next)edit(next)}}>{t('放弃草稿并继续','Discard draft and continue')}</button></div></Show>
    <nav aria-label={t('绘图管理页面','Drawing manager pages')}><For each={['objects','settings','templates','preferences'] as const}>{key=><button aria-pressed={tab()===key} disabled={key==='settings'&&!draft()} onClick={()=>setTab(key)}>{({objects:t('对象','Objects'),settings:t('设置','Settings'),templates:t('模板','Templates'),preferences:t('偏好','Preferences')})[key]}</button>}</For></nav>
    <Show when={notice()}><p role="alert">{notice()}</p></Show>
    <Show when={props.state.lastResult&&props.state.lastResult.status!=='completed'}><p role="status">{t('已完成','Completed')} {props.state.lastResult!.items.filter(item=>item.status==='confirmed').length}/{props.state.lastResult!.items.length}</p><For each={props.state.lastResult!.items.filter(item=>item.status!=='confirmed')}>{item=><p role="alert">{objects().get(item.logicalId)?.presentation?.name??item.logicalId}: {item.status} {item.message}</p>}</For></Show>
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
      <input aria-label={t('搜索绘图对象','Search drawing objects')} placeholder={t('搜索名称、工具或分组','Search name, tool, or group')} value={query()} onInput={event=>{setQuery(event.currentTarget.value)}}/>
      <p>{t('已选择','Selected')} {selected().length} / {props.state.objects.length}</p>
      <Show when={selected().some(id=>objects().get(id)?.overlay.lock)}><p role="status">{t('选择中含锁定对象，批量写入前请解锁或明确改为仅选择可操作对象','Selection includes locked drawings. Unlock them or explicitly select only writable drawings.')}</p><button onClick={()=>void send({type:'select',ids:selected().filter(id=>!objects().get(id)?.overlay.lock)})}>{t('仅选择未锁定对象','Select unlocked drawings only')}</button></Show>

      <For each={selected().filter(id=>props.state.analytics?.[id])}>{id=><AnalyticsSummary state={props.state.analytics![id]} locale={props.locale}/>}</For>
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
      <DrawingObjectTree objects={filtered()} allObjects={props.state.objects} selected={selected()} uncertain={props.state.history.uncertainLogicalIds} searching={!!query().trim()} query={query()} contextKey={props.contextKey??JSON.stringify([props.period,props.state.scope])} locale={props.locale} label={label} execute={send} locate={props.locate} edit={edit} errors={props.state.history.projectionErrors}/>
      <For each={props.state.groups.filter(group=>props.state.objects.some(o=>o.presentation?.groupId===group.id&&selected().includes(o.logicalId)))}>{group=><fieldset><legend>{group.name}</legend><label>{t('组名称','Group name')}<input value={group.name} onChange={event=>void send({type:'presentation',ids:props.state.objects.filter(d=>d.presentation?.groupId===group.id).map(d=>d.logicalId),patch:{groupName:event.currentTarget.value}})}/></label><button onClick={()=>void send({type:'select',ids:props.state.objects.filter(d=>d.presentation?.groupId===group.id).map(d=>d.logicalId)})}>{t('选择组','Select group')}</button><button onClick={()=>void send({type:'update',ids:props.state.objects.filter(d=>d.presentation?.groupId===group.id).map(d=>d.logicalId),patch:{overlay:{visible:false}}})}>{t('隐藏组','Hide group')}</button><button onClick={()=>void send({type:'update',ids:props.state.objects.filter(d=>d.presentation?.groupId===group.id).map(d=>d.logicalId),patch:{overlay:{visible:true}}})}>{t('显示组','Show group')}</button></fieldset>}</For>
    </Show>
    <Show when={tab()==='settings'&&draft()}>{_=>{
      const d=()=>draft()!,descriptor=()=>tool(d())
      return <form onSubmit={event=>{event.preventDefault();void confirm()}}>
        <label>{t('对象名称','Object name')}<input value={d().presentation?.name??''} placeholder={label(d())} onInput={event=>setDraft({...d(),presentation:{...d().presentation,name:event.currentTarget.value}})}/></label>
        <Show when={styleControls(descriptor()).length}><fieldset><legend>{t('样式','Style')}</legend>
          <For each={styleControls(descriptor())}>{control=>{
            const label=()=>({stroke:t('描边颜色','Stroke color'),fill:t('填充颜色','Fill color'),lineWidth:t('线宽','Line width'),lineStyle:t('线型','Line style'),textColor:t('文字颜色','Text color'),fontSize:t('字号','Font size')})[control]
            return <label>{label()}<Show when={['stroke','fill','textColor'].includes(control)} fallback={<select aria-label={label()} value={drawingStyleValue(d(),control)??(control==='lineStyle'?'solid':control==='fontSize'?12:1)} onChange={event=>draftStyle(control,control==='lineStyle'?event.currentTarget.value:Number(event.currentTarget.value))}><For each={styleControlOptions(control,drawingStyleValue(d(),control))}>{value=><option value={value}>{value==='solid'?t('实线','Solid'):value==='dashed'?t('虚线','Dashed'):value==='dotted'?t('点线','Dotted'):value}</option>}</For></select>}><button type="button" aria-label={label()} aria-expanded={palette()===control} onClick={event=>{colorTrigger=event.currentTarget;setParameterPalette(undefined);setPalette(palette()===control?undefined:control);if(palette())focusColor()}}>{drawingStyleValue(d(),control)??t('默认','Default')}</button><Show when={palette()===control}><ColorPalette locale={props.locale} label={label()} value={String(drawingStyleValue(d(),control)??'')} transparent={control==='fill'} choose={color=>{draftStyle(control,color);closeColor()}} close={closeColor}/></Show></Show></label>
          }}</For>
        </fieldset></Show>
        <Show when={descriptor()?.settings.includes('text')}><fieldset><legend>{t('文字','Text')}</legend><textarea rows={4} aria-label={t('标注正文','Drawing text')} value={text()} onInput={event=>setText(event.currentTarget.value)}/><label>{t('字体','Font')}<select value={d().overlay.styles?.text?.family??'sans-serif'} onChange={event=>style('text','family',event.currentTarget.value)}><For each={['sans-serif','serif','monospace']}>{value=><option value={value}>{value}</option>}</For></select></label><label>{t('对齐','Alignment')}<select value={String(d().parameters?.textAlign??'left')} onChange={event=>setDraft({...d(),parameters:{...d().parameters,textAlign:event.currentTarget.value}})}><For each={['left','center','right']}>{value=><option value={value}>{value}</option>}</For></select></label></fieldset></Show>
        <Show when={d().anchors?.length}><fieldset><legend>{isVolumeDrawing(d().overlay.name)?t('时间区间','Time interval'):t('坐标','Coordinates')}</legend><Show when={props.tickSize!==undefined}><small>Tick: {props.tickSize}</small></Show><For each={d().anchors}>{(point,index)=><div class="tc-drawing-coordinate"><strong>{index()+1}</strong><select disabled={isVolumeDrawing(d().overlay.name)} aria-label={`${t('锚点模式','Anchor mode')} ${index()+1}`} value={point.kind} onChange={event=>{try{const next=clone(d());next.anchors![index()]=props.convertAnchor(next,index(),event.currentTarget.value as DrawingAnchor['kind']);setDraft(next)}catch(error){setNotice(String(error))}}}><option value="market">{t('市场时间','Market time')}</option><option value="logical">{t('逻辑根数','Logical bars')}</option><option value="viewport">{t('视口位置','Viewport position')}</option></select>
          <Show when={point.kind==='market'}><label>UTC<input type="datetime-local" required step="0.001" value={point.kind==='market'?new Date(point.timestamp).toISOString().slice(0,23):''} onChange={event=>anchor(index(),'timestamp',new Date(`${event.currentTarget.value}Z`).getTime())}/></label></Show>
          <Show when={point.kind==='logical'}><label>{t('参考时刻','Reference UTC')}<span>{point.kind==='logical'?new Date(point.referenceTimestamp).toISOString():''}</span></label><label>{t('后续根数','Bar offset')}<input type="number" required step="any" value={point.kind==='logical'?point.offsetBars:0} onChange={event=>anchor(index(),'offsetBars',Number(event.currentTarget.value))}/></label></Show>
          <Show when={point.kind!=='viewport'&&!isVolumeDrawing(d().overlay.name)}><label>{t('数值','Value')}<input type="number" required step="any" value={'value' in point?point.value:0} onChange={event=>anchor(index(),'value',Number(event.currentTarget.value))}/></label></Show>
          <Show when={point.kind==='viewport'}><label>X %<input type="number" required min="0" max="100" step="any" value={point.kind==='viewport'?point.x*100:0} onChange={event=>anchor(index(),'x',Number(event.currentTarget.value)/100)}/></label><label>Y %<input type="number" required min="0" max="100" step="any" value={point.kind==='viewport'?point.y*100:0} onChange={event=>anchor(index(),'y',Number(event.currentTarget.value)/100)}/></label></Show>
        </div>}</For></fieldset></Show>
        <Show when={d().overlay.name==='rotatedRect'}><label>{t('屏幕角度（度）','Screen angle (degrees)')}<input aria-label={t('屏幕角度（度）','Screen angle (degrees)')} type="number" step="any" value={props.rotation.read(d())} onChange={event=>{try{setDraft(props.rotation.apply(d(),Number(event.currentTarget.value)))}catch(error){setNotice(String(error))}}}/></label></Show>
        <Show when={!isVolumeDrawing(d().overlay.name)&&(!d().presentation?.scope||d().presentation?.scope==='chart')} fallback={<p>{isVolumeDrawing(d().overlay.name)?t('按本图主价格轴计算，仅编辑时间边界','Uses this chart’s main price axis; only time boundaries are editable'):t('共享绘图按各图主价格轴显示，价格值保持一致','Shared drawings use each chart’s main price axis with unchanged price values')}</p>}><label>{t('坐标轴','Axis')}<select aria-label={t('绘图坐标轴','Drawing axis')} value={d().yAxisId??props.axes(d())[0]?.id} onChange={event=>setDraft({...d(),yAxisId:event.currentTarget.value===props.axes(d())[0]?.id?undefined:event.currentTarget.value})}><For each={props.axes(d())}>{axis=><option value={axis.id}>{axis.name} · {axis.id}</option>}</For></select></label></Show>
        <fieldset><legend>{t('周期可见性','Interval visibility')}</legend><select aria-label={t('周期可见性','Interval visibility')} value={d().presentation?.intervals?.kind??'all'} onChange={event=>{const kind=event.currentTarget.value as 'all'|'current'|'higher'|'lower'|'list';setDraft({...d(),presentation:{...d().presentation,intervals:kind==='all'?{kind}:kind==='list'?{kind,periods:[{multiplier:props.period.multiplier,timespan:props.period.timespan}]}:{kind,period:{multiplier:props.period.multiplier,timespan:props.period.timespan}}}})}}><For each={['all','current','higher','lower','list']}>{kind=><option value={kind}>{({all:t('全部周期','All intervals'),current:t('当前周期','Current interval'),higher:t('当前及更高','Current and higher'),lower:t('当前及更低','Current and lower'),list:t('自选周期','Selected intervals')})[kind]}</option>}</For></select><Show when={d().presentation?.intervals?.kind==='list'}><For each={props.periods}>{period=><label><input type="checkbox" checked={intervalChecked(period)} onChange={event=>{const current=d().presentation!.intervals!;if(current.kind!=='list')return;const periods=current.periods.filter(p=>p.multiplier!==period.multiplier||p.timespan!==period.timespan);if(event.currentTarget.checked)periods.push({multiplier:period.multiplier,timespan:period.timespan});setDraft({...d(),presentation:{...d().presentation,intervals:{kind:'list',periods}}})}}/>{period.text}</label>}</For></Show></fieldset>
        <Show when={d().overlay.name==='anchoredVwap'}><fieldset><legend>{t('VWAP 带倍数（最多三组）','VWAP band multipliers (up to three)')}</legend><For each={[...new Set([...(d().parameters?.bandMode==='percentage'?[.25,.5,1,2,3,5,10,20,50,100]:[.5,1,1.5,2,2.5,3,5,10]),...((d().parameters?.bandMultipliers??[1,2,3]) as number[])])]}>{multiple=>{
          const values=()=>((d().parameters?.bandMultipliers??[1,2,3]) as number[]),enabled=()=>d().parameters?.bandMode!==undefined&&d().parameters?.bandMode!=='none',checked=()=>enabled()&&values().includes(multiple)
          return <label><input type="checkbox" aria-label={`${t('带倍数','Band multiplier')} ${multiple}`} checked={checked()} disabled={!checked()&&enabled()&&values().length>=3} onChange={event=>{
            const next=event.currentTarget.checked?[...(enabled()?values():[]),multiple]:values().filter(value=>value!==multiple)
            setDraft({...d(),parameters:{...d().parameters,bandMode:next.length?(enabled()?d().parameters?.bandMode??'standard-deviation':'standard-deviation'):'none',...(next.length?{bandMultipliers:next}:{})}})
          }}/>{multiple}{d().parameters?.bandMode==='percentage'?'%':'σ'}</label>
        }}</For></fieldset></Show>
        <For each={descriptor()?.parameters.filter(parameter=>parameter.key!=='textAlign'&&parameter.key!=='algorithm'&&parameter.key!=='bandAlgorithm'&&parameter.key!=='bandMultipliers')??[]}>{parameter=><fieldset><legend>{parameterLabel(parameter,props.locale)}</legend><Show when={parameter.kind==='number'&&!parameter.choices}><input type="number" aria-label={parameterLabel(parameter,props.locale)} min={parameter.min} max={parameter.max} required step="any" value={Number(d().parameters?.[parameter.key]??parameter.defaultValue)} onChange={event=>setDraft({...d(),parameters:{...d().parameters,[parameter.key]:Number(event.currentTarget.value)}})}/></Show><Show when={parameter.kind==='number'&&parameter.choices}><select aria-label={parameterLabel(parameter,props.locale)} value={String(d().parameters?.[parameter.key]??parameter.defaultValue)} onChange={event=>setDraft({...d(),parameters:{...d().parameters,[parameter.key]:Number(event.currentTarget.value)}})}><For each={[...new Set([...(parameter.choices??[]),String(d().parameters?.[parameter.key]??parameter.defaultValue)])]}>{choice=><option value={choice}>{parameterChoice(parameter.key,choice,props.locale)}</option>}</For></select></Show><Show when={parameter.kind==='color'}><button type="button" aria-label={parameterLabel(parameter,props.locale)} aria-expanded={parameterPalette()===parameter.key} onClick={event=>{colorTrigger=event.currentTarget;setPalette(undefined);setParameterPalette(parameterPalette()===parameter.key?undefined:parameter.key);if(parameterPalette())focusColor()}}>{String(d().parameters?.[parameter.key]??parameter.defaultValue)}</button><Show when={parameterPalette()===parameter.key}><ColorPalette locale={props.locale} label={parameterLabel(parameter,props.locale)} value={String(d().parameters?.[parameter.key]??parameter.defaultValue)} transparent choose={color=>{setDraft({...d(),parameters:{...d().parameters,[parameter.key]:color}});closeColor()}} close={closeColor}/></Show></Show><Show when={parameter.kind==='boolean'}><label><input type="checkbox" checked={Boolean(d().parameters?.[parameter.key]??parameter.defaultValue)} onChange={event=>setDraft({...d(),parameters:{...d().parameters,[parameter.key]:event.currentTarget.checked}})}/>{parameterLabel(parameter,props.locale)}</label></Show><Show when={parameter.kind==='text'&&parameter.choices}><select aria-label={parameterLabel(parameter,props.locale)} value={String(d().parameters?.[parameter.key]??parameter.defaultValue)} onChange={event=>setDraft({...d(),parameters:{...d().parameters,[parameter.key]:event.currentTarget.value}})}><For each={parameter.choices}>{choice=><option value={choice}>{parameterChoice(parameter.key,choice,props.locale)}</option>}</For></select></Show><Show when={parameter.kind==='levels'}><For each={(d().parameters?.[parameter.key]??parameter.defaultValue) as number[]}>{(level,index)=><label>{index()+1}<input type="number" required step="any" value={level} onChange={event=>{const levels=[...((d().parameters?.[parameter.key]??parameter.defaultValue) as number[])];levels[index()]=Number(event.currentTarget.value);setDraft({...d(),parameters:{...d().parameters,[parameter.key]:levels}})}}/><button type="button" aria-label={`${t('移除级别','Remove level')} ${index()+1}`} disabled={((d().parameters?.[parameter.key]??parameter.defaultValue) as number[]).length<=1} onClick={()=>{const levels=[...((d().parameters?.[parameter.key]??parameter.defaultValue) as number[])];levels.splice(index(),1);setDraft({...d(),parameters:{...d().parameters,[parameter.key]:levels}})}}>−</button></label>}</For><button type="button" onClick={()=>{const levels=[...((d().parameters?.[parameter.key]??parameter.defaultValue) as number[])];levels.push(Math.max(...levels)+1);setDraft({...d(),parameters:{...d().parameters,[parameter.key]:levels}})}}>{t('添加级别','Add level')}</button></Show></fieldset>}</For>
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
      <button disabled={!templateId()||selected().length!==1} onClick={()=>{const template=templates().find(t=>t.id===templateId());if(template&&window.confirm(t(`覆盖模板「${template.name}」的样式和参数？`,`Replace styles and parameters of template “${template.name}”?`)))void send({type:'template',action:'overwrite',templateId:template.id,ids:selected()})}}>{t('覆盖选中模板…','Overwrite selected template…')}</button>
      <button disabled={!templateId()} onClick={()=>{const template=templates().find(t=>t.id===templateId());if(template)setDeleteTemplate({id:template.id,name:template.name});}}>{t('删除模板…','Delete template…')}</button>
      <Show when={deleteTemplate()}>{target=><p>{t('删除模板','Delete template')}「{target().name}」<button onClick={()=>{void send({type:'template',action:'delete',templateId:target().id});setDeleteTemplate(undefined)}}>{t('确认删除此模板','Confirm template deletion')}</button><button onClick={()=>setDeleteTemplate(undefined)}>{t('取消','Cancel')}</button></p>}</Show>
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
