import {describe,it,expect,vi,afterEach} from 'vitest'
import {DrawingHistory} from '../history'
import {DrawingController} from '../controller'
import {DrawingCoordinator} from '../coordinator'
import type {DrawingSnapshot,DrawingChange,DrawingCommand} from '../types'

const context=()=>({symbol:{ticker:'GUARD'},period:{multiplier:1,timespan:'minute',text:'1m'}})
const make=(id:string):DrawingSnapshot=>({logicalId:id,owner:'local',overlay:{id,name:'segment',points:[{timestamp:1,value:1},{timestamp:2,value:2}],lock:false,visible:true,styles:null,extendData:null}})
const styles={line:{color:'#f44336'}}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
function setup(commit?:(change:DrawingChange)=>Promise<any>){
 let editable=true,armed=false,phase=0,clock=0,yields=0
 const changes:DrawingChange[]=[]
 vi.spyOn(performance,'now').mockImplementation(()=>clock)
 vi.stubGlobal('MessageChannel',class {
  port1={onmessage:undefined as (()=>void)|undefined,close(){}}
  port2={close(){},postMessage:()=>{yields++;setTimeout(()=>this.port1.onmessage?.(),0)}}
 })
 const history=new DrawingHistory({context,commit,apply:(_id,value)=>value,onConfirmed:change=>{changes.push(change);if(armed&&++phase===1){setTimeout(()=>{editable=false},0);clock+=150}}})
 const controller=new DrawingController({history,editable:()=>editable,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
 return {history,controller,changes,arm(){phase=0;changes.length=0;armed=true},allow(){armed=false;editable=true},deny(){editable=false},get yields(){return yields}}
}
describe('operation-local write guards',()=>{
 it.each(['update','delete','undo','redo'] as const)('stops %s after a host policy change in a cooperative yield and keeps confirmed history',async type=>{
  const s=setup(),values=Array.from({length:130},(_,i)=>make(String(i)))
  try{
   s.history.reconcile('local',values)
   if(type==='undo'||type==='redo')await s.controller.execute({type:'update',ids:values.map(v=>v.logicalId),patch:{overlay:{styles}}})
   if(type==='redo')await s.controller.execute({type:'undo'})
   s.arm()
   const command:DrawingCommand=type==='update'?{type,ids:values.map(v=>v.logicalId),patch:{overlay:{styles}}}:type==='delete'?{type,ids:values.map(v=>v.logicalId)}:{type}
   const result=await s.controller.execute(command)
   expect(s.yields).toBeGreaterThan(0)
   expect(result.status).toBe('partial')
   expect(result.items.map(item=>item.status)).toEqual(['confirmed','rejected',...Array(128).fill('not-attempted')])
   expect(s.changes).toHaveLength(1);expect(s.history.getState().pending).toBe(0)
   if(type==='delete')expect(s.history.getDrawings()).toHaveLength(129)
   else expect(s.history.getDrawings().filter(v=>v.overlay.styles?.line?.color==='#f44336')).toHaveLength(type==='undo'?129:1)
   s.allow()
   if(type==='update'||type==='delete'){
    expect((await s.controller.execute({type:'undo'})).status).toBe('completed')
    expect(s.history.getState().canUndo).toBe(false)
    expect(s.history.getDrawings()).toHaveLength(130);expect(s.history.getDrawings().every(v=>v.overlay.styles===null)).toBe(true)
   }
  }finally{s.controller.dispose();s.history.dispose()}
 })
 it('retains an external confirmation after policy changes during await, and never submits the next item',async()=>{
  let resolve!:(value:any)=>void
  let first=true
  const commit=vi.fn((change:DrawingChange)=>{if(first){first=false;return new Promise(r=>resolve=r)}return Promise.resolve({status:'confirmed',snapshot:change.after})}),s=setup(commit),values=['a','b'].map(id=>({...make(id),owner:'backend' as const,backendId:id}))
  try{
   s.history.reconcile('backend',values)
   const pending=s.controller.execute({type:'update',ids:['a','b'],patch:{overlay:{styles}}})
   while(!commit.mock.calls.length)await Promise.resolve()
   s.deny();resolve({status:'confirmed',snapshot:commit.mock.calls[0][0].after})
   const result=await pending
   expect(result.items.map(item=>item.status)).toEqual(['confirmed','rejected']);expect(result.status).toBe('partial');expect(commit).toHaveBeenCalledOnce()
   expect(s.history.getDrawing('a')!.overlay.styles).toEqual(styles);expect(s.history.getDrawing('b')!.overlay.styles).toBe(null)
  }finally{s.controller.dispose();s.history.dispose()}
 })
 it('preserves legal lock, visibility, presentation and inverse-history operations',async()=>{
  const s=setup();try{
   s.history.reconcile('local',[make('a')])
   await s.controller.execute({type:'update',ids:['a'],patch:{overlay:{lock:true}}})
   expect((await s.controller.execute({type:'presentation',ids:['a'],patch:{name:'renamed'}})).status).toBe('completed')
   expect((await s.controller.execute({type:'update',ids:['a'],patch:{overlay:{visible:false}}})).status).toBe('completed')
   await s.controller.execute({type:'undo'});await s.controller.execute({type:'undo'});await s.controller.execute({type:'undo'})
   expect(s.history.getDrawing('a')!.overlay).toMatchObject({lock:false,visible:true})
   await s.controller.execute({type:'redo'});expect(s.history.getDrawing('a')!.overlay.lock).toBe(true)
   expect((await s.controller.execute({type:'update',ids:['a'],patch:{overlay:{lock:false}}})).status).toBe('completed')
  }finally{s.controller.dispose();s.history.dispose()}
 })
 it('rechecks binding epochs without retaining a caller policy on the history',async()=>{
  let detach=false
  const history=new DrawingHistory({context,apply:(_id,value)=>value,onConfirmed:()=>{if(detach)coordinator.detach()}})
  const coordinator=new DrawingCoordinator(history,{project:()=>{},changed:()=>{},validate:()=>{}})
  const options={history,coordinator,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local' as const}
  const a=new DrawingController({...options,editable:()=>true}),b=new DrawingController({...options,editable:()=>false})
  try{
   history.reconcile('local',['a','b'].map(make));detach=true
   expect((await a.execute({type:'update',ids:['a','b'],patch:{overlay:{styles}}})).items.map(item=>item.status)).toEqual(['confirmed','rejected'])
   detach=false;expect((await b.execute({type:'delete',ids:['b']})).status).toBe('rejected')
   expect((await a.execute({type:'delete',ids:['b']})).status).toBe('completed')
  }finally{a.dispose();b.dispose();coordinator.dispose();history.dispose()}
 })
})
