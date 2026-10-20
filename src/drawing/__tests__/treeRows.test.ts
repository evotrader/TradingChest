import {describe,it,expect} from 'vitest'
import {flattenDrawingRows,visibleDrawingRows,legalReorderTargets,drawingGroupKey} from '../../widget/drawing-object-tree/treeRows'
import {DrawingController} from '../controller'
import {DrawingHistory} from '../history'
import type {DrawingSnapshot} from '../types'
const drawing=(id:string,order:number,groupId?:string):DrawingSnapshot=>({logicalId:id,owner:'local',presentation:{order,groupId,groupName:groupId},overlay:{id,name:'segment',groupId:'drawing_tools',points:[{timestamp:1,value:1},{timestamp:2,value:2}],visible:true,lock:false,styles:null,extendData:null,paneId:'candle_pane'}})
const context=()=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'}})
describe('drawing tree rows and confirmed ordering',()=>{
  it('renders a bounded viewport over all 1000 real identities',()=>{
    const objects=Array.from({length:1000},(_,i)=>drawing(String(i),i)),rows=flattenDrawingRows(objects,new Set())
    expect(rows).toHaveLength(1000)
    const visible=visibleDrawingRows(rows,56*500,360)
    expect(visible.length).toBeLessThan(20);expect(visible.some(r=>r.object?.logicalId==='500')).toBe(true)
    expect(rows.at(-1)?.object?.logicalId).toBe('999')
  })
  it('keeps group collapse separate from the document and expands search results temporarily',()=>{
    const objects=[drawing('a',2,'group'),drawing('b',1,'group'),drawing('c',0)],collapsed=new Set([drawingGroupKey(objects[0])])
    expect(flattenDrawingRows(objects,collapsed).map(r=>r.object?.logicalId??r.group?.name)).toEqual(['group','c'])
    expect(flattenDrawingRows(objects,collapsed,true)).toHaveLength(4)
    expect(collapsed.size).toBe(1);expect(objects[0].presentation?.groupId).toBe('group')
  })
  it('only offers targets from the same unlocked group, pane and scope',()=>{
    const objects=[drawing('a',0,'g'),drawing('b',1,'g'),drawing('c',2,'h'),drawing('d',3,'g')];objects[3].overlay.lock=true
    expect(legalReorderTargets(objects,['a']).map(d=>d.logicalId)).toEqual(['b'])
    expect(legalReorderTargets(objects,['a'],['b'])).toEqual([])
    expect(legalReorderTargets(objects,['a','c'])).toEqual([])
    objects[1].presentation!.scope='workspace';expect(legalReorderTargets(objects,['a'])).toEqual([])
  })
  it('moves a selected object before a target in displayed z order with one undo',async()=>{
    const history=new DrawingHistory({context,apply:(_id,value)=>value});history.reconcile('local',['a','b','c'].map((id,i)=>drawing(id,i)))
    const controller=new DrawingController({history,editable:()=>true,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
    const sorted=()=>history.getDrawings().sort((a,b)=>(b.presentation?.order??0)-(a.presentation?.order??0)).map(d=>d.logicalId)
    expect((await controller.execute({type:'reorder',ids:['a'],targetId:'b',position:'before'})).status).toBe('completed')
    expect(sorted()).toEqual(['c','a','b'])
    await controller.execute({type:'undo'});expect(sorted()).toEqual(['c','b','a'])
    await controller.execute({type:'redo'});expect(sorted()).toEqual(['c','a','b'])
  })
  it('rejects foreign groups, locked targets and renumbering that would mutate a protected neighbor',async()=>{
    const history=new DrawingHistory({context,apply:(_id,value)=>value}),objects=[drawing('a',0,'g'),drawing('b',0,'g'),drawing('c',0,'h')]
    objects[2].overlay.lock=true;history.reconcile('local',objects)
    const controller=new DrawingController({history,editable:()=>true,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
    for(const targetId of ['a','c','missing','b'])expect((await controller.execute({type:'reorder',ids:['a'],targetId,position:'before'})).status).toBe('rejected')
    expect(history.getDrawings()).toEqual(objects)
  })
})
