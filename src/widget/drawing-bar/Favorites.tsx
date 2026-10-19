import {createSignal,For,type Component} from 'solid-js'
import type {DrawingState,DrawingCommand,DrawingCommandResult} from '../../drawing/types'
import type {DrawingToolDescriptor} from '../../drawing/catalog'
import {Icon} from './icons'

const DrawingFavorites:Component<{state:DrawingState;catalog:DrawingToolDescriptor[];locale:string;execute:(command:DrawingCommand)=>Promise<DrawingCommandResult>}>=props=>{
  const [position,setPosition]=createSignal<{x:number;y:number}>(),[dragging,setDragging]=createSignal(false)
  let toolbar:HTMLDivElement|undefined,start:{x:number;y:number;left:number;top:number}|undefined
  const location=()=>position()??props.state.preferences?.value.ui.favoritesPosition??{x:72,y:10}
  const end=(event:PointerEvent,cancel=false)=>{
    if(!dragging())return
    setDragging(false);start=undefined
    if(event.currentTarget instanceof Element&&event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
    if(cancel){setPosition(undefined);return}
    const ui=props.state.preferences?.value.ui
    if(ui)void props.execute({type:'preferences',patch:{ui:{...ui,favoritesPosition:location()}}})
  }
  return <div ref={toolbar} class="tc-drawing-favorites" role="toolbar" aria-label={props.locale==='en-US'?'Favorite drawing tools':'收藏绘图工具'} style={{left:`${location().x}px`,top:`${location().y}px`}}>
    <button aria-label={props.locale==='en-US'?'Move favorites toolbar':'移动收藏栏'} class="tc-favorites-drag" onPointerDown={event=>{const p=location();start={x:event.clientX,y:event.clientY,left:p.x,top:p.y};setDragging(true);event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault()}} onPointerMove={event=>{if(!start||!toolbar?.parentElement)return;const parent=toolbar.parentElement;setPosition({x:Math.max(0,Math.min(parent.clientWidth-toolbar.offsetWidth,start.left+event.clientX-start.x)),y:Math.max(0,Math.min(parent.clientHeight-toolbar.offsetHeight,start.top+event.clientY-start.y))})}} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)}>⠿</button>
    <For each={props.state.preferences?.value.favorites??[]}>{id=>{
      const tool=()=>props.catalog.find(t=>t.toolId===id)
      return <button title={`${tool()?.labels[props.locale==='en-US'?'en-US':'zh-CN']??id} ${props.state.preferences?.value.shortcuts[id]??tool()?.shortcut??''}`} aria-label={tool()?.labels[props.locale==='en-US'?'en-US':'zh-CN']??id} aria-pressed={props.state.toolId===id} onClick={()=>void props.execute({type:'tool',toolId:id})}><Icon name={tool()?.icon??id}/></button>
    }}</For>
  </div>
}
export default DrawingFavorites
