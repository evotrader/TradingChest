import {it,expect,vi} from 'vitest'
import {DrawingController} from '../controller'
import {DrawingHistory} from '../history'
import {copyDrawingCatalog} from '../catalog'
import {isDrawingLevelSet,type DrawingLevelSet} from '../levels'
import type {DrawingSnapshot,DrawingCommitResult} from '../types'
function setup(parameters:DrawingSnapshot['parameters']={levels:[.5,.5,1]},owner:'local'|'backend'='local'){
 let result:DrawingCommitResult|undefined,editable=true
 const catalog=copyDrawingCatalog(),tool=catalog.find(tool=>tool.toolId==='fibonacciLine')!
 tool.parameters.find(p=>p.key==='levels')!.defaultValue={version:1,items:[{value:.25,visible:true,color:'#123456'},{value:1,visible:false}]}
 const source:DrawingSnapshot={logicalId:'d',owner,...(owner==='backend'?{backendId:'b'}:{}),anchors:[{kind:'market',timestamp:100,value:10},{kind:'market',timestamp:200,value:20}],parameters,overlay:{id:'d',name:'fibonacciLine',points:[],styles:null,extendData:{metadata:{host:'kept'}},visible:true,lock:false}}
 const apply=vi.fn((_id,value)=>value),confirmed=vi.fn(),commit=vi.fn(async change=>result??{status:'confirmed' as const,snapshot:change.after})
 const history=new DrawingHistory({apply,commit,onConfirmed:confirmed,context:()=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'}})})
 history.reconcile(owner,[source]);apply.mockClear()
 const controller=new DrawingController({history,catalog,editable:()=>editable,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=>owner})
 return {source,history,controller,apply,commit,confirmed,run:()=>controller.execute({type:'initialize-levels',id:'d',parameterKey:'levels'}),result:(value:DrawingCommitResult)=>{result=value},editable:(value:boolean)=>{editable=value},dispose:()=>{controller.dispose();history.dispose()}}
}
it('explicitly initializes legacy arrays once through confirmation and restores the exact original on undo',async()=>{
 const s=setup({levels:[.5,.5,1],reverse:true});expect(s.history.getDrawing('d')).toEqual(s.source);expect(s.apply).not.toHaveBeenCalled()
 expect((await s.run()).status).toBe('completed');const next=s.history.getDrawing('d')!,set=next.parameters!.levels as DrawingLevelSet
 expect(isDrawingLevelSet(set)).toBe(true);expect(set.items.map(l=>l.value)).toEqual([.5,.5,1]);expect(new Set(set.items.map(l=>l.id)).size).toBe(3);expect(next.parameters!.reverse).toBe(true);expect(next.overlay).toEqual(s.source.overlay);expect(s.confirmed).toHaveBeenCalledTimes(1)
 expect((await s.run()).status).toBe('completed');expect(s.confirmed).toHaveBeenCalledTimes(1)
 await s.controller.execute({type:'undo'});expect(s.history.getDrawing('d')).toEqual(s.source);expect(s.history.getState().canUndo).toBe(false)
 await s.controller.execute({type:'redo'});expect(s.history.getDrawing('d')).toEqual(next);s.dispose()
})
it('initializes missing values with actual instance defaults including appearance and visibility',async()=>{
 const s=setup({reverse:true});expect((await s.run()).status).toBe('completed');const items=(s.history.getDrawing('d')!.parameters!.levels as DrawingLevelSet).items
 expect(items.map(({id,...rest})=>rest)).toEqual([{value:.25,visible:true,color:'#123456'},{value:1,visible:false}]);s.dispose()
})
it.each(['legacy-0','default-0','opaque-id'])('treats already persisted %s as stable with zero writes/history',async id=>{
 const s=setup({levels:{version:1,items:[{id,value:.5,visible:true,text:'正文'}]}})
 expect((await s.run()).status).toBe('completed');expect(s.apply).not.toHaveBeenCalled();expect(s.confirmed).not.toHaveBeenCalled();expect(s.history.getState().canUndo).toBe(false);expect(s.history.getDrawing('d')).toEqual(s.source);s.dispose()
})
it.each(['rejected','uncertain'] as const)('retains the old source after a backend %s without retrying unknown writes',async status=>{
 const s=setup(undefined,'backend');s.result({status,message:'拒绝或等待确认'});expect((await s.run()).status).toBe(status);expect(s.history.getDrawing('d')).toEqual(s.source);expect(s.confirmed).not.toHaveBeenCalled();expect(s.commit).toHaveBeenCalledTimes(1)
 if(status==='uncertain'){expect((await s.run()).status).toBe('rejected');expect(s.commit).toHaveBeenCalledTimes(1)}s.dispose()
})
it('rechecks policy, locks and document generation before a queued initialization',async()=>{
 const s=setup();s.editable(false);expect((await s.run()).status).toBe('rejected');s.editable(true)
 s.history.reconcile('local',[{...s.source,overlay:{...s.source.overlay,lock:true}}]);s.apply.mockClear();expect((await s.run()).status).toBe('rejected');expect(s.apply).not.toHaveBeenCalled()
 s.history.reconcile('local',[s.source]);const pending=s.run();s.history.reset();expect((await pending).status).toBe('rejected');expect(s.confirmed).not.toHaveBeenCalled();s.dispose()
})
