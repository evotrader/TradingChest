import {createSignal,createEffect,onMount,onCleanup,For,type Component} from 'solid-js'
import type {DrawingState,DrawingCommand,DrawingCommandResult} from '../../drawing/types'
import type {DrawingToolDescriptor} from '../../drawing/catalog'
import {Icon} from './icons'

const DrawingFavorites:Component<{state:DrawingState;catalog:DrawingToolDescriptor[];locale:string;execute:(command:DrawingCommand)=>Promise<DrawingCommandResult>}>=props=>{
  const [position,setPosition]=createSignal<{x:number;y:number}>(),[dragging,setDragging]=createSignal(false)
  let parentSize:{width:number;height:number}|undefined,toolbarSize:{width:number;height:number}|undefined
  let toolbar:HTMLDivElement|undefined,start:{x:number;y:number;left:number;top:number}|undefined
  const location=()=>position()??props.state.preferences?.value.ui.favoritesPosition??{x:72,y:10}
  const clamp=(value:{x:number;y:number})=>parentSize&&toolbarSize?{x:Math.max(0,Math.min(value.x,parentSize.width-toolbarSize.width)),y:Math.max(0,Math.min(value.y,parentSize.height-toolbarSize.height))}:value
  const save=()=>{const ui=props.state.preferences?.value.ui;if(ui)void props.execute({type:'preferences',patch:{ui:{...ui,favoritesPosition:location()}}})}
  const fit=()=>{if(!toolbar)return;const before=location(),next=clamp(before);if(before.x!==next.x||before.y!==next.y)setPosition(next)}
  createEffect(()=>{location();fit()})
  let observer:ResizeObserver|undefined
  onMount(()=>{observer=new ResizeObserver(entries=>{for(const entry of entries){const border=entry.borderBoxSize?.[0],size={width:border?.inlineSize??entry.contentRect.width,height:border?.blockSize??entry.contentRect.height};if(entry.target===toolbar)toolbarSize=size;else parentSize=size}fit()});if(toolbar?.parentElement)observer.observe(toolbar.parentElement);if(toolbar)observer.observe(toolbar)})
  onCleanup(()=>observer?.disconnect())
  const end=(event:PointerEvent,cancel=false)=>{
    if(!dragging())return
    setDragging(false);start=undefined
    if(event.currentTarget instanceof Element&&event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
    if(cancel){setPosition(undefined);return}
    const ui=props.state.preferences?.value.ui
    if(ui)void props.execute({type:'preferences',patch:{ui:{...ui,favoritesPosition:location()}}})
  }
  return <div ref={toolbar} class="tc-drawing-favorites" role="toolbar" aria-label={props.locale==='en-US'?'Favorite drawing tools':'收藏绘图工具'} style={{left:`${location().x}px`,top:`${location().y}px`}}>
    <button aria-label={props.locale==='en-US'?'Move favorites toolbar':'移动收藏栏'} class="tc-favorites-drag" onKeyDown={event=>{const keys:Record<string,[number,number]>={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]};const delta=keys[event.key];if(delta){event.preventDefault();event.stopPropagation();const current=location();setPosition(clamp({x:current.x+delta[0],y:current.y+delta[1]}));save()}}} onPointerDown={event=>{event.currentTarget.focus();const p=location();start={x:event.clientX,y:event.clientY,left:p.x,top:p.y};setDragging(true);event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault()}} onPointerMove={event=>{if(!start||!toolbar?.parentElement)return;setPosition(clamp({x:start.left+event.clientX-start.x,y:start.top+event.clientY-start.y}))}} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)}><svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true"><path fill="currentColor" d="M4 3h3v3H4zM10 3h3v3h-3zM4 9h3v3H4zM10 9h3v3h-3zM4 15h3v3H4zM10 15h3v3h-3z"/></svg></button>
    <For each={props.state.preferences?.value.favorites??[]}>{id=>{
      const tool=()=>props.catalog.find(t=>t.toolId===id)
      return <button title={`${tool()?.labels[props.locale==='en-US'?'en-US':'zh-CN']??id} ${props.state.preferences?.value.shortcuts[id]??tool()?.shortcut??''}`} aria-label={tool()?.labels[props.locale==='en-US'?'en-US':'zh-CN']??id} aria-pressed={props.state.toolId===id} onClick={()=>void props.execute({type:'tool',toolId:id})}><Icon name={tool()?.icon??id}/></button>
    }}</For>
  </div>
}
export default DrawingFavorites
