import {type Component,createSignal,createMemo,For,Show,onMount} from 'solid-js'
import {Modal,List} from '../../component'
import i18n from '../../i18n'
import {indicatorCategories} from '../../indicator'
import {indicatorLabel,type IndicatorDescriptor,type IndicatorInstance,type IndicatorPlacement} from '../../indicator/catalog'

export interface IndicatorModalProps {
  locale:string
  catalog:IndicatorDescriptor[]
  instances:IndicatorInstance[]
  onAdd:(name:string,placement:IndicatorPlacement)=>Promise<unknown>
  onRemove:(id:string)=>void
  onUpdate:(id:string,visible:boolean)=>void
  onSettings:(id:string)=>void
  onClose:()=>void
}
const IndicatorModal:Component<IndicatorModalProps>=props=>{
  const [search,setSearch]=createSignal(''),[category,setCategory]=createSignal('all'),[error,setError]=createSignal(''),[pending,setPending]=createSignal(false)
  let searchInputRef:HTMLInputElement|undefined
  onMount(()=>searchInputRef?.focus())
  const entries=createMemo(()=>props.catalog.filter(d=>(category()==='all'||d.category===category())&&`${d.name} ${indicatorLabel(d,props.locale)}`.toLowerCase().includes(search().toLowerCase())))
  const run=async(action:()=>unknown)=>{if(pending())return;setPending(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setPending(false)}}
  return <Modal title={i18n('indicator',props.locale)} width={480} onClose={props.onClose}>
    <div class="klinecharts-pro-indicator-modal-search"><div class="klinecharts-pro-input"><input ref={searchInputRef} class="value" placeholder={i18n('indicator_search',props.locale)} value={search()} onInput={e=>setSearch(e.currentTarget.value)}/></div></div>
    <div class="klinecharts-pro-indicator-modal-tabs"><For each={['all',...new Set(props.catalog.map(d=>d.category))]}>{key=><button class={`klinecharts-pro-indicator-modal-tab${category()===key?' active':''}`} onClick={()=>setCategory(key)}>{key==='all'?i18n('all_categories',props.locale):i18n(indicatorCategories[key]?.labelKey??key,props.locale)}</button>}</For></div>
    <Show when={error()}><div role="alert">{error()}</div></Show>
    <List class="klinecharts-pro-indicator-modal-list"><For each={(['main','sub'] as const)}>{placement=><>
      <Show when={entries().some(d=>d.placements.includes(placement))}><li class="title">{i18n(placement==='main'?'main_indicator':'sub_indicator',props.locale)}</li></Show>
      <For each={entries().filter(d=>d.placements.includes(placement))}>{d=><li class="row" data-indicator-name={d.name} data-placement={placement}>
        <button disabled={pending()} onClick={()=>void run(()=>props.onAdd(d.name,placement))}>{indicatorLabel(d,props.locale)} ＋</button>
        <For each={props.instances.filter(i=>i.name===d.name&&(i.paneId==='candle_pane')===(placement==='main'))}>{instance=><div data-indicator-id={instance.id} style={{display:'flex',gap:'6px','flex-wrap':'wrap'}}>
          <span>{instance.calcParams.join(', ')}</span>
          <button aria-label={`${i18n('visible',props.locale)} ${instance.id}`} onClick={()=>void run(()=>props.onUpdate(instance.id,!instance.visible))}>{instance.visible?'◉':'○'}</button>
          <button disabled={!d.parameters} title={!d.parameters?i18n('indicator_readonly',props.locale):undefined} onClick={()=>props.onSettings(instance.id)}>{i18n('setting',props.locale)}</button>
          <button onClick={()=>void run(()=>props.onRemove(instance.id))}>{i18n('remove',props.locale)}</button>
        </div>}</For>
      </li>}</For>
    </>}</For><Show when={!entries().length}><li class="klinecharts-pro-indicator-modal-empty">{i18n('no_indicators_found',props.locale)}</li></Show></List>
  </Modal>
}
export default IndicatorModal
