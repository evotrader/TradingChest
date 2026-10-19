import {For,createMemo,type Component} from 'solid-js'
interface Label {id:string;x:number;y:number;text:string;side:'left'|'right'|'time'}
const DrawingAxisLabels:Component<{labels:Label[]}>=props=>{
 const labels=createMemo(()=>new Map(props.labels.map(label=>[label.id,label])))
 return <For each={props.labels.map(label=>label.id)}>{id=>{const label=()=>labels().get(id)!;return <span class={`tc-drawing-axis-label tc-drawing-axis-${label().side}`} title={label().text} data-drawing-axis-label={id} style={{left:`${label().x}px`,top:`${label().y}px`}}>{label().text}</span>}}</For>
}
export default DrawingAxisLabels
