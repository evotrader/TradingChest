import {createEffect,onCleanup,type Component} from 'solid-js'
import type {AnalysisEvent} from './types'

/** Keep every source event accessible without a reactive root/listener per row. */
const AnalysisEventList:Component<{events:AnalysisEvent[];onSelect:(id:string)=>void}>=props=>{
  const list=document.createElement('ul')
  let renderedEvents:AnalysisEvent[]=[]
  const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\r':'&#13;'}
  const escape=(value:string)=>value.replace(/[&<>"'\r]/g,char=>entities[char])
  const text=(event:AnalysisEvent)=>`${event.label} · ${new Date(event.timestamp).toISOString()}${event.endTimestamp!==undefined?` → ${new Date(event.endTimestamp).toISOString()}`:''}`
  createEffect(()=>{
    // Parse the complete escaped list in one DOM write; no source rows are dropped.
    const events=props.events
    list.innerHTML=events.map((event,index)=>{
      return `<li class="klinecharts-pro-analysis-event"><button type="button" data-analysis-event-index="${index}">${escape(text(event))}</button></li>`
    }).join('')
    // HTML parsing replaces NUL; preserve unusual source labels through textContent.
    events.forEach((event,index)=>{if(event.label.includes('\0'))list.children[index].firstElementChild!.textContent=text(event)})
    renderedEvents=events
  })
  const select=(event:MouseEvent)=>{
    const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button[data-analysis-event-index]'):null
    const index=Number(button?.dataset.analysisEventIndex),source=Number.isInteger(index)?renderedEvents[index]:undefined
    if(button&&list.contains(button)&&source)props.onSelect(source.id)
  }
  list.addEventListener('click',select)
  onCleanup(()=>list.removeEventListener('click',select))
  return list
}
export default AnalysisEventList
