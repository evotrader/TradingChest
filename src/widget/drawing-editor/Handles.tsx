import {For,createMemo,onCleanup,type Component} from 'solid-js'

export interface DrawingHandle {id:string;index:number;x:number;y:number;label:string;locked:boolean}
const DrawingHandles:Component<{locale:string;handles:DrawingHandle[];suspended:boolean;start:(handle:DrawingHandle)=>void;move:(handle:DrawingHandle,event:PointerEvent)=>void;end:(handle:DrawingHandle,cancel:boolean)=>void;nudge:(handle:DrawingHandle,dx:number,dy:number)=>void}>=props=>{
  let active:DrawingHandle|undefined
  onCleanup(()=>{active=undefined})
  const objects=createMemo(()=>new Map(props.handles.map(handle=>[`${handle.id}:${handle.index}`,handle])))
  return <div class="tc-drawing-handles"><For each={props.handles.map(handle=>`${handle.id}:${handle.index}`)}>{key=>{
    const handle=()=>objects().get(key)!
    return <button class="tc-drawing-handle" aria-label={handle().label} title={props.locale==='en-US'?'Arrow keys move this point; Shift moves 10px; hold Space to pan':'方向键移动控制点，Shift + 方向键移动 10px；空格临时平移'} aria-disabled={handle().locked||props.suspended} style={{left:`${handle().x-22}px`,top:`${handle().y-22}px`,'pointer-events':props.suspended?'none':'auto'}}
      onKeyDown={event=>{const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=directions[event.key];if(delta){event.preventDefault();event.stopPropagation();if(!props.suspended&&!handle().locked)props.nudge(handle(),delta[0]*(event.shiftKey?10:1),delta[1]*(event.shiftKey?10:1))}}}
      onPointerDown={event=>{event.stopPropagation();event.preventDefault();if(handle().locked||props.suspended)return;event.currentTarget.focus();active=handle();event.currentTarget.setPointerCapture(event.pointerId);props.start(active)}}
      onPointerMove={event=>{if(active){event.stopPropagation();props.move(active,event)}}}
      onPointerUp={event=>{if(!active)return;event.stopPropagation();const selected=active;active=undefined;props.end(selected,false);event.currentTarget.releasePointerCapture(event.pointerId)}}
      onPointerCancel={event=>{if(active){event.stopPropagation();const selected=active;active=undefined;props.end(selected,true)}}}
      onLostPointerCapture={()=>{if(active){const selected=active;active=undefined;props.end(selected,true)}}}><span/></button>
  }}</For></div>
}
export default DrawingHandles
