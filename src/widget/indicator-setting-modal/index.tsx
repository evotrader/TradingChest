import {type Component,createSignal,For,Show} from 'solid-js'
import {Modal} from '../../component'
import i18n from '../../i18n'
import {parameterAt,parameterBounds,validateIndicatorParams,type IndicatorDescriptor,type IndicatorParameterValue} from '../../indicator/catalog'
export interface IndicatorSettingModalProps {
  locale:string
  descriptor:IndicatorDescriptor
  params:{indicatorName:string;paneId:string;calcParams:unknown[]}
  onClose:()=>void
  onConfirm:(calcParams:IndicatorParameterValue[])=>void
}
const IndicatorSettingModal:Component<IndicatorSettingModalProps>=props=>{
  const [params,setParams]=createSignal<unknown[]>(structuredClone(props.params.calcParams)),[error,setError]=createSignal('')
  const set=(index:number,value:unknown)=>setParams(p=>p.map((v,i)=>i===index?value:v))
  const schema=()=>props.descriptor.parameters
  return <Modal title={props.params.indicatorName} width={360} onClose={props.onClose} buttons={[{type:'confirm',children:i18n('confirm',props.locale),onClick:()=>{try{
    if(!schema())throw Error(i18n('indicator_readonly',props.locale))
    validateIndicatorParams(props.descriptor,params());props.onConfirm(params() as IndicatorParameterValue[]);props.onClose()
  }catch(e){setError(e instanceof Error?e.message:String(e))}}}]}>
    <Show when={error()}><div role="alert">{error()}</div></Show>
    <div class="klinecharts-pro-indicator-setting-modal-content"><For each={params()}>{(value,index)=>{
      const p=()=>schema()?parameterAt(schema()!,index()):undefined
      return <><span>{i18n(p()?.label??`params_${index()+1}`,props.locale)}</span><Show when={p()} fallback={<span>{String(value)}</span>}>
        {(()=>{const config=p()!;if(config.type==='boolean')return <input type="checkbox" checked={value===true} onChange={e=>set(index(),e.currentTarget.checked)}/>
          if(config.type==='select')return <select aria-label={config.label} value={config.options.findIndex(o=>o.value===value)} onChange={e=>set(index(),config.options[Number(e.currentTarget.value)].value)}><For each={config.options}>{(o,i)=><option value={i()}>{o.label}</option>}</For></select>
          return <input type="number" aria-label={config.label} min={config.min} max={config.max} step={config.step??'any'} value={String(value)} onInput={e=>set(index(),e.currentTarget.value===''?NaN:Number(e.currentTarget.value))}/>
        })()}
      </Show></>
    }}</For></div>
    <Show when={schema()&&(schema()!.repeat||schema()!.items.some(p=>p.optional))}><div>
      <button disabled={params().length>=parameterBounds(schema()!).max} onClick={()=>{const p=parameterAt(schema()!,params().length);if(p)setParams(v=>[...v,p.type==='boolean'?false:p.type==='select'?p.options[0].value:p.min??0])}}>＋</button>
      <button disabled={params().length<=parameterBounds(schema()!).min+(schema()!.repeat?.minItems??0)} onClick={()=>setParams(v=>v.slice(0,-1))}>−</button>
    </div></Show>
  </Modal>
}
export default IndicatorSettingModal
