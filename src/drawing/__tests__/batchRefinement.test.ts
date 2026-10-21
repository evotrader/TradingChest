import {describe,it,expect,vi} from 'vitest'
import {DrawingHistory} from '../history'
import {DrawingController} from '../controller'
import {DrawingCoordinator} from '../coordinator'
import type {DrawingSnapshot,DrawingChange} from '../types'

const context=()=>({symbol:{ticker:'BATCH'},period:{multiplier:1,timespan:'minute',text:'1m'}})
const drawing=(id:string):DrawingSnapshot=>({logicalId:id,owner:'local',presentation:{order:Number(id)},anchors:[{kind:'market',timestamp:100,value:10},{kind:'market',timestamp:200,value:11}],overlay:{id,name:'segment',paneId:'candle_pane',points:[{timestamp:100,value:10},{timestamp:200,value:11}],visible:true,lock:false,styles:null,extendData:null}})

describe('batch projection preflight and canonical copies',()=>{
  it('preflights the complete projection once and preserves per-item confirmation and one history entry',async()=>{
    const changes:DrawingChange[]=[],validate=vi.fn(),validateBatch=vi.fn(),apply=vi.fn((_id,value)=>value)
    const history=new DrawingHistory({context,apply,validate,onConfirmed:change=>changes.push(change)})
    history.reconcile('local',['0','1','2'].map(drawing));apply.mockClear();validate.mockClear()
    const coordinator=new DrawingCoordinator(history,{project:()=>{},changed:()=>{},validate:()=>{throw Error('Unexpected per-item inventory rebuild')},validateBatch})
    const controller=new DrawingController({history,coordinator,editable:()=>true,validate:value=>coordinator.validate(value),validateBatch:values=>coordinator.validateBatch(values),create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
    expect((await controller.execute({type:'update',ids:['0','1','2'],patch:{overlay:{styles:{line:{color:'#123456'}}}}})).status).toBe('completed')
    expect(validateBatch).toHaveBeenCalledOnce();expect(validateBatch.mock.calls[0][0].map(value=>value.logicalId)).toEqual(['0','1','2'])
    expect(validate).toHaveBeenCalledTimes(6)
    expect(changes.map(change=>change.logicalId)).toEqual(['0','1','2']);expect(apply).toHaveBeenCalledTimes(3)
    await controller.execute({type:'undo'});expect(history.getState().canUndo).toBe(false)
    expect(history.getDrawings().every(value=>value.overlay.styles===null)).toBe(true)
    await controller.execute({type:'redo'});expect(history.getDrawings().every(value=>value.overlay.styles?.line?.color==='#123456')).toBe(true)
  })
  it('rejects a failing complete preflight before any writes or projections',async()=>{
    const commit=vi.fn(),apply=vi.fn((_id,value)=>value),history=new DrawingHistory({context,apply,commit})
    history.reconcile('local',['0','1'].map(drawing));apply.mockClear()
    const controller=new DrawingController({history,editable:()=>true,validate:()=>{},validateBatch:()=>{throw Error('Host collision')},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
    const result=await controller.execute({type:'update',ids:['0','1'],patch:{overlay:{lock:true}}})
    expect(result).toMatchObject({status:'rejected',message:'Host collision'});expect(apply).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(history.getState().canUndo).toBe(false)
  })
  it('keeps normalized JSON and independent nested copies without exposing canonical map objects',()=>{
    const history=new DrawingHistory({context,apply:(_id,value)=>{if(value)value.overlay.points[0].value=999;return value}})
    const value=drawing('0');value.overlay.extendData=JSON.parse('{"__proto__":{"polluted":true},"rows":[{"value":1}]}')
    ;(value.overlay.extendData as any).date=new Date('2026-10-21T00:00:00Z')
    history.reconcile('local',[value])
    const first=history.getDrawing('0')!,all=history.getDrawings()
    expect(first.overlay.points[0].value).toBe(10);expect((first.overlay.extendData as any).date).toBe('2026-10-21T00:00:00.000Z')
    expect(Object.hasOwn(first.overlay.extendData!,'__proto__')).toBe(true);expect(({} as any).polluted).toBeUndefined()
    ;(first.overlay.extendData as any).rows[0].value=99;all[0].anchors![0]={kind:'market',timestamp:300,value:30}
    expect((history.getDrawing('0')!.overlay.extendData as any).rows[0].value).toBe(1);expect(history.getDrawing('0')!.anchors![0]).toMatchObject({timestamp:100,value:10})
    expect(history.getMigratingDrawingIds()).toEqual([]);expect(history.hasDrawing('0')).toBe(true)
  })
  it('retains confirmed order and stops old local work when disposed during a cooperative batch',async()=>{
    let confirmations=0
    const history=new DrawingHistory({context,apply:(_id,value)=>value,onConfirmed:()=>{if(++confirmations===2)history.dispose()}})
    const values=Array.from({length:130},(_,index)=>drawing(String(index)))
    history.reconcile('local',values)
    await expect(history.submitBatch(values.map(value=>({kind:'update',logicalId:value.logicalId,after:{...value,overlay:{...value.overlay,lock:true}}})),'programmatic')).rejects.toMatchObject({name:'AbortError'})
    expect(confirmations).toBe(2);expect(history.getDrawings()).toEqual([])
  })
})
