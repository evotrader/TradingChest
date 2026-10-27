// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render} from '@solidjs/testing-library'
import {createSignal} from 'solid-js'
import Handles,{type DrawingHandle} from '../Handles'
import AxisLabels from '../AxisLabels'
import {translatedPlacement} from '../placement'

afterEach(cleanup)
it('preserves exact displayed positions and input objects under translation, scaling, reordering and selection changes',()=>{
 const place=translatedPlacement<{id:string;x:number;y:number}>(value=>value.id),a={id:'a',x:32.5,y:80},b={id:'b',x:95.25,y:90},original=structuredClone([a,b])
 for(const values of [[a,b],[{...a,x:42.5,y:83},{...b,x:105.25,y:93}],[{...b,x:210,y:150},{...a,x:12.25,y:40}],[b],[],[a]]){
  const result=place(values);expect(result.objects.size).toBe(values.length)
  for(const value of values){const projected=result.objects.get(value.id)!;expect(projected.x+result.dx).toBe(value.x);expect(projected.y+result.dy).toBe(value.y);expect(projected.value).toBe(value)}
 }
 expect([a,b]).toEqual(original)
})
it('keeps selected point nodes, focus and all attributes current across updates, removals and reordering',async()=>{
 const a:DrawingHandle={id:'a',index:0,x:30,y:40,label:'A',locked:false},b={...a,id:'b',index:1,label:'B'}
 const [handles,setHandles]=createSignal([a,b]),nudge=vi.fn()
 const view=render(()=><Handles locale="zh-CN" handles={handles()} suspended={false} start={()=>{}} move={()=>{}} end={()=>{}} nudge={nudge}/>)
 const first=view.getByRole('button',{name:'A'});first.focus()
 setHandles([{...a,x:70},{...b,x:60}]);await Promise.resolve()
 expect(view.getAllByRole('button')[0]).toBe(first);expect(document.activeElement).toBe(first)
 const mutations:MutationRecord[]=[],observer=new MutationObserver(records=>mutations.push(...records));observer.observe(first,{attributes:true})
 setHandles([{...b,x:80},{...a,x:90}]);await Promise.resolve();observer.disconnect()
 expect(view.getAllByRole('button')[1]).toBe(first)
 expect(mutations.every(record=>record.attributeName==='style')).toBe(true)
 setHandles([{...a,label:'新名称',locked:true,timeOnly:true}]);await Promise.resolve()
 expect(view.getByRole('button',{name:'新名称'})).toBe(first);expect(first.getAttribute('aria-disabled')).toBe('true');expect(first.title).toContain('真实 K 线')
 fireEvent.keyDown(first,{key:'ArrowRight'});expect(nudge).not.toHaveBeenCalled()
 setHandles([]);expect(view.queryAllByRole('button')).toHaveLength(0)
 setHandles([a]);fireEvent.keyDown(view.getByRole('button',{name:'A'}),{key:'ArrowRight',shiftKey:true});expect(nudge).toHaveBeenCalledWith(expect.objectContaining(a),10,0)
})
it('keeps every axis label and updates its geometry and content without replacing surviving nodes',()=>{
 const a={id:'a:y:0',x:30,y:40,text:'10.00',side:'right' as const},b={...a,id:'b:x:0',text:'时间',side:'time' as const}
 const [labels,setLabels]=createSignal([a,b]),view=render(()=><AxisLabels labels={labels()}/>),first=view.getByText('10.00')
 setLabels([{...b,x:70},{...a,text:'11.00',x:80}]);expect(view.getByText('11.00')).toBe(first);expect(first.title).toBe('11.00');expect(view.container.querySelectorAll('[data-drawing-axis-label]')).toHaveLength(2)
 setLabels([]);expect(view.container.querySelectorAll('[data-drawing-axis-label]')).toHaveLength(0)
 setLabels([a]);expect(view.getByText('10.00')).toBeDefined()
})
