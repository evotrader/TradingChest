import {describe,it,expect} from 'vitest'
import {DrawingController} from '../controller'
import {DrawingHistory} from '../history'
import {DrawingCoordinator} from '../coordinator'
import {DrawingPreferencesManager} from '../preferences'
import {builtinDrawingCatalog} from '../catalog'
import {DrawingSessionRegistry} from '../session'
import type {DrawingSnapshot} from '../types'
const context=()=>({symbol:{ticker:'A.X'},period:{multiplier:1,timespan:'day',text:'1D'}})
const value=(id:string,scope:'chart'|'workspace'|'host'='chart'):DrawingSnapshot=>({logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',points:[{timestamp:1,value:1},{timestamp:2,value:2}],lock:false,visible:true,styles:null,extendData:null},anchors:[{kind:'market',timestamp:1,value:1},{kind:'market',timestamp:2,value:2}],presentation:{scope}})
async function setup(hostStore?:any,preferences?:DrawingPreferencesManager){
 const local=new DrawingHistory({context,apply:(_id,v)=>v}),registry=new DrawingSessionRegistry({scope:hostStore?'host':'workspace',store:hostStore}),session=await registry.bind({identity:{namespace:'test',symbol:{ticker:'A.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'},documentId:hostStore?'fixed':undefined}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}})
 coordinator.bind(hostStore?undefined:session,hostStore?session:undefined)
 const controller=new DrawingController({history:local,coordinator,preferences,editable:()=>true,validate:()=>{},owner:()=> 'local',project:()=>{},create:()=>{},cancel:()=>{}})
 return {local,registry,session,coordinator,controller,dispose(){controller.dispose();coordinator.dispose();local.dispose();registry.dispose()}}
}
describe('public and visible history routing',()=>{
 it('immediately redoes a selected creation without retaining a stale selected ID',async()=>{
  const s=await setup();try{await s.local.submit('create','local',value('local'),'programmatic');await s.controller.execute({type:'select',ids:['local']});await s.controller.travel('undo');expect(s.controller.getSelectedIds()).toEqual([]);await s.controller.travel('redo');expect(s.local.getDrawing('local')).toBeDefined()}finally{s.dispose()}
 })
 it('keeps the shared history after deleting the selected object while the new-tool scope stays chart',async()=>{
  const s=await setup();try{await s.session.history.submit('create','shared',value('shared','workspace'),'programmatic');await s.controller.execute({type:'select',ids:['shared']});expect((await s.controller.execute({type:'delete',ids:['shared']})).status).toBe('completed');expect(s.controller.getState()).toMatchObject({scope:'chart',historyScope:'workspace',history:{canUndo:true}});await s.controller.travel('undo');expect(s.session.history.getDrawing('shared')).toBeDefined();await s.controller.execute({type:'redo'});expect(s.session.history.getDrawing('shared')).toBeUndefined();expect(s.local.getDrawings()).toEqual([])}finally{s.dispose()}
 })
 it('explicit empty selection returns to the new-tool scope and detached sessions cannot receive redo',async()=>{
  const s=await setup();try{await s.session.history.submit('create','shared',value('shared','workspace'),'programmatic');await s.controller.execute({type:'select',ids:['shared']});await s.controller.travel('undo');await s.controller.execute({type:'select',ids:[]});expect(s.controller.getState().historyScope).toBe('chart');await s.controller.travel('redo');expect(s.session.history.getDrawing('shared')).toBeUndefined();await s.controller.execute({type:'scope',scope:'workspace'});await s.controller.travel('redo');expect(s.session.history.getDrawing('shared')).toBeDefined();await s.controller.travel('undo');s.coordinator.detach();await s.controller.travel('redo');expect(s.session.history.getDrawing('shared')).toBeUndefined()}finally{s.dispose()}
 })
 it('cancels queued public and command history operations after the local identity generation changes',async()=>{
  let release!:()=>void,reads=0;const gate=new Promise<void>(resolve=>release=resolve)
  const preferences=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,scope:'test',store:{read:async()=>{if(++reads===1)throw Error('read failed');await gate;return null},write:async()=>{}}})
  const s=await setup(undefined,preferences)
  try{
   for(let i=0;i<100&&preferences.getState().status!=='error';i++)await Promise.resolve()
   await s.local.submit('create','A',value('A'),'programmatic');const blocking=s.controller.execute({type:'preferences-retry'});await Promise.resolve();await Promise.resolve()
   const queued=s.controller.travel('undo'),command=s.controller.execute({type:'undo'});const rejected=expect(queued).rejects.toMatchObject({name:'AbortError'})
   s.local.reset(true);await s.local.submit('create','B',value('B'),'programmatic');release();await blocking;await rejected
   expect(await command).toMatchObject({status:'rejected',message:expect.stringContaining('上下文已改变')});expect(s.local.getDrawing('B')).toBeDefined()
  }finally{s.dispose();preferences.dispose()}
 })
 it('checks uncertain host writes before deleting through remembered history',async()=>{
  let row:any=null,writes=0
  const store={read:async()=>row,write:async(_namespace:any,input:any)=>{writes++;row={documentId:input.documentId,revision:'rev-'+writes,document:input.document};throw Error('response lost')}}
  const s=await setup(store)
  try{
   await s.session.history.submit('create','shared',value('shared','host'),'programmatic');await s.controller.execute({type:'select',ids:['shared']});await s.controller.travel('undo');await s.controller.travel('redo')
   await expect(s.session.save()).rejects.toThrow('response lost');expect(s.session.getState().status).toBe('uncertain')
   await expect(s.controller.travel('undo')).rejects.toThrow('共享存储尚未确认');expect(await s.controller.execute({type:'undo'})).toMatchObject({status:'rejected',message:expect.stringContaining('共享存储尚未确认')});expect(s.session.history.getDrawing('shared')).toBeDefined();expect(writes).toBe(1)
  }finally{s.dispose()}
 })

 it('keeps transfer redo in its operation history despite an automatically retained selected object moving back to local',async()=>{
  const s=await setup();try{
   await s.local.submit('create','moved',value('moved'),'programmatic');await s.local.submit('create','other',value('other'),'programmatic');await s.controller.execute({type:'select',ids:['moved']});await s.controller.execute({type:'transfer',ids:['moved'],scope:'workspace'})
   await s.controller.travel('undo');expect(s.local.getDrawing('moved')).toBeDefined();expect(s.controller.getState()).toMatchObject({selectedIds:['moved'],historyScope:'workspace',history:{canRedo:true}})
   expect((await s.controller.travel('redo'))?.status).toBe('confirmed');expect(s.session.history.getDrawing('moved')).toBeDefined()
   expect((await s.controller.execute({type:'undo'})).status).toBe('completed');expect((await s.controller.execute({type:'redo'})).status).toBe('completed');await s.controller.travel('undo')
   await s.controller.execute({type:'select',ids:['other']});expect(s.controller.getState().historyScope).toBe('chart');await s.controller.travel('undo');expect(s.local.getDrawing('other')).toBeUndefined();expect(s.local.getDrawing('moved')).toBeDefined();expect(s.session.history.getState().canRedo).toBe(true)
  }finally{s.dispose()}
 })

})
