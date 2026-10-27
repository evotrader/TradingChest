import {createSignal,onMount,onCleanup,type Component} from 'solid-js'
import type {DrawingCommand,DrawingCommandResult} from '../../drawing/types'

const TranslateForm:Component<{ids:string[];locale:string;bars:boolean;price:boolean;tickSize?:number;submit:(command:Extract<DrawingCommand,{type:'translate'}>)=>Promise<DrawingCommandResult>;cancel:()=>void}>=props=>{
  const [bars,setBars]=createSignal(''),[amount,setAmount]=createSignal(''),[unit,setUnit]=createSignal<'price'|'tick'>('price'),[busy,setBusy]=createSignal(false),[error,setError]=createSignal('')
  const t=(zh:string,en:string)=>props.locale==='en-US'?en:zh
  let form:HTMLFormElement|undefined
  const previous=document.activeElement as HTMLElement|null
  onMount(()=>form?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
  onCleanup(()=>{if(previous?.isConnected)previous.focus()})
  const submit=async(event:SubmitEvent)=>{
    event.preventDefault();if(busy())return
    const time=props.bars?bars().trim():'',value=props.price?amount().trim():''
    if(!time&&!value){setError(t('请输入至少一项位移，空值不会当成零','Enter at least one displacement; empty fields are not zero'));return}
    if(time&&!Number.isSafeInteger(Number(time))||value&&(!Number.isFinite(Number(value))||unit()==='tick'&&!Number.isSafeInteger(Number(value)))){setError(t('根数和tick数量须为安全整数，价格须为有限数值','Bars and ticks must be safe integers; price must be finite'));return}
    setBusy(true);setError('')
    try{
      const result=await props.submit({type:'translate',ids:[...props.ids],...(time?{bars:Number(time)}:{}),...(value?{price:{unit:unit(),amount:Number(value)}}:{})})
      if(result.status==='completed')props.cancel()
      else setError(result.message??result.items.find(item=>item.status!=='confirmed')?.message??t('部分操作尚未确认，请核对结果','Some operations are not confirmed; review the result'))
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}
  }
  return <form ref={form} class="tc-drawing-translate" aria-label={t('精确平移','Precise translation')} onSubmit={submit} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(!busy())props.cancel()}}}>
    <fieldset disabled={busy()}><legend>{t('精确平移','Precise translation')} · {props.ids.length}</legend>
      <label>{t('K线根数','Bars')}<input type="number" step="1" disabled={!props.bars} value={bars()} onInput={event=>setBars(event.currentTarget.value)}/></label>
      <label>{t('价格位移','Price displacement')}<input type="number" step={unit()==='tick'?'1':'any'} disabled={!props.price} value={amount()} onInput={event=>setAmount(event.currentTarget.value)}/></label>
      <label>{t('价格单位','Price unit')}<select disabled={!props.price} value={unit()} onChange={event=>setUnit(event.currentTarget.value as 'price'|'tick')}><option value="price">{t('价格值','Price value')}</option><option value="tick" disabled={!Number.isFinite(props.tickSize)||!(props.tickSize!>0)}>Tick</option></select></label>
      <p>{t('正数向右或向上，负数向左或向下。只移动到已加载的真实K线；所有对象一次撤销。','Positive values move right or up, negative values left or down. Targets must be loaded real bars; one undo covers the batch.')}</p>
      <p role="alert">{error()}</p>
      <button type="button" onClick={()=>props.cancel()}>{t('取消平移','Cancel translation')}</button><button type="submit">{t('确认平移','Confirm translation')}</button>
    </fieldset>
    <p role="status">{busy()?t('正在逐对象确认，请稍候','Confirming each object, please wait'):''}</p>
  </form>
}
export default TranslateForm
