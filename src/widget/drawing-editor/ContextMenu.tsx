import {For,Show,createSignal,createMemo,createEffect,onMount,onCleanup,type Component} from 'solid-js'
import {createOpaqueId} from '../../ids'

export interface DrawingOverlapCandidate {id:string;label:string;disabled?:boolean;reason?:string}
const DrawingContextMenu:Component<{x:number;y:number;label:string;items:Array<{label:string;disabled?:boolean;run:()=>void}>;close:()=>void;candidates?:DrawingOverlapCandidate[];candidateLabel?:string;choose?:(id:string)=>void}>=props=>{
  let menu:HTMLDivElement|undefined,list:HTMLDivElement|undefined,alive=true
  const previous=document.activeElement as HTMLElement|null,listId=`tc-overlap-${createOpaqueId()}`
  const [picking,setPicking]=createSignal(false),[active,setActive]=createSignal(''),[scroll,setScroll]=createSignal(0)
  const rows=createMemo(()=>props.candidates??[]),index=()=>Math.max(0,rows().findIndex(row=>row.id===active())),start=()=>Math.max(0,Math.floor(scroll()/44)-2)
  const focus=(next:number)=>{
    const position=Math.max(0,Math.min(rows().length-1,next));setActive(rows()[position]?.id??'')
    if(list){if(position*44<list.scrollTop)list.scrollTop=position*44;else if((position+1)*44>list.scrollTop+list.clientHeight)list.scrollTop=(position+1)*44-list.clientHeight;setScroll(list.scrollTop)}
  }
  const choose=(row:DrawingOverlapCandidate)=>{if(row.disabled)return;props.choose?.(row.id);props.close()}
  createEffect(()=>{rows();focus(index())})
  onMount(()=>menu?.querySelector('button')?.focus())
  onCleanup(()=>{alive=false;if(previous?.isConnected)previous.focus()})
  return <div ref={menu} role={picking()?'dialog':'menu'} aria-label={props.label} class="tc-drawing-context" style={{left:`${props.x}px`,top:`${props.y}px`}} on:contextmenu={event=>event.preventDefault()} on:keydown={event=>{
    event.stopPropagation()
    if(event.key==='Escape'){event.preventDefault();props.close()}
    if(!picking()&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],position=items.indexOf(document.activeElement as HTMLButtonElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(position+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}
  }}>
    <Show when={!picking()} fallback={<>
      <strong>{props.candidateLabel}（{rows().length}）</strong>
      <div ref={element=>{list=element;queueMicrotask(()=>{if(alive&&picking()&&element.isConnected)element.focus()})}} class="tc-drawing-overlap-list" role="listbox" tabIndex={0} aria-label={props.candidateLabel} aria-activedescendant={rows().length?`${listId}-${index()}`:undefined} onScroll={event=>setScroll(event.currentTarget.scrollTop)} on:keydown={event=>{
        if(['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==='Enter'){const row=rows()[index()];if(row)choose(row)}else focus(event.key==='Home'?0:event.key==='End'?rows().length-1:index()+(event.key==='ArrowDown'?1:-1))}
      }}><div style={{height:`${rows().length*44}px`,position:'relative'}}><For each={rows().slice(start(),start()+12)}>{(row,offset)=><div id={`${listId}-${start()+offset()}`} role="option" aria-selected={row.id===active()} aria-disabled={row.disabled} aria-posinset={start()+offset()+1} aria-setsize={rows().length} class="tc-drawing-overlap-row" title={`${row.label}${row.reason?` · ${row.reason}`:''}`} style={{top:`${(start()+offset())*44}px`}} onPointerMove={()=>setActive(row.id)} onClick={()=>choose(row)}>{row.label}<Show when={row.reason}><small>{row.reason}</small></Show></div>}</For></div></div>
    </>}>
      <Show when={rows().length}><button role="menuitem" onClick={()=>{setPicking(true);focus(0)}}>{props.candidateLabel}（{rows().length}）</button></Show>
      <For each={props.items}>{item=><button role="menuitem" disabled={item.disabled} onClick={()=>{item.run();props.close()}}>{item.label}</button>}</For>
    </Show>
  </div>
}
export default DrawingContextMenu
