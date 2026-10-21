import {createSignal,createMemo,createEffect,onCleanup,onMount,For,Show,type Component} from 'solid-js'
import type {DrawingSnapshot,DrawingCommand,DrawingCommandResult} from '../../drawing/types'
import {flattenDrawingRows,visibleDrawingRows,legalReorderTargets,type DrawingTreeRow} from './treeRows'

interface Props {
  objects:DrawingSnapshot[]
  allObjects:DrawingSnapshot[]
  selected:string[]
  uncertain:string[]
  searching:boolean
  query:string
  contextKey:string
  locale:string
  label:(drawing:DrawingSnapshot)=>string
  execute:(command:DrawingCommand)=>Promise<DrawingCommandResult>
  locate:(drawing:DrawingSnapshot)=>void
  edit:(drawing:DrawingSnapshot)=>void
  errors?:Record<string,string>
}
type Drag={pointerId:number;ids:string[];originals:string;x:number;y:number;active:boolean;target?:string;position:'before'|'after'}
const DrawingObjectTree:Component<Props>=props=>{
  const en=()=>props.locale==='en-US',t=(zh:string,english:string)=>en()?english:zh
  let viewport:HTMLDivElement|undefined,frame:number|undefined,observer:ResizeObserver|undefined
  const [collapsed,setCollapsed]=createSignal<Set<string>>(new Set()),[scrollTop,setScrollTop]=createSignal(0),[height,setHeight]=createSignal(360),[focused,setFocused]=createSignal<string>(),[drag,setDrag]=createSignal<Drag>(),[notice,setNotice]=createSignal(''),[target,setTarget]=createSignal(''),[position,setPosition]=createSignal<'before'|'after'>('before')
  const rows=createMemo(()=>flattenDrawingRows(props.objects,collapsed(),props.searching))
  const rowMap=createMemo(()=>new Map(rows().map(row=>[row.key,row])))
  const positions=createMemo(()=>new Map(rows().map((row,index)=>[row.key,index+1])))
  const totalHeight=()=>{const last=rows().at(-1);return last?last.top+last.height:0}
  const rendered=createMemo(()=>visibleDrawingRows(rows(),scrollTop(),height()))
  const targets=createMemo(()=>legalReorderTargets(props.allObjects,props.selected,props.uncertain))
  const cancel=()=>{const current=drag();setDrag(undefined);if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined;if(current&&viewport?.hasPointerCapture(current.pointerId))viewport.releasePointerCapture(current.pointerId)}
  let search=props.query
  createEffect(()=>{const next=props.query;if(next!==search){search=next;if(viewport)viewport.scrollTop=0;setScrollTop(0);setFocused(undefined)}})
  let context=props.contextKey
  createEffect(()=>{const next=props.contextKey;if(next!==context){context=next;cancel();setTarget('')}})
  createEffect(()=>{if(target()&&!targets().some(o=>o.logicalId===target()))setTarget('')})
  let previousRows:DrawingTreeRow[]=[]
  createEffect(()=>{
    const current=rows(),maximum=Math.max(0,totalHeight()-height())
    if(viewport&&scrollTop()>maximum){viewport.scrollTop=maximum;setScrollTop(maximum)}
    const pending=drag();if(pending&&pending.originals!==JSON.stringify(props.allObjects.filter(o=>pending.ids.includes(o.logicalId)))){cancel();setNotice(t('绘图已更新，本次排序已取消','Drawings changed; reorder was cancelled'))}
    const key=focused()
    if(key&&!current.some(r=>r.key===key)){
      const next=current[Math.min(Math.max(0,previousRows.findIndex(r=>r.key===key)),current.length-1)]
      if(next&&viewport?.contains(document.activeElement))focusRow(next)
      else setFocused(next?.key)
    }
    previousRows=current
  })
  const toggle=(id:string)=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})
  const focusRow=(row:DrawingTreeRow)=>{
    if(!viewport)return
    if(row.top<viewport.scrollTop)viewport.scrollTop=row.top
    else if(row.top+row.height>viewport.scrollTop+height())viewport.scrollTop=row.top+row.height-height()
    setScrollTop(viewport.scrollTop);setFocused(row.key)
    queueMicrotask(()=>viewport?.querySelector<HTMLElement>(`[data-tree-key="${CSS.escape(row.key)}"] .tc-drawing-row-focus`)?.focus())
  }
  const keyboard=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&drag()){event.preventDefault();event.stopPropagation();cancel();return}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey||(event.target as HTMLElement).tagName==='INPUT')return
    const current=rows();if(!current.length)return
    const index=current.findIndex(row=>row.key===focused()),next=event.key==='Home'?0:event.key==='End'?current.length-1:Math.max(0,Math.min(current.length-1,index+(event.key==='ArrowDown'?1:-1)))
    event.preventDefault();event.stopPropagation();focusRow(current[next])
  }
  const findDrop=(x:number,y:number)=>{
    const current=drag();if(!current||!viewport)return
    const element=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-drawing-id]'),id=element?.dataset.drawingId
    const legal=id&&legalReorderTargets(props.allObjects,current.ids,props.uncertain).some(o=>o.logicalId===id),rect=element?.getBoundingClientRect()
    setDrag({...current,x,y,target:legal?id:undefined,position:rect&&y>rect.top+rect.height/2?'after':'before'})
  }
  const scrollDrag=()=>{
    frame=undefined;const current=drag();if(!current?.active||!viewport)return
    const rect=viewport.getBoundingClientRect(),delta=current.y<rect.top+28?-12:current.y>rect.bottom-28?12:0
    if(delta){viewport.scrollTop+=delta;setScrollTop(viewport.scrollTop);findDrop(current.x,current.y)}
    frame=requestAnimationFrame(scrollDrag)
  }
  const start=(event:PointerEvent,object:DrawingSnapshot)=>{
    if(event.button!==0||!viewport||object.overlay.lock||object.migration||props.uncertain.includes(object.logicalId))return
    event.preventDefault();event.stopPropagation()
    const ids=props.selected.includes(object.logicalId)?[...props.selected]:[object.logicalId]
    if(!legalReorderTargets(props.allObjects,ids,props.uncertain).length){setNotice(t('没有同组可排序对象，请检查选择和锁定状态','No eligible target in this group; check selection and locks'));return}
    const originals=JSON.stringify(props.allObjects.filter(o=>ids.includes(o.logicalId)))
    setDrag({pointerId:event.pointerId,ids,originals,x:event.clientX,y:event.clientY,active:false,position:'before'})
    viewport.setPointerCapture(event.pointerId);setNotice('')
  }
  const move=(event:PointerEvent)=>{
    const current=drag();if(!current||current.pointerId!==event.pointerId)return
    if(!current.active&&Math.hypot(event.clientX-current.x,event.clientY-current.y)<4)return
    event.preventDefault();event.stopPropagation();setDrag({...current,active:true});findDrop(event.clientX,event.clientY)
    if(frame===undefined)frame=requestAnimationFrame(scrollDrag)
  }
  const end=(event:PointerEvent)=>{
    const current=drag();if(!current||event.pointerId!==current.pointerId)return
    event.preventDefault();event.stopPropagation();cancel()
    if(event.type==='pointercancel'||!current.active)return
    if(!current.target){setNotice(t('请放到同组合法对象之前或之后','Drop before or after an eligible object in the same group'));return}
    void props.execute({type:'reorder',ids:current.ids,targetId:current.target,position:current.position})
  }
  onMount(()=>{if(viewport){observer=new ResizeObserver(()=>{if(viewport)setHeight(viewport.clientHeight)});observer.observe(viewport)}window.addEventListener('blur',cancel)})
  onCleanup(()=>{cancel();observer?.disconnect();window.removeEventListener('blur',cancel)})
  return <>
    <Show when={notice()}><p role="status">{notice()}</p></Show>
    <div class="tc-drawing-sort-controls">
      <select aria-label={t('排序目标','Reorder target')} value={target()} disabled={!targets().length} onChange={e=>setTarget(e.currentTarget.value)}><option value="">{t('选择同组目标','Choose a target in this group')}</option><For each={targets()}>{object=><option value={object.logicalId}>{props.label(object)}</option>}</For></select>
      <select aria-label={t('排序位置','Reorder position')} value={position()} onChange={e=>setPosition(e.currentTarget.value as 'before'|'after')}><option value="before">{t('目标之前','Before target')}</option><option value="after">{t('目标之后','After target')}</option></select>
      <button disabled={!target()||!targets().some(o=>o.logicalId===target())} onClick={()=>void props.execute({type:'reorder',ids:[...props.selected],targetId:target(),position:position()})}>{t('应用排序','Apply reorder')}</button>
    </div>
    <div ref={viewport} class="tc-drawing-tree-viewport" role="tree" aria-label={t('绘图对象','Drawing objects')} aria-multiselectable="true" tabindex="0" on:keydown={keyboard} onScroll={event=>setScrollTop(event.currentTarget.scrollTop)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onFocusIn={event=>{const row=(event.target as HTMLElement).closest<HTMLElement>('[data-tree-key]');if(row)setFocused(row.dataset.treeKey)}}>
      <div style={{height:`${totalHeight()}px`,position:'relative'}}><For each={rendered().map(row=>row.key)}>{key=>{const row=()=>rowMap().get(key)!;let element:HTMLDivElement|undefined;onCleanup(()=>{if(element?.contains(document.activeElement))viewport?.focus({preventScroll:true})});return <div ref={element} role="treeitem" aria-level={row().level} aria-posinset={positions().get(key)} aria-setsize={rows().length} aria-expanded={row().group?props.searching||!collapsed().has(row().group!.id):undefined} aria-selected={row().object?props.selected.includes(row().object!.logicalId):undefined} data-tree-key={row().key} data-drawing-id={row().object?.logicalId} class={row().object?'tc-drawing-object tc-drawing-virtual-row':'tc-drawing-group-row'} style={{position:'absolute',top:`${row().top}px`,height:`${row().height}px`,left:'0',right:'0','padding-left':row().level===2?'16px':'0','box-sizing':'border-box',outline:row().object&&drag()?.target===row().object!.logicalId?'2px solid #1677ff':undefined}}>
        <Show when={row().group}>{group=><><button class="tc-drawing-row-focus" title={group().name} aria-label={`${collapsed().has(group().id)&&!props.searching?t('展开组','Expand group'):t('折叠组','Collapse group')} ${group().name}`} onClick={()=>toggle(group().id)}>{props.searching||!collapsed().has(group().id)?'▾':'▸'} {group().name} ({group().members.length})</button><button aria-label={`${t('选择组','Select group')} ${group().name}`} onClick={()=>void props.execute({type:'select',ids:group().members.map(o=>o.logicalId)})}>{t('选择','Select')}</button></>}</Show>
        <Show when={row().object}>{object=><>
          <button class="tc-drawing-drag-handle" aria-label={`${t('拖动排序','Drag to reorder')} ${props.label(object())}`} disabled={object().overlay.lock||!!object().migration||props.uncertain.includes(object().logicalId)} onPointerDown={event=>start(event,object())} onClick={e=>{e.preventDefault();e.stopPropagation()}}>⠿</button>
          <input type="checkbox" aria-label={`${t('选择','Select')} ${props.label(object())}`} checked={props.selected.includes(object().logicalId)} onChange={event=>void props.execute({type:'select',ids:event.currentTarget.checked?[...props.selected,object().logicalId]:props.selected.filter(id=>id!==object().logicalId)})}/>
          <button class="tc-drawing-object-name tc-drawing-row-focus" title={`${props.label(object())}${props.errors?.[object().logicalId]?` · ${props.errors?.[object().logicalId]}`:''}`} onClick={event=>{void props.execute({type:'select',ids:[object().logicalId],additive:event.ctrlKey||event.metaKey||event.shiftKey});props.locate(object())}}>{props.label(object())}<Show when={props.errors?.[object().logicalId]} fallback={<small>{object().presentation?.groupName??t('未分组','Ungrouped')} · {object().overlay.paneId==='candle_pane'?t('主图','Price pane'):object().overlay.paneId??t('主图','Price pane')} · {object().owner==='backend'?t('后端标注','Host annotation'):t('本地绘图','Local drawing')}</small>}>{error=><small role="status">{error()}</small>}</Show></button>
          <button aria-label={`${object().overlay.visible?t('隐藏','Hide'):t('显示','Show')} ${props.label(object())}`} onClick={()=>void props.execute({type:'update',ids:[object().logicalId],patch:{overlay:{visible:!object().overlay.visible}}})}>{object().overlay.visible?'◉':'○'}</button>
          <button aria-label={`${object().overlay.lock?t('解锁','Unlock'):t('锁定','Lock')} ${props.label(object())}`} onClick={()=>void props.execute({type:'update',ids:[object().logicalId],patch:{overlay:{lock:!object().overlay.lock}}})}>{object().overlay.lock?'🔒':'🔓'}</button>
          <button aria-label={`${t('编辑','Edit')} ${props.label(object())}`} onClick={()=>props.edit(object())}>⚙</button>
        </>}</Show>
      </div>}}</For></div>
    </div>
  </>
}
export default DrawingObjectTree
