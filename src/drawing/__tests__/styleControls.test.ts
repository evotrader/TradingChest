import {describe,it,expect,vi} from 'vitest'
import {builtinDrawingCatalog,copyDrawingCatalog,type DrawingToolDescriptor} from '../catalog'
import {commonStyleControls,commonStylePatch,templateStylePatch,drawingStylePatch,drawingStyleValue,selectionWriteReason,styleControls,styleControlOptions} from '../styleControls'
import {DrawingHistory} from '../history'
import {DrawingController} from '../controller'
import {defaultDrawingPreferences,DrawingPreferencesManager} from '../preferences'
import type {DrawingSnapshot,DrawingState} from '../types'
const drawing=(id:string,name='segment'):DrawingSnapshot=>({logicalId:id,owner:'local',overlay:{id,name,groupId:'drawing_tools',paneId:'candle_pane',points:[{timestamp:100,value:10},{timestamp:200,value:20}],styles:{line:{color:'#ffffff'},text:{color:'#111111'}},extendData:null,visible:true,lock:false}})
const tool=(id:string)=>builtinDrawingCatalog.find(tool=>tool.toolId===id)!
describe('declared style controls and commands',()=>{
 it('validates detached catalogs, custom legacy defaults and explicit empty capabilities',()=>{
  const custom:DrawingToolDescriptor={...structuredClone(tool('segment')),toolId:'custom',overlayName:'Custom'};delete custom.styleControls
  expect(styleControlOptions('fontSize',18)).toContain(18);expect(styleControlOptions('lineWidth',2.5)).toContain(2.5);expect(styleControlOptions('fontSize',undefined)).not.toContain(undefined);
  expect(styleControls(custom)).toEqual(['stroke','lineWidth','lineStyle']);custom.styleControls=[];expect(styleControls(custom)).toEqual([])
  custom.styleControls=['fill','fill'];expect(()=>copyDrawingCatalog([custom])).toThrow('重复')
  custom.styleControls=['wrong' as any];expect(()=>copyDrawingCatalog([custom])).toThrow('无效')
  expect(styleControls({...tool('rect'),settings:[]})).toEqual([])
  const catalog=copyDrawingCatalog();catalog[0].styleControls!.pop();expect(builtinDrawingCatalog[0].styleControls).toHaveLength(3)
  expect(builtinDrawingCatalog.every(tool=>Array.isArray(tool.styleControls))).toBe(true)
 })
 it('intersects actual capabilities and keeps stroke independent from text and body',()=>{
  expect(commonStyleControls([tool('rect'),tool('segment')])).toEqual(['stroke','lineWidth','lineStyle'])
  expect(commonStyleControls([tool('note'),tool('segment')])).toEqual([])
  expect(templateStylePatch({polygon:{borderColor:'#f44336'}},'rect',['stroke'])).toMatchObject({line:{color:'#f44336'},circle:{borderColor:'#f44336'}})
  expect(drawingStylePatch('stroke','#f44336')).not.toHaveProperty('text')
  expect(drawingStylePatch('fill','transparent')).toMatchObject({polygon:{color:'transparent'},text:{backgroundColor:'transparent'}})
  expect(commonStylePatch({line:{color:'#ffffff',size:3},text:{color:'#111111',size:24}},['stroke'])).toEqual({line:{color:'#ffffff'}})
  const shape=drawing('a','circle');shape.overlay.styles={circle:{borderColor:'#2196f3',borderSize:3,borderStyle:'dashed',borderDashedValue:[1,3]}}
  expect(drawingStyleValue(shape,'stroke')).toBe('#2196f3');expect(drawingStyleValue(shape,'lineWidth')).toBe(3);expect(drawingStyleValue(shape,'lineStyle')).toBe('dotted')
 })
 it('applies common template fields as one confirmed batch with one undo',async()=>{
  const history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'}}),apply:(_id,value)=>value})
  const a=drawing('a'),b=drawing('b','rect');history.reconcile('local',[a,b])
  const preferences=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,initial:{...defaultDrawingPreferences(),templates:[{id:'preset',name:'test',toolId:'segment',styles:{line:{color:'#2196f3'},text:{color:'#f44336',size:32}},parameters:{}}]},changed:vi.fn()})
  const controller=new DrawingController({history,preferences,create:vi.fn(),cancel:vi.fn(),project:vi.fn(),validate:vi.fn(),owner:()=> 'local',editable:()=>true})
  const result=await controller.execute({type:'template',action:'apply',templateId:'preset',ids:['a','b'],styleOnly:true})
  expect(result.items.map(item=>item.status)).toEqual(['confirmed','confirmed'])
  for(const value of history.getDrawings()){expect(value.overlay.styles?.line?.color).toBe('#2196f3');expect(value.overlay.styles?.text?.color).toBe('#111111');expect(value.overlay.extendData).toBe(null)}
  await controller.travel('undo');expect(history.getDrawings()).toEqual([a,b]);expect(history.getState().canUndo).toBe(false)
  preferences.dispose()
 })
 it('reports locked, mixed-document, uncertain and pending selections without silently filtering',()=>{
  const a=drawing('a'),b=drawing('b'),state={history:{pending:0,uncertainLogicalIds:[],canUndo:false,canRedo:false}} as unknown as DrawingState
  b.overlay.lock=true;expect(selectionWriteReason(state,[a,b],()=>true)).toContain('锁定');expect(selectionWriteReason(state,[a,b],()=>true,true)).toBeUndefined()
  b.overlay.lock=false;b.presentation={scope:'workspace'};expect(selectionWriteReason(state,[a,b],()=>true)).toContain('不同')
  b.presentation=undefined;state.history.uncertainLogicalIds=['b'];expect(selectionWriteReason(state,[a,b],()=>true)).toContain('待确认')
  state.history.pending=1;expect(selectionWriteReason(state,[a,b],()=>true)).toContain('正在确认')
 })
})
