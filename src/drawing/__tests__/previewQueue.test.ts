import {describe,it,expect,vi} from 'vitest'
import {DrawingController} from '../controller'
import {DrawingHistory} from '../history'
import type {DrawingSnapshot} from '../types'
const drawing=(id:string,owner:'local'|'backend'='local'):DrawingSnapshot=>({logicalId:id,owner,backendId:owner==='backend'?'server-'+id:undefined,anchors:[{kind:'market',timestamp:100,value:10},{kind:'market',timestamp:200,value:20}],overlay:{id,name:'segment',paneId:'candle_pane',groupId:'drawing_tools',points:[{timestamp:100,value:10},{timestamp:200,value:20}],visible:true,lock:false,styles:null,extendData:null}})
const context=()=>({symbol:{ticker:'A.X'},period:{multiplier:1,timespan:'minute',text:'1m'}})
const options=(history:DrawingHistory)=>({history,editable:()=>true,validate:vi.fn(),create:vi.fn(),cancel:vi.fn(),project:vi.fn(),owner:()=> 'local' as const})
describe('drawing preview queue boundaries',()=>{
 it('rejects an old gesture when canonical changes before its queued writer executes',async()=>{
  const commit=vi.fn(),history=new DrawingHistory({context,commit,apply:(_id,value)=>value});history.reconcile('local',[drawing('gesture')])
  const controller=new DrawingController(options(history)),before=history.getDrawing('gesture')!
  const gesture=controller.commitPreview({type:'update',ids:['gesture'],patch:{anchors:[{kind:'market',timestamp:100,value:30},{kind:'market',timestamp:200,value:40}]}},[before])
  const current=drawing('gesture');current.anchors![0]={kind:'market',timestamp:100,value:99};history.reconcile('local',[current])
  expect(await gesture).toMatchObject({status:'rejected',message:expect.stringContaining('已被更新')});expect(history.getDrawing('gesture')!.anchors![0]).toMatchObject({value:99});expect(commit).not.toHaveBeenCalled();expect(history.getState().canUndo).toBe(false)
 })
 it('resolves repeated point nudges from each latest confirmed backend value',async()=>{
  const commit=vi.fn(async change=>({status:'confirmed' as const,snapshot:change.after})),history=new DrawingHistory({context,commit,apply:(_id,value)=>value});history.reconcile('backend',[drawing('a','backend')])
  const controller=new DrawingController({...options(history),translatePoint:(before,index,dx,dy)=>{const after=structuredClone(before);after.anchors![index]={...after.anchors![index],value:(after.anchors![index] as {value:number}).value+dy};return after}})
  await Promise.all([controller.nudgePoint('a',0,0,1),controller.nudgePoint('a',0,0,1)])
  expect(commit.mock.calls.map(([change])=>(change.after.anchors[0] as {value:number}).value)).toEqual([11,12]);expect(history.getDrawing('a')!.anchors![0]).toMatchObject({value:12})
 })
})
