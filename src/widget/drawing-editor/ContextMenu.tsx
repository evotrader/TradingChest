import {For,onMount,onCleanup,type Component} from 'solid-js'

const DrawingContextMenu:Component<{x:number;y:number;label:string;items:Array<{label:string;disabled?:boolean;run:()=>void}>;close:()=>void}>=props=>{
  let menu:HTMLDivElement|undefined
  const previous=document.activeElement as HTMLElement|null
  onMount(()=>menu?.querySelector('button')?.focus())
  onCleanup(()=>{if(previous?.isConnected)previous.focus()})
  return <div ref={menu} role="menu" aria-label={props.label} class="tc-drawing-context" style={{left:`${props.x}px`,top:`${props.y}px`}} onKeyDown={event=>{
    event.stopPropagation()
    if(event.key==='Escape'){event.preventDefault();props.close()}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}
  }}><For each={props.items}>{item=><button role="menuitem" disabled={item.disabled} onClick={()=>{item.run();props.close()}}>{item.label}</button>}</For></div>
}
export default DrawingContextMenu
