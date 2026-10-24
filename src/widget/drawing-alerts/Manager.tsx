import {createSignal,createEffect,onMount,onCleanup,For,Show,type Component} from 'solid-js'
import type {DrawingAlertCommand,DrawingAlertCommandResult,DrawingAlertCondition,DrawingAlertFrequency,DrawingAlertState} from '../../alert/drawingTypes'
import type {DrawingSnapshot} from '../../drawing/types'
import './style.less'

const Manager:Component<{
  locale:string;states:DrawingAlertState[];objects:DrawingSnapshot[];sourceId?:string;replay:boolean
  execute:(command:DrawingAlertCommand)=>DrawingAlertCommandResult
  sourceReason:(id:string)=>string|undefined
  locate:(id:string)=>boolean
  close:()=>void
}>=props=>{
  const t=(zh:string,en:string)=>props.locale==='en-US'?en:zh
  const [source,setSource]=createSignal(''),[editing,setEditing]=createSignal<string>(),[condition,setCondition]=createSignal<DrawingAlertCondition>('crossing'),[frequency,setFrequency]=createSignal<DrawingAlertFrequency>('once'),[message,setMessage]=createSignal(''),[notice,setNotice]=createSignal('')
  let element:HTMLElement|undefined,alive=true
  const escape=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&!event.isComposing&&element?.closest('.klinecharts-pro')?.contains(event.target as Node)){event.preventDefault();event.stopPropagation();props.close()}
  }
  onMount(()=>{document.addEventListener('keydown',escape,true);queueMicrotask(()=>{if(alive)element?.querySelector<HTMLButtonElement>('header button')?.focus()})})
  onCleanup(()=>document.removeEventListener('keydown',escape,true))
  onCleanup(()=>{alive=false})
  createEffect(()=>{setSource(props.sourceId??'');setEditing(undefined);setNotice('')})
  const reset=()=>{setEditing(undefined);setMessage('');setCondition('crossing');setFrequency('once')}
  const send=(command:DrawingAlertCommand)=>{const result=props.execute(command);setNotice(result.status==='completed'?'':result.message??t('操作被拒绝','Operation rejected'));return result}
  const save=()=>{
    const command:DrawingAlertCommand=editing()?{type:'update',id:editing()!,patch:{condition:condition(),frequency:frequency(),message:message()}}:{type:'create',drawingLogicalId:source(),condition:condition(),frequency:frequency(),message:message()}
    if(send(command).status==='completed'){reset();setNotice(t('提醒已保存；等待新样本建立比较点','Alert saved; waiting for a new observation'))}
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
        <label>{t('绘图来源','Drawing source')}<select aria-label={t('提醒来源','Alert source')} disabled={!!editing()} value={source()} onChange={event=>setSource(event.currentTarget.value)}><option value="">{t('请选择绘图','Select a drawing')}</option><For each={props.objects}>{object=><option value={object.logicalId}>{object.presentation?.name??object.logicalId} · {object.overlay.name}</option>}</For></select></label>
        <p>{t('支持本图已确认的水平线、直线、线段及射线；线段保留有限范围。其它工具、共享作用域和独立价格轴暂不支持。','Supports confirmed chart-local horizontal lines, extended lines, segments and rays. Segments keep their finite domain. Other tools, shared scopes and independent axes are unsupported.')}</p>
        <Show when={source()&&props.sourceReason(source())}>{reason=><p role="status">{reason()}</p>}</Show>
        <label>{t('条件','Condition')}<select aria-label={t('提醒条件','Alert condition')} value={condition()} onChange={event=>setCondition(event.currentTarget.value as DrawingAlertCondition)}><For each={['crossing','crossing-up','crossing-down'] as const}>{value=><option value={value}>{conditionLabel(value)}</option>}</For></select></label>
        <label>{t('频率','Frequency')}<select aria-label={t('提醒频率','Alert frequency')} value={frequency()} onChange={event=>setFrequency(event.currentTarget.value as DrawingAlertFrequency)}><option value="once">{t('仅一次','Once')}</option><option value="once-per-bar">{t('每根 K 线最多一次','Once per bar')}</option></select></label>
        <label>{t('消息','Message')}<textarea aria-label={t('提醒消息','Alert message')} value={message()} onInput={event=>setMessage(event.currentTarget.value)}/></label>
        <button type="submit" disabled={!source()||!!props.sourceReason(source())}>{editing()?t('保存修改','Save changes'):t('创建提醒','Create alert')}</button><Show when={editing()}><button type="button" onClick={reset}>{t('取消编辑','Cancel editing')}</button></Show>
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
          <button onClick={()=>{setEditing(state.rule.id);setSource(state.rule.drawingLogicalId);setCondition(state.rule.condition);setFrequency(state.rule.frequency);setMessage(state.rule.message??'');setNotice('');element?.querySelector<HTMLSelectElement>('[aria-label="提醒条件"],[aria-label="Alert condition"]')?.focus()}}>{t('编辑','Edit')}</button>
          <button onClick={()=>{if(!props.locate(state.rule.drawingLogicalId))setNotice(t('来源不在当前图中，无法定位；请切回原标的及周期','Source is unavailable; return to its original series and period'))}}>{t('定位','Locate')}</button>
          <button onClick={()=>{if(send({type:'delete',id:state.rule.id}).status==='completed'&&editing()===state.rule.id)reset()}}>{t('删除','Delete')}</button>
          <details><summary>{t('触发历史','Trigger history')} ({current().records.length})</summary><Show when={current().records.length} fallback={<p>{t('尚未触发','No triggers')}</p>}><ol><For each={[...current().records].reverse()}>{event=><li>{event.mode==='replay'?t('回放','Replay'):t('实时','Live')} · {new Date(event.barTimestamp).toISOString()} · {t('触发价','Trigger price')} {event.triggerPrice} · {t('参考价','Reference price')} {event.referencePrice}</li>}</For></ol></Show></details>
        </li>
      }}</For></ul>
    </Show>
  </aside>
}
export default Manager
