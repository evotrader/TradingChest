import {describe,it,expect,vi} from 'vitest'
vi.mock('klinecharts',()=>({getSupportedOverlays:()=>['segment'],getSupportedIndicators:()=>['MA'],registerIndicator:vi.fn()}))
import {DrawingHistory} from '../history'
import {DrawingController} from '../controller'
import {DrawingCoordinator} from '../coordinator'
import {DrawingSessionRegistry} from '../session'
import {copyStoredDrawing,type StoredDrawingDocument,type DrawingDocumentStore} from '../documentStore'
import {isDrawingSnapshot,loadLayoutV4,migrateLayoutToV4,saveLayoutV4} from '../../persistence/v4'
import {nudgedDrawing,type DrawingGeometry} from '../geometry'
import {builtinDrawingCatalog,validateDrawingParameters} from '../catalog'
import type {DrawingSnapshot,DrawingScope} from '../types'
const context=()=>({symbol:{ticker:'AUDIT'},period:{multiplier:1,timespan:'minute',text:'1m'}})
const value=(id:string,order:number,scope:DrawingScope='chart'):DrawingSnapshot=>({logicalId:id,owner:'local',presentation:{order,scope},anchors:[{kind:'market',timestamp:100,value:1},{kind:'market',timestamp:200,value:2}],overlay:{id,name:'segment',paneId:'candle_pane',groupId:'drawing_tools',points:[{timestamp:100,value:1},{timestamp:200,value:2}],visible:true,lock:false,styles:null,extendData:null}})
const controls=(history:DrawingHistory,coordinator?:DrawingCoordinator)=>new DrawingController({history,coordinator,editable:()=>true,validate:d=>coordinator?.validate(d),create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
describe('volume release audit contracts',()=>{
  it('persists and restores a reordered local layout without changing the integer schema',async()=>{
    const history=new DrawingHistory({context,apply:(_id,v)=>v}),controller=controls(history)
    history.reconcile('local',['a','b','c'].map((id,i)=>value(id,i)))
    expect((await controller.execute({type:'reorder',ids:['a'],targetId:'b',position:'before'})).status).toBe('completed')
    expect(history.getDrawings().every(isDrawingSnapshot)).toBe(true)
    const migrated=migrateLayoutToV4({version:3,timestamp:1,theme:'dark',locale:'zh-CN',timezone:'UTC',styles:{},indicators:[],panes:[{id:'candle_pane'}],axes:[],annotationRefs:[],overlayData:[]})
    if(migrated.status!=='ok')throw Error('Fixture layout invalid')
    const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)} as Storage
    expect(saveLayoutV4('audit',{...migrated.value,drawings:history.getDrawings()},storage).status).toBe('ok')
    expect(loadLayoutV4('audit',storage)).toMatchObject({status:'ok',value:{drawings:history.getDrawings()}})
    await controller.execute({type:'undo'});expect(history.getDrawing('a')?.presentation?.order).toBe(0)
    await controller.execute({type:'redo'});expect(history.getDrawings().every(isDrawingSnapshot)).toBe(true)
  })
  it.each(['workspace','host'] as const)('confirms and saves absolute ordering through the real %s session',async scope=>{
    let row:StoredDrawingDocument|null=null
    const store:DrawingDocumentStore={read:async()=>row,write:async(namespace,input)=>{row=copyStoredDrawing(namespace,input.documentId,{documentId:input.documentId,revision:'r1',document:input.document});return row}}
    const registry=new DrawingSessionRegistry({scope,store:scope==='host'?store:undefined})
    const session=await registry.bind({identity:{namespace:'audit',symbol:{ticker:'A.X',market:'equity',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'},documentId:scope==='host'?'fixed':undefined})
    for(const [i,id] of ['a','b','c'].entries())await session.history.submit('create',id,value(id,i,scope),'programmatic')
    const local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},validate:()=>{},changed:()=>{}})
    coordinator.bind(scope==='workspace'?session:undefined,scope==='host'?session:undefined)
    const controller=controls(local,coordinator)
    expect((await controller.execute({type:'reorder',ids:['a'],targetId:'b',position:'before'})).status).toBe('completed')
    expect(session.capture().drawings.every(isDrawingSnapshot)).toBe(true)
    if(scope==='host'){await session.save();expect(row?.document.drawings.every(isDrawingSnapshot)).toBe(true)}
    await controller.execute({type:'undo'});expect(session.history.getDrawing('a')?.presentation?.order).toBe(0)
    await controller.execute({type:'redo'});expect(session.history.getDrawings().every(isDrawingSnapshot)).toBe(true)
    coordinator.dispose();registry.dispose();local.dispose()
  })
  it('keeps consecutive insertions local after one integer renumbering and restores their order',async()=>{
    const history=new DrawingHistory({context,apply:(_id,v)=>v}),controller=controls(history)
    const initial=Array.from({length:30},(_,i)=>value(`d${i}`,0));history.reconcile('local',initial)
    await controller.execute({type:'reorder',ids:['d0'],targetId:'d29',position:'before'})
    const first=history.getDrawings();expect(first.every(isDrawingSnapshot)).toBe(true)
    for(let i=1;i<10;i++){
      const before=history.getDrawings()
      expect((await controller.execute({type:'reorder',ids:[`d${i}`],targetId:'d29',position:'before'})).status).toBe('completed')
      const after=history.getDrawings();expect(after.every(isDrawingSnapshot)).toBe(true)
      expect(after.filter(d=>d.presentation?.order!==before.find(b=>b.logicalId===d.logicalId)?.presentation?.order).map(d=>d.logicalId)).toEqual([`d${i}`])
      expect(after.find(d=>d.logicalId===`d${i}`)!.presentation!.order!).toBeGreaterThan(after.find(d=>d.logicalId==='d29')!.presentation!.order!)
      await controller.execute({type:'undo'});expect(history.getDrawings()).toEqual(before)
      await controller.execute({type:'redo'});expect(history.getDrawings()).toEqual(after)
    }
  })
  it('keeps mixed selection keyboard movement in one history operation with per-tool units',async()=>{
    const bars=Array.from({length:30},(_,i)=>({timestamp:(i+1)*100,open:i+1,high:i+1,low:i+1,close:i+1,volume:1}))
    const geometry:DrawingGeometry={bars,period:context().period,size:()=>({width:500,height:500}),project:d=>d.overlay.points,toPixel:p=>({x:(p.timestamp!/100-1)*10,y:p.value!}),fromPixel:p=>({dataIndex:p.x/10,value:p.y})}
    const history=new DrawingHistory({context,apply:(_id,v)=>v}),normal=value('normal',0),volume=value('volume',1)
    volume.overlay.name='fixedRangeVolumeProfile';history.reconcile('local',[normal,volume])
    const controller=new DrawingController({history,editable:()=>true,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local',translateNudge:(d,x,y)=>nudgedDrawing(d,x,y,geometry)})
    expect((await controller.nudgeSelection(['normal','volume'],10,0)).status).toBe('completed')
    expect(history.getDrawing('volume')?.anchors).toEqual([{kind:'market',timestamp:1100,value:1},{kind:'market',timestamp:1200,value:2}])
    expect(history.getDrawing('normal')?.anchors?.[0]).toMatchObject({timestamp:200,value:1})
    await controller.execute({type:'undo'});expect(history.getDrawings()).toEqual([normal,volume])
    expect(history.getState().canUndo).toBe(false)
  })
  it('accepts exactly the documented positive finite value-area domain',()=>{
    const tool=builtinDrawingCatalog.find(t=>t.toolId==='fixedRangeVolumeProfile')!
    for(const valueArea of [Number.MIN_VALUE,1e-7,.7,1])expect(()=>validateDrawingParameters(tool,{valueArea})).not.toThrow()
    for(const valueArea of [-0,0,-1,1.00001,NaN,Infinity])expect(()=>validateDrawingParameters(tool,{valueArea})).toThrow()
  })
})
