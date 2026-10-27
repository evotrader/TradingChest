import {expect,it,vi} from 'vitest'
import {builtinDrawingCatalog,copyDrawingCatalog,validateDrawingParameters,type DrawingToolDescriptor} from '../catalog'
import {DrawingController} from '../controller'
import {DrawingHistory} from '../history'
import {DrawingPreferencesManager,defaultDrawingPreferences,validateDrawingPreferences} from '../preferences'
import {resolveDrawingLevels,type DrawingLevelSet} from '../levels'
import {extractDrawingStylePreset,instantiateDrawingPresetParameters} from '../presets'
import type {DrawingSnapshot} from '../types'

const tool=builtinDrawingCatalog.find(tool=>tool.toolId==='fibonacciLine')!
const object=(id='a'):DrawingSnapshot=>({logicalId:id,owner:'local',parameters:{levels:resolveDrawingLevels([0,.5,1])},anchors:[{kind:'market',timestamp:100,value:10},{kind:'market',timestamp:200,value:20}],overlay:{id,name:'fibonacciLine',groupId:'drawing_tools',paneId:'candle_pane',points:[{timestamp:100,value:10},{timestamp:200,value:20}],visible:true,lock:false,styles:{line:{color:'#123456'}},extendData:null}})
function setup(values=[object()]){
 const apply=vi.fn((_id,value)=>value),history=new DrawingHistory({apply,context:()=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'}})})
 history.reconcile('local',values);apply.mockClear()
 const preferences=new DrawingPreferencesManager({catalog:builtinDrawingCatalog}),create=vi.fn(),cancel=vi.fn()
 const controller=new DrawingController({history,preferences,create,cancel,project:()=>{},editable:()=>true,validate:value=>validateDrawingParameters(builtinDrawingCatalog.find(tool=>tool.overlayName===value.overlay.name)!,value.parameters??{}),owner:()=> 'local'})
 return {history,preferences,controller,apply,create,cancel}
}

it('supports an arbitrary host parameter key without inferring capability from the tool name',()=>{
 const custom:DrawingToolDescriptor={...structuredClone(tool),toolId:'HostBands',overlayName:'HostBands',parameters:[{key:'zones',label:'区域',kind:'level-set',defaultValue:[-1,.5,.5,2]}]}
 const source=object();source.overlay.name='HostBands';source.parameters={zones:resolveDrawingLevels([-1,.5,.5,2])};(source.parameters.zones as DrawingLevelSet).items[1].text='文档正文'
 const preset=extractDrawingStylePreset(source,custom),a=instantiateDrawingPresetParameters(preset.parameters,custom)!,b=instantiateDrawingPresetParameters(preset.parameters,custom)!
 expect(preset.parameters).not.toHaveProperty('levels');expect(preset.parameters!.zones).toEqual({version:1,items:[-1,.5,.5,2].map(value=>({value,visible:true}))})
 expect((a.zones as DrawingLevelSet).items.every(item=>!Object.hasOwn(item,'text'))).toBe(true);expect((a.zones as DrawingLevelSet).items.map(item=>item.id)).not.toEqual((b.zones as DrawingLevelSet).items.map(item=>item.id));expect((source.parameters.zones as DrawingLevelSet).items[1].text).toBe('文档正文')
})
it('preflights every target before any write when a template would remove a body',async()=>{
 const a=object('a'),b=object('b');(b.parameters!.levels as DrawingLevelSet).items[1].text='不能移除的正文'
 const s=setup([a,b]),before=s.history.getDrawings();s.preferences.update({templates:[{id:'p',name:'两级',toolId:tool.toolId,styles:{line:{color:'#ffffff'}},parameters:{levels:[0,1]}}]})
 const result=await s.controller.execute({type:'template',action:'apply',templateId:'p',ids:['a','b']})
 expect(result.status).toBe('rejected');expect(result.message).toContain('绘图 b');expect(result.message).toContain('带正文');expect(s.apply).not.toHaveBeenCalled();expect(s.history.getDrawings()).toEqual(before);expect(s.history.getState().canUndo).toBe(false)
 expect((await s.controller.execute({type:'template',action:'apply',templateId:'p',ids:['a','b'],styleOnly:true})).status).toBe('completed');expect(s.history.getDrawing('b')!.parameters).toEqual(b.parameters)
})
it('retains matched IDs and repeated-ratio bodies with one complete-template undo',async()=>{
 const source=object();source.parameters={levels:resolveDrawingLevels([.5,.5,1])};const levels=source.parameters.levels as DrawingLevelSet;levels.items[0].text='第一条';levels.items[1].text='第二条'
 const s=setup([source]);s.preferences.update({templates:[{id:'p',name:'重复级别',toolId:tool.toolId,styles:{line:{size:3}},parameters:{levels:[.5,2,.5]}}]})
 expect((await s.controller.execute({type:'template',action:'apply',templateId:'p',ids:['a']})).status).toBe('completed')
 const actual=s.history.getDrawing('a')!.parameters!.levels as DrawingLevelSet;expect(actual.items.map(item=>item.text)).toEqual(['第一条',undefined,'第二条']);expect(actual.items[0].id).toBe(levels.items[0].id);expect(actual.items[2].id).toBe(levels.items[1].id)
 await s.controller.travel('undo');expect(s.history.getDrawings()).toEqual([source]);expect(s.history.getState().canUndo).toBe(false)
})
it('uses the same appearance extraction for template save, overwrite, defaults and remembered styles',async()=>{
 const source=object(),levels=source.parameters!.levels as DrawingLevelSet;levels.items[0].text='不能进入预设的正文';levels.items[0].id='content-owned-id'
 const s=setup([source]);s.controller.rememberConfirmed(source)
 expect((await s.controller.execute({type:'template',action:'save',name:'外观',ids:['a']})).status).toBe('completed')
 const id=s.preferences.getState().value.templates[0].id
 expect((await s.controller.execute({type:'template',action:'overwrite',templateId:id,ids:['a']})).status).toBe('completed');expect((await s.controller.execute({type:'template',action:'default',ids:['a']})).status).toBe('completed')
 const preferences=s.preferences.getState().value
 for(const preset of [preferences.templates[0],preferences.defaults[tool.toolId],preferences.lastStyles![tool.toolId]]){expect(JSON.stringify(preset)).not.toContain('不能进入预设的正文');expect(JSON.stringify(preset)).not.toContain('content-owned-id');for(const item of (preset.parameters!.levels as any).items){expect(item).not.toHaveProperty('id');expect(item).not.toHaveProperty('text')}}
 expect(()=>validateDrawingPreferences({...defaultDrawingPreferences(),defaults:{[tool.toolId]:{styles:{},parameters:source.parameters as any}}},builtinDrawingCatalog)).toThrow()
 expect(s.history.getState().canUndo).toBe(false)
})
it('preflights before cancellation, captures explicit templates and freezes continuous appearance',async()=>{
 const s=setup();s.preferences.update({defaults:{[tool.toolId]:{styles:{line:{color:'#111111'}}}},lastStyles:{[tool.toolId]:{styles:{line:{color:'#222222'}}}},templates:[{id:'p',name:'绘前',toolId:tool.toolId,styles:{line:{color:'#333333'}},parameters:{levels:[0,.618,1]}}]})
 await s.controller.execute({type:'select',ids:['a']});await s.controller.execute({type:'tool',toolId:tool.toolId,continuous:true,templateId:'p'});const session=s.controller.getToolSession(),first=structuredClone(s.create.mock.calls.at(-1)![1]),count=s.cancel.mock.calls.length
 expect(first).toMatchObject({styles:{line:{color:'#333333'}},parameters:{levels:[0,.618,1]}});expect(s.controller.getSelectedIds()).toEqual(['a']);expect(s.history.getState().canUndo).toBe(false)
 for(const command of [{type:'tool',toolId:'missing'},{type:'tool',toolId:'segment',templateId:'p'},{type:'tool',toolId:tool.toolId,templateId:'deleted'}] as const)expect((await s.controller.execute(command)).status).toBe('rejected')
 expect(s.cancel).toHaveBeenCalledTimes(count);expect(s.controller.getToolSession()).toBe(session)
 s.preferences.update({templates:[],lastStyles:{[tool.toolId]:{styles:{line:{color:'#ffffff'}}}}});s.create.mock.calls.at(-1)![1]!.styles!.line!.color='#abcdef';s.controller.completed(tool.toolId,session)
 expect(s.create.mock.calls.at(-1)![1]).toEqual(first)
 await s.controller.execute({type:'tool',toolId:tool.toolId});expect(s.create.mock.calls.at(-1)![1]).toMatchObject({styles:{line:{color:'#ffffff'}}})
})
it('ignores late completions from a cancelled session even when the next tool ID is equal',async()=>{
 const s=setup();await s.controller.execute({type:'tool',toolId:tool.toolId,continuous:true});const old=s.controller.getToolSession()
 await s.controller.execute({type:'cancel'});await s.controller.execute({type:'tool',toolId:tool.toolId,continuous:true});const current=s.controller.getToolSession(),count=s.create.mock.calls.length
 expect(current).not.toBe(old);s.controller.completed(tool.toolId,old);s.controller.completed(tool.toolId,null);expect(s.create).toHaveBeenCalledTimes(count);expect(s.controller.getToolSession()).toBe(current)
 s.controller.completed(tool.toolId,current);expect(s.create).toHaveBeenCalledTimes(count+1);s.controller.cancelToolSession();s.controller.completed(tool.toolId,current);expect(s.create).toHaveBeenCalledTimes(count+1)
})
it('changes continuous mode only for an explicitly provided preference field',async()=>{
 const s=setup();await s.controller.execute({type:'tool',toolId:tool.toolId,continuous:true})
 await s.controller.execute({type:'preferences',patch:{ui:{snapping:{ohlc:false}}}});expect(s.controller.getState().continuous).toBe(true)
 await s.controller.execute({type:'preferences',patch:{ui:{continuous:false}}});expect(s.controller.getState().continuous).toBe(false)
 const count=s.create.mock.calls.length;s.controller.completed(tool.toolId,s.controller.getToolSession());expect(s.create).toHaveBeenCalledTimes(count);expect(s.controller.getState().toolId).toBe(null)
})
it('derives detached snap options from the same preference authority without content writes or resetting explicit continuity',async()=>{
 const s=setup();await s.controller.execute({type:'tool',toolId:tool.toolId,continuous:true});const source=s.history.getDrawings(),created=s.create.mock.calls.length
 expect((await s.controller.execute({type:'preferences',patch:{ui:{snapping:{ohlc:false,weakSensitivity:4}}}})).status).toBe('completed')
 expect(s.controller.getState().snapping).toEqual({ohlc:false,indicators:true,weakSensitivity:4});expect(s.controller.getViewState().snapping).toEqual(s.preferences.getState().value.ui.snapping);expect(s.controller.getState().continuous).toBe(true)
 const view=s.controller.getViewState();view.snapping.indicators=false;expect(s.controller.getState().snapping.indicators).toBe(true);expect(s.history.getDrawings()).toEqual(source);expect(s.apply).not.toHaveBeenCalled();expect(s.create).toHaveBeenCalledTimes(created)
 await s.controller.execute({type:'preferences',patch:{ui:{favoritesPosition:{x:80,y:20}}}});expect(s.controller.getState().continuous).toBe(true)
 await s.controller.execute({type:'preferences',patch:{ui:{continuous:false}}});expect(s.controller.getState().continuous).toBe(false);expect(s.history.getDrawings()).toEqual(source)
 s.controller.dispose();s.preferences.dispose();s.history.dispose()
})

it('uses closed appearance-only catalog defaults for arbitrary level-set keys and fresh runtime IDs',()=>{
 const defaults={version:1 as const,items:[{value:-.25,visible:true,color:'#123456'},{value:.5,visible:true},{value:.5,visible:false},{value:1.25,visible:true}]}
 const custom:DrawingToolDescriptor={...structuredClone(tool),toolId:'HostReserved',overlayName:'EXAMPLE/Reserved',parameters:['segments','algorithm'].map(key=>({key,label:key,kind:'level-set' as const,defaultValue:defaults}))}
 expect(()=>copyDrawingCatalog([custom])).not.toThrow()
 const a=instantiateDrawingPresetParameters(undefined,custom)!,b=instantiateDrawingPresetParameters(undefined,custom)!
 for(const key of ['segments','algorithm']){expect(()=>validateDrawingParameters(custom,{[key]:a[key]})).not.toThrow();expect((a[key] as DrawingLevelSet).items.map(item=>item.id)).not.toEqual((b[key] as DrawingLevelSet).items.map(item=>item.id));expect((a[key] as DrawingLevelSet).items.every(item=>!Object.hasOwn(item,'text'))).toBe(true)}
 expect(()=>copyDrawingCatalog([{...custom,parameters:[{...custom.parameters[0],defaultValue:{version:1,items:[{id:'document-id',value:1,visible:true,text:'Document content'}]}} as any]}])).toThrow()
 expect(defaults.items[0]).not.toHaveProperty('id')
})
