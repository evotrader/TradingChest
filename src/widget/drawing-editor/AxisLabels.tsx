import {For,createMemo,type Component} from 'solid-js'
import {translatedPlacement} from './placement'
interface Label {id:string;x:number;y:number;text:string;side:'left'|'right'|'time'}
const LabelLayer:Component<{labels:Label[]}>=props=>{
 const place=translatedPlacement<Label>(label=>label.id),placement=createMemo(()=>place(props.labels))
 return <div class="tc-drawing-label-layer" style={{transform:`translate(${placement().dx}px,${placement().dy}px)`}}><For each={props.labels.map(label=>label.id)}>{id=>{
  const initial=placement().objects.get(id)!,entry=()=>placement().objects.get(id)??initial,label=()=>entry().value,text=createMemo(()=>label().text),side=createMemo(()=>label().side),x=createMemo(()=>entry().x),y=createMemo(()=>entry().y)
  return <span class={`tc-drawing-axis-label tc-drawing-axis-${side()}`} title={text()} data-drawing-axis-label={id} style={{left:`${x()}px`,top:`${y()}px`}}>{text()}</span>
 }}</For></div>
}
const DrawingAxisLabels:Component<{labels:Label[]}>=props=><div class="tc-drawing-axis-labels"><LabelLayer labels={props.labels.filter(label=>label.side!=='time')}/><LabelLayer labels={props.labels.filter(label=>label.side==='time')}/></div>
export default DrawingAxisLabels
