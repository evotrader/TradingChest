import {createSignal,onMount,onCleanup,type Component} from 'solid-js'

const DrawingTextEditor:Component<{value:string;locale:string;onConfirm:(value:string)=>void;onCancel:()=>void}>=props=>{
  const [value,setValue]=createSignal(props.value)
  let input:HTMLTextAreaElement|undefined,composing=false
  const previous=document.activeElement as HTMLElement|null
  const en=()=>props.locale==='en-US'
  onMount(()=>{input?.focus();input?.select()})
  onCleanup(()=>{if(previous?.isConnected)previous.focus()})
  return <div class="tc-drawing-dialog-backdrop" onPointerDown={event=>event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-label={en()?'Edit drawing text':'编辑绘图文字'} class="tc-drawing-dialog" onKeyDown={event=>{
      event.stopPropagation()
      if(event.key==='Escape'){event.preventDefault();props.onCancel()}
      if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!composing&&!event.isComposing){event.preventDefault();props.onConfirm(value())}
      if(event.key==='Tab'){const buttons=event.currentTarget.querySelectorAll<HTMLElement>('textarea,button');const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
    }}>
      <label>{en()?'Drawing text':'绘图文字'}<textarea ref={input} rows={5} value={value()} onInput={event=>setValue(event.currentTarget.value)} onCompositionStart={()=>{composing=true}} onCompositionEnd={()=>{composing=false}}/></label>
      <p>{en()?'Enter: new line · Ctrl/Cmd+Enter: confirm · Esc: cancel':'Enter 换行 · Ctrl/Cmd+Enter 确认 · Esc 取消'}</p>
      <div><button onClick={()=>props.onCancel()}>{en()?'Cancel':'取消'}</button><button onClick={()=>props.onConfirm(value())}>{en()?'Confirm':'确认'}</button></div>
    </section>
  </div>
}
export default DrawingTextEditor
