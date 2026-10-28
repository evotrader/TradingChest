import {createSignal,createEffect,createMemo,onMount,onCleanup,For,Show,type Component} from 'solid-js'
import type {DrawingAlertCommand,DrawingAlertCommandResult,DrawingAlertCondition,DrawingAlertFrequency,DrawingAlertState} from '../../alert/drawingTypes'
import type {DrawingSnapshot,DrawingCommandResult} from '../../drawing/types'
import type {DrawingToolDescriptor} from '../../drawing/catalog'
import {isDrawingLevelSet,type DrawingLevel} from '../../drawing/levels'
import './style.less'

const Manager:Component<{
  locale:string;states:DrawingAlertState[];objects:DrawingSnapshot[];sourceId?:string;levelId?:string;contextKey:string;catalog:DrawingToolDescriptor[];replay:boolean
  execute:(command:DrawingAlertCommand)=>DrawingAlertCommandResult
  sourceReason:(id:string,levelId?:string)=>string|undefined
  initialize:(id:string,parameterKey:string)=>Promise<DrawingCommandResult>
  initializeReason:(id:string)=>string|undefined
  locate:(id:string)=>boolean
  close:()=>void
}>=props=>{
  const t=(zh:string,en:string)=>props.locale==='en-US'?en:zh
  const [source,setSource]=createSignal(''),[editing,setEditing]=createSignal<string>(),[condition,setCondition]=createSignal<DrawingAlertCondition>('crossing'),[frequency,setFrequency]=createSignal<DrawingAlertFrequency>('once'),[message,setMessage]=createSignal(''),[notice,setNotice]=createSignal('')
  const [levelId,setLevelId]=createSignal(''),[initializing,setInitializing]=createSignal(false)
  let initialization=0
  let element:HTMLElement|undefined,alive=true
  const escape=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&!event.isComposing&&element?.closest('.klinecharts-pro')?.contains(event.target as Node)){event.preventDefault();event.stopPropagation();props.close()}
  }
  onMount(()=>{document.addEventListener('keydown',escape,true);queueMicrotask(()=>{if(alive)element?.querySelector<HTMLButtonElement>('header button')?.focus()})})
  onCleanup(()=>document.removeEventListener('keydown',escape,true))
  onCleanup(()=>{alive=false})
  // A canonical snapshot update may recompute the same context. Only a changed
  // context value or an explicit entry request should reset the user's form.
  const contextKey=createMemo(()=>props.contextKey)
  createEffect(()=>{contextKey();setSource(props.sourceId??'');setLevelId(props.levelId??'');setEditing(undefined);setNotice('');setInitializing(false);initialization++})
  const objects=createMemo(()=>new Map(props.objects.map(object=>[object.logicalId,object])))
  const sourceIds=createMemo(()=>{const ids=[...objects().keys()];if(editing()&&source()&&!objects().has(source()))ids.push(source());return ids})
  const capability=createMemo(()=>props.catalog.find(tool=>tool.overlayName===objects().get(source())?.overlay.name)?.alertLevels)
  const storedLevels=createMemo(()=>{const key=capability()?.parameterKey;return key?objects().get(source())?.parameters?.[key]:undefined})
  const levels=createMemo(()=>{const value=storedLevels();return isDrawingLevelSet(value)?value.items:[]})
  const initializeRequired=()=>!!capability()&&!isDrawingLevelSet(storedLevels())
  const targetLabel=(level:DrawingLevel,index:number)=>`${index+1} · ${level.value}${level.text?` · ${level.text.slice(0,48)}`:''}${level.visible?'':t(' · 已关闭',' · Hidden')}`
  createEffect(()=>{if(levelId()&&!editing()&&!levels().some(level=>level.id===levelId())){setLevelId('');setNotice(t('原级别已改变，请重新选择已确认级别','The level changed; select a confirmed level again'))}})
  createEffect(()=>{if(source()&&!editing()&&!objects().has(source())){setSource('');setNotice(t('原来源已消失，请重新选择绘图','The source is no longer available; select another drawing'))}})
  const sourceError=createMemo(()=>{objects();props.states;return source()?props.sourceReason(source(),capability()&&levelId()?levelId():undefined):undefined})
  const reset=()=>{setEditing(undefined);setLevelId('');setMessage('');setCondition('crossing');setFrequency('once')}
  const initialize=async()=>{
    const id=source(),key=capability()?.parameterKey,context=props.contextKey,token=++initialization
    if(!key||initializing())return
    setInitializing(true);setNotice('')
    try{
      const result=await props.initialize(id,key)
      if(!alive||token!==initialization||source()!==id||props.contextKey!==context)return
      setLevelId('');setNotice(result.status==='completed'?t('初始化已确认，请重新选择一个级别再创建提醒','Initialization confirmed. Select a level to create the alert.'):result.message??result.items.find(item=>item.message)?.message??t('初始化未确认，请核对原来源','Initialization was not confirmed; inspect the original source'))
    }catch(error){if(alive&&token===initialization&&source()===id&&props.contextKey===context)setNotice(error instanceof Error?error.message:String(error))}
    finally{if(alive&&token===initialization)setInitializing(false)}
  }
  const send=(command:DrawingAlertCommand)=>{const result=props.execute(command);setNotice(result.status==='completed'?'':result.message??t('操作被拒绝','Operation rejected'));return result}
  const save=()=>{
    if(!source()||sourceError()||initializing()||!editing()&&capability()&&(!levelId()||initializeRequired())){setNotice(sourceError()??t('请选择已确认的绘图和级别','Select a confirmed drawing and level'));return}
    const command:DrawingAlertCommand=editing()?{type:'update',id:editing()!,patch:{condition:condition(),frequency:frequency(),message:message()}}:{type:'create',drawingLogicalId:source(),...(capability()?{target:{kind:'level',levelId:levelId()}}:{}),condition:condition(),frequency:frequency(),message:message()}
    if(send(command).status==='completed'){reset();setNotice(t('提醒已保存','Alert saved'))}
  }
  const labels=()=>({paused:t('已暂停','Paused'),waiting:t('等待有效观测','Waiting'),monitoring:t('监控中','Monitoring'),triggered:t('已触发','Triggered'),'source-missing':t('来源已消失','Source missing'),unsupported:t('来源暂不支持','Unsupported source'),'data-unavailable':t('行情或来源不可用','Data unavailable'),'context-mismatch':t('等待原标的／周期','Waiting for original series/period')})
  const conditionLabel=(value:DrawingAlertCondition)=>value==='crossing-up'?t('向上穿越','Crossing up'):value==='crossing-down'?t('向下穿越','Crossing down'):t('双向穿越','Crossing')
  const sourceName=(id:string)=>props.objects.find(object=>object.logicalId===id)?.presentation?.name??id
  return <aside ref={element} class="tc-drawing-alert-manager" aria-label={t('画线提醒管理','Drawing alerts')} onKeyDown={event=>{if(event.key==='Escape'&&!event.isComposing){event.stopPropagation();props.close()}}}>
    <header><strong>{t('画线提醒管理','Drawing alerts')}</strong><button aria-label={t('关闭提醒管理','Close drawing alerts')} onClick={props.close}>×</button></header>
    <p role="note">{t('仅本页运行，关闭后停止。规则默认仅在内存中，单独保存布局不包含提醒。仅判断收到的 close，不补报历史，也不代表逐笔触达或收盘确认。','Runs only on this page; stops when closed. Rules are in memory by default and are not included in layout-only saves. Evaluates received closes, without historical backfill, tick-touch or bar-close guarantees.')}</p>
    <Show when={props.replay}><p role="status">{t('当前为回放；状态、记录及回调与实时监控隔离','Replay mode: state, records and callbacks are separate from live monitoring')}</p></Show>
    <form onSubmit={event=>{event.preventDefault();save()}}>
      <fieldset><legend>{editing()?t('编辑提醒','Edit alert'):t('添加提醒','Add alert')}</legend>
        <label>{t('绘图来源','Drawing source')}<select aria-label={t('提醒来源','Alert source')} disabled={!!editing()} value={source()} onChange={event=>{initialization++;setInitializing(false);setSource(event.currentTarget.value);setLevelId('');setNotice('')}}><option value="">{t('请选择绘图','Select a drawing')}</option><For each={sourceIds()}>{id=><option value={id} disabled={!objects().has(id)}>{objects().get(id)?.presentation?.name??id} · {objects().get(id)?.overlay.name??t('来源不可用','Source unavailable')}</option>}</For></select></label>
        <p>{t('支持本图已确认的水平线、直线、线段、射线，以及声明能力的单个级别。提醒保留图形有效范围；共享作用域和独立价格轴暂不支持。','Supports confirmed chart-local lines and individual declared levels. Alerts retain their drawing domain. Shared scopes and independent axes are unsupported.')}</p>
        <Show when={capability()}>
          <Show when={initializeRequired()} fallback={<label>{t('级别','Level')}<select aria-label={t('提醒级别','Alert level')} disabled={!!editing()||initializing()} value={levelId()} onChange={event=>setLevelId(event.currentTarget.value)}><option value="">{t('请选择级别','Select a level')}</option><For each={levels()}>{(level,index)=><option value={level.id} disabled={!level.visible}>{targetLabel(level,index())}</option>}</For></select></label>}>
            <p>{t('旧级别需要显式初始化。此操作确认后可撤销；关闭面板不会回滚已确认修改。','Legacy levels need explicit initialization. Confirmed changes can be undone; closing this panel does not roll them back.')}</p>
            <button type="button" disabled={!!editing()||initializing()||!!sourceError()||!!props.initializeReason(source())} title={props.initializeReason(source())} onClick={()=>void initialize()}>{initializing()?t('正在确认级别','Confirming levels'):t('初始化级别','Initialize levels')}</button>
            <Show when={props.initializeReason(source())}>{reason=><p role="status">{reason()}</p>}</Show>
          </Show>
        </Show>
        <Show when={sourceError()}>{reason=><p role="status">{reason()}</p>}</Show>
        <label>{t('条件','Condition')}<select aria-label={t('提醒条件','Alert condition')} value={condition()} onChange={event=>setCondition(event.currentTarget.value as DrawingAlertCondition)}><For each={['crossing','crossing-up','crossing-down'] as const}>{value=><option value={value}>{conditionLabel(value)}</option>}</For></select></label>
        <label>{t('频率','Frequency')}<select aria-label={t('提醒频率','Alert frequency')} value={frequency()} onChange={event=>setFrequency(event.currentTarget.value as DrawingAlertFrequency)}><option value="once">{t('仅一次','Once')}</option><option value="once-per-bar">{t('每根 K 线最多一次','Once per bar')}</option></select></label>
        <label>{t('消息','Message')}<textarea aria-label={t('提醒消息','Alert message')} value={message()} onInput={event=>setMessage(event.currentTarget.value)}/></label>
        <button type="submit" disabled={!source()||!!sourceError()||initializing()||!editing()&&!!capability()&&(!levelId()||initializeRequired())}>{editing()?t('保存修改','Save changes'):t('创建提醒','Create alert')}</button><Show when={editing()}><button type="button" onClick={reset}>{t('取消编辑','Cancel editing')}</button></Show>
      </fieldset>
    </form>
    <Show when={notice()}><p role="status">{notice()}</p></Show>
    <Show when={props.states.length} fallback={<p>{t('尚无画线提醒。选择图形后添加，或从上方选择来源。','No drawing alerts. Select a drawing above or add an alert from its properties.')}</p>}>
      <ul><For each={props.states}>{state=>{
        const current=()=>props.replay?state.replay:state
        return <li data-drawing-alert-id={state.rule.id}><strong>{sourceName(state.rule.drawingLogicalId)}</strong><p>{state.rule.identity.ticker} · {state.rule.period.multiplier} {state.rule.period.timespan} · {conditionLabel(state.rule.condition)} · {state.rule.frequency==='once'?t('仅一次','Once'):t('每根最多一次','Once per bar')}</p><p role="status">{labels()[current().status]}{current().reason?` · ${current().reason}`:''}</p><Show when={state.rule.message}><p>{state.rule.message}</p></Show>
          <button onClick={()=>send({type:'pause',id:state.rule.id})} disabled={!state.enabled}>{t('暂停','Pause')}</button>
          <button title={state.rule.frequency==='once'&&current().hasTriggered?t('已触发，请使用重置并启用','Already triggered; use Reset and enable'):undefined} disabled={state.rule.frequency==='once'&&current().hasTriggered} onClick={()=>send({type:'resume',id:state.rule.id})}>{t('继续监控','Resume')}</button>
          <button onClick={()=>send({type:'rearm',id:state.rule.id})}>{t('重置并启用','Reset and enable')}</button>
          <Show when={state.rule.target.kind==='level'}><p>{t('绑定级别','Bound level')}: {state.rule.target.kind==='level'?state.rule.target.levelId:''}</p></Show>
          <button onClick={()=>{initialization++;setInitializing(false);setEditing(state.rule.id);setSource(state.rule.drawingLogicalId);setLevelId(state.rule.target.kind==='level'?state.rule.target.levelId:'');setCondition(state.rule.condition);setFrequency(state.rule.frequency);setMessage(state.rule.message??'');setNotice('');element?.querySelector<HTMLSelectElement>('[aria-label="提醒条件"],[aria-label="Alert condition"]')?.focus()}}>{t('编辑','Edit')}</button>
          <button onClick={()=>{if(!props.locate(state.rule.drawingLogicalId))setNotice(t('来源不在当前图中，无法定位；请切回原标的及周期','Source is unavailable; return to its original series and period'))}}>{t('定位','Locate')}</button>
          <button onClick={()=>{if(send({type:'delete',id:state.rule.id}).status==='completed'&&editing()===state.rule.id)reset()}}>{t('删除','Delete')}</button>
          <details><summary>{t('触发历史','Trigger history')} ({current().records.length})</summary><Show when={current().records.length} fallback={<p>{t('尚未触发','No triggers')}</p>}><ol><For each={[...current().records].reverse()}>{event=><li>{event.mode==='replay'?t('回放','Replay'):t('实时','Live')} · {new Date(event.barTimestamp).toISOString()} · {t('触发价','Trigger price')} {event.triggerPrice} · {t('参考价','Reference price')} {event.referencePrice}<Show when={event.level}>{level=>` · ${t('级别','Level')} ${level().value}${level().text?` · ${level().text}`:''}`}</Show></li>}</For></ol></Show></details>
        </li>
      }}</For></ul>
    </Show>
  </aside>
}
export default Manager
