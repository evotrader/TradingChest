import {For,type Component} from 'solid-js'
export const PALETTE_COLORS = [
  '#ffffff', '#d1d4dc', '#b2b5be', '#787b86', '#434651', '#363a45', '#2a2e39', '#1e222d', '#131722',
  '#f44336', '#ff5252', '#ff8a80', '#ef5350', '#e53935', '#c62828', '#b71c1c', '#880e4f', '#ad1457',
  '#ff9800', '#ffb74d', '#ffe0b2', '#ff6d00', '#f57c00', '#e65100', '#bf360c', '#ff6f00', '#ff8f00',
  '#ffeb3b', '#fff176', '#fff9c4', '#fdd835', '#f9a825', '#f57f17', '#fbc02d', '#ffd600', '#ffea00',
  '#4caf50', '#66bb6a', '#a5d6a7', '#00c853', '#00e676', '#2e7d32', '#1b5e20', '#33691e', '#00bfa5',
  '#00bcd4', '#4dd0e1', '#80deea', '#00acc1', '#0097a7', '#00838f', '#006064', '#00897b', '#009688',
  '#2196f3', '#42a5f5', '#90caf9', '#1e88e5', '#1565c0', '#0d47a1', '#01579b', '#0277bd', '#1677ff',
  '#9c27b0', '#ab47bc', '#ce93d8', '#8e24aa', '#6a1b9a', '#4a148c', '#7b1fa2', '#6200ea', '#651fff',
]

export const ColorPalette:Component<{label:string;locale?:string;value?:string;transparent?:boolean;choose:(color:string)=>void;close:()=>void}>=props=><div role="group" aria-label={props.label} class="tc-drawing-color-palette" onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();props.close();return}
  const buttons=Array.from(event.currentTarget.querySelectorAll('button')),index=buttons.indexOf(document.activeElement as HTMLButtonElement),delta=({ArrowRight:1,ArrowLeft:-1,ArrowDown:6,ArrowUp:-6} as Record<string,number>)[event.key]
  if(delta!==undefined){event.preventDefault();buttons[(index+delta+buttons.length)%buttons.length]?.focus()}
}}><For each={[...(props.transparent?['transparent']:[]),...PALETTE_COLORS]}>{color=><button type="button" aria-label={color==='transparent'?'transparent':color} aria-pressed={props.value===color} title={color} style={{'background-color':color}} onClick={()=>props.choose(color)}>{color==='transparent'?'∅':''}</button>}</For><label style={{'grid-column':'1 / -1',display:'flex','align-items':'center',gap:'8px'}}>{props.locale==='en-US'?'Custom color':'自定义颜色'}<input type="color" aria-label={props.locale==='en-US'?'Custom color':'自定义颜色'} value={/^#[a-f0-9]{6}/i.test(props.value??'')?props.value!.slice(0,7):'#1677ff'} style={{width:'64px',height:'44px'}} onChange={event=>props.choose(event.currentTarget.value)}/></label></div>
