import {For,createMemo,onCleanup,type Component} from 'solid-js'
import {translatedPlacement} from './placement'

export interface DrawingHandle {id:string;index:number;x:number;y:number;label:string;locked:boolean;timeOnly?:boolean}
const DrawingHandles:Component<{locale:string;handles:DrawingHandle[];suspended:boolean;start:(handle:DrawingHandle)=>void;move:(handle:DrawingHandle,event:PointerEvent)=>void;end:(handle:DrawingHandle,cancel:boolean)=>void|Promise<void>;nudge:(handle:DrawingHandle,dx:number,dy:number)=>void}>=props=>{
  const suspended=createMemo(()=>props.suspended)
  let active:DrawingHandle|undefined
  onCleanup(()=>{active=undefined})
  const place=translatedPlacement<DrawingHandle>(handle=>`${handle.id}:${handle.index}`),placement=createMemo(()=>place(props.handles))
  const end=(button:HTMLElement,handle:DrawingHandle,cancel:boolean)=>{
    const reset=()=>{const current=placement().objects.get(`${handle.id}:${handle.index}`);if(current&&button.isConnected){button.style.left=`${current.x-22}px`;button.style.top=`${current.y-22}px`}}
    try{const done=props.end(handle,cancel);if(done)void done.then(reset,reset);else reset()}catch(error){reset();throw error}
  }
  return <div class="tc-drawing-handles"><div class="tc-drawing-handle-layer" style={{transform:`translate(${placement().dx}px,${placement().dy}px)`}}><For each={props.handles.map(handle=>`${handle.id}:${handle.index}`)}>{key=>{
    const initial=placement().objects.get(key)!,entry=()=>placement().objects.get(key)??initial,handle=()=>entry().value
    // A coordinate update must not invalidate unchanged labels and interaction attributes.
    const label=createMemo(()=>handle().label),timeOnly=createMemo(()=>handle().timeOnly),locked=createMemo(()=>handle().locked),x=createMemo(()=>entry().x),y=createMemo(()=>entry().y)
    return <button class="tc-drawing-handle" aria-label={label()} title={timeOnly()?(props.locale==='en-US'?'Left/right moves one real bar; Shift moves ten bars':'左右键移动一根真实 K 线，Shift 移动十根') :props.locale==='en-US'?'Arrow keys move this point; Shift moves 10px; hold Space to pan':'方向键移动控制点，Shift + 方向键移动 10px；空格临时平移'} aria-disabled={locked()||suspended()} style={{left:`${x()-22}px`,top:`${y()-22}px`,'pointer-events':suspended()?'none':'auto'}}
      onKeyDown={event=>{const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=directions[event.key];if(delta){event.preventDefault();event.stopPropagation();if(!suspended()&&!handle().locked)props.nudge(handle(),delta[0]*(event.shiftKey?10:1),delta[1]*(event.shiftKey?10:1))}}}
      onPointerDown={event=>{event.stopPropagation();event.preventDefault();if(handle().locked||suspended())return;event.currentTarget.focus();active=handle();event.currentTarget.setPointerCapture(event.pointerId);props.start(active)}}
      onPointerMove={event=>{if(active){event.stopPropagation();props.move(active,event)}}}
      onPointerUp={event=>{if(!active)return;event.stopPropagation();const selected=active;active=undefined;end(event.currentTarget,selected,false);event.currentTarget.releasePointerCapture(event.pointerId)}}
      onPointerCancel={event=>{if(active){event.stopPropagation();const selected=active;active=undefined;end(event.currentTarget,selected,true)}}}
      onLostPointerCapture={event=>{if(active){const selected=active;active=undefined;end(event.currentTarget,selected,true)}}}><span/></button>
  }}</For></div></div>
}
export default DrawingHandles
