// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render} from '@solidjs/testing-library'
import {createSignal} from 'solid-js'
import LevelEditor,{createDrawingLevelDraft,drawingLevelsFromDraft,drawingLevelDraftChanged,parseDrawingLevelRatio} from '../LevelEditor'
import {resolveDrawingLevels} from '../../../drawing/levels'

afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('keeps incomplete ratio strings through other edits and reordering, then validates before canonical conversion',()=>{
 const original=resolveDrawingLevels([0,.5,1]),[items,setItems]=createSignal(createDrawingLevelDraft(original,[0,.5,1])),view=render(()=><LevelEditor locale="zh-CN" label="级别" items={items()} change={setItems}/>),input=view.getByRole('textbox',{name:'级别 2 比例'}) as HTMLInputElement
 fireEvent.input(input,{target:{value:'1e'}});expect(items()[1].value).toBe('1e');expect(input.getAttribute('aria-invalid')).toBe('true')
 fireEvent.click(view.getByRole('checkbox',{name:'级别 1 显示'}));expect(input.value).toBe('1e');fireEvent.click(view.getByRole('button',{name:'级别 2 上移'}));expect(view.getByRole('textbox',{name:'级别 1 比例'})).toBe(input);expect(items()[0].id).toBe(original.items[1].id)
 expect(()=>drawingLevelsFromDraft(items())).toThrow('有限');fireEvent.input(input,{target:{value:'-.25'}});expect(drawingLevelsFromDraft(items()).items[0].value).toBe(-.25);expect(original.items[1].value).toBe(.5)
 for(const value of ['','Infinity','1e10000','1e-10000','0x10'])expect(()=>parseDrawingLevelRatio(value)).toThrow()
 expect(parseDrawingLevelRatio('-0')).toBe(-0);expect(parseDrawingLevelRatio('5e-324')).toBe(Number.MIN_VALUE)
 const same=createDrawingLevelDraft(original,[0,.5,1]);same[1].value='0.50';expect(drawingLevelDraftChanged(same,original,[0,.5,1])).toBe(false)
})
it('confirms body removal, preserves IDs when moving rows and enforces both level-count boundaries',()=>{
 const original=resolveDrawingLevels([0,1]);original.items[0].text='需要保留的正文';const [items,setItems]=createSignal(createDrawingLevelDraft(original,[0,1])),view=render(()=><LevelEditor locale="zh-CN" label="级别" items={items()} change={setItems}/>),confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
 fireEvent.click(view.getByRole('button',{name:'级别 1 删除'}));expect(items()).toHaveLength(2);confirm.mockReturnValue(true);fireEvent.click(view.getByRole('button',{name:'级别 1 删除'}));expect(items()).toHaveLength(1);expect(items()[0].id).toBe(original.items[1].id);expect((view.getByRole('button',{name:'级别 1 删除'}) as HTMLButtonElement).disabled).toBe(true)
 setItems(createDrawingLevelDraft(Array(64).fill(1),[0,1]));expect((view.getByRole('button',{name:'添加级别'}) as HTMLButtonElement).disabled).toBe(true)
 expect(original.items[0].text).toBe('需要保留的正文')
})
it('keeps IME Enter out of the surrounding form submission path',()=>{
 const [items,setItems]=createSignal(createDrawingLevelDraft([0,1],[0,1])),submit=vi.fn(),view=render(()=><form onSubmit={submit}><LevelEditor locale="zh-CN" label="级别" items={items()} change={setItems}/></form>),input=view.getByRole('textbox',{name:'级别 1 比例'}),event=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true})
 input.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);expect(submit).not.toHaveBeenCalled();expect(items()).toHaveLength(2)
})
