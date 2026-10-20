// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest'
import {DrawingHistory} from '../history'
import {DrawingController} from '../controller'
import {DrawingCoordinator} from '../coordinator'
import {DrawingSessionRegistry} from '../session'
import {assertDrawingRestoreAuthority} from '../restore'
import {intervalVisible} from '../anchors'
import {drawingFigureHit} from '../hitTest'
import type {DrawingCommand,DrawingSnapshot} from '../types'
const period={multiplier:1,timespan:'minute',text:'1m'}
const value=(id='a',scope:'chart'|'workspace'='chart'):DrawingSnapshot=>({logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',points:[{timestamp:1,value:10},{timestamp:2,value:20}],lock:false,visible:true,styles:null,extendData:null},anchors:[{kind:'market',timestamp:1,value:10},{kind:'market',timestamp:2,value:20}],presentation:{scope}})
function setup(){const history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period}),apply:(_id,v)=>v}),create=vi.fn(),controller=new DrawingController({history,editable:()=>true,validate:()=>{},create,cancel:()=>{},project:()=>{},owner:()=> 'local'});history.reconcile('local',[value()]);return {history,controller,create}}
describe('deep audit production boundaries',()=>{
 it('rejects all shared canonical IDs even when they have no engine projection',()=>{expect(()=>assertDrawingRestoreAuthority([value()],['a'])).toThrow('共享文档');expect(()=>assertDrawingRestoreAuthority([value()],['other'])).not.toThrow()})
 it.each<DrawingCommand>([{type:'paste'},{type:'update',ids:['a'],patch:{text:'wrong context'}},{type:'delete',ids:['a']},{type:'duplicate',ids:['a']},{type:'select',ids:['a']},{type:'tool',toolId:'segment'},{type:'presentation',ids:['a'],patch:{name:'wrong context'}}])('cancels queued $type when the document identity changes',async command=>{
  const {history,controller,create}=setup();await controller.execute({type:'copy',ids:['a']});const pending=controller.execute(command);history.reset(true);const next=value();next.overlay.points[0].value=99;history.reconcile('local',[next]);const before=history.getDrawings()
  expect(await pending).toMatchObject({status:'rejected',message:expect.stringContaining('上下文已改变')});expect(history.getDrawings()).toEqual(before);expect(create).not.toHaveBeenCalled();controller.dispose();history.dispose()
 })
 it('keeps global view preferences independent of the symbol generation',async()=>{const {history,controller}=setup();const pending=controller.execute({type:'view',hidden:true});history.reset(true);expect(await pending).toMatchObject({status:'completed'});expect(controller.getViewState().hidden).toBe(true);controller.dispose();history.dispose()})
 it('clears only the detached coordinator projection failures',async()=>{
  const registry=new DrawingSessionRegistry({scope:'workspace'}),session=await registry.bind({identity:{namespace:'audit',symbol:{ticker:'A',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'}}),history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period}),apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(history,{project:()=>{throw Error('host collision')},changed:()=>{},validate:()=>{}})
  await session.history.submit('create','a',value('a','workspace'),'programmatic');coordinator.bind(session);expect(coordinator.state().projectionErrors?.a).toBe('host collision');coordinator.detach();expect(coordinator.state().projectionErrors).toEqual({});coordinator.dispose();history.dispose();registry.dispose()
 })
 it.each([[90,'minute',1,'hour'],[120,'minute',2,'hour'],[24,'hour',1,'day'],[12,'month',1,'year']] as const)('compares exact interval ratios %s %s / %s %s', (n,unit,m,other)=>{
  const current={multiplier:n,timespan:unit,text:''},reference={multiplier:m,timespan:other}
  expect(intervalVisible({kind:'higher',period:reference},current)).toBe(true)
  expect(intervalVisible({kind:'lower',period:{multiplier:n,timespan:unit}},{multiplier:m,timespan:other,text:''})).toBe(true)
 })
 it('uses native figure geometry rather than its bounding rectangle',()=>{
  const line={type:'line',attrs:{coordinates:[{x:0,y:0},{x:100,y:100}]}}
  expect(drawingFigureHit({x:50,y:50},[line],{},null,'onPressedMoveStart')).toBe(true)
  expect(drawingFigureHit({x:10,y:90},[line],{},null,'onPressedMoveStart')).toBe(false)
  expect(drawingFigureHit({x:50,y:50},[{...line,ignoreEvent:true}],{},null,'onPressedMoveStart')).toBe(false)
 })
})
