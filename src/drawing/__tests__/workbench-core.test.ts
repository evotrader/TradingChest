import {describe,it,expect,vi} from 'vitest'
import {DrawingHistory} from '../history'
import {DrawingController} from '../controller'
import {builtinDrawingCatalog,copyDrawingCatalog} from '../catalog'
import {anchorsFromPoints,projectAnchors,intervalVisible} from '../anchors'
import type {DrawingSnapshot,DrawingCommitResult} from '../types'
const period={multiplier:1,timespan:'minute',text:'1m'}
const context=()=>({symbol:{ticker:'A'},period})
const drawing=(id:string,owner:'local'|'backend'='local'):DrawingSnapshot=>({logicalId:id,owner,backendId:owner==='backend'?`server-${id}`:undefined,overlay:{id,name:'segment',groupId:'drawing_tools',points:[{timestamp:100,value:10},{timestamp:200,value:20}],extendData:null,styles:null,lock:false,visible:true,paneId:'candle_pane'}})
describe('drawing workbench authority and history',()=>{
  it('preserves the 51 ordinary and two volume tools and adds three curves',()=>{
    const catalog=copyDrawingCatalog();expect(catalog.filter(t=>t.category!=='volume'&&!['curve','doubleCurve','arc'].includes(t.toolId))).toHaveLength(51);expect(catalog.filter(t=>t.category==='volume').map(t=>t.toolId)).toEqual(['anchoredVwap','fixedRangeVolumeProfile'])
    expect(new Set(catalog.map(t=>t.overlayName)).size).toBe(56)
    expect(catalog.filter(tool=>['curve','doubleCurve','arc'].includes(tool.toolId)).map(tool=>[tool.toolId,tool.minPoints,tool.maxPoints])).toEqual([['curve',3,3],['doubleCurve',4,4],['arc',3,3]])
    for(const id of ['highlighter','polyline','ellipse','rotatedRect','trendAngle','crossLine','priceLabel','anchoredText'])expect(catalog.find(t=>t.toolId===id)).toBeDefined()
    catalog[0].labels['zh-CN']='changed';expect(builtinDrawingCatalog[0].labels['zh-CN']).not.toBe('changed')
    expect(()=>copyDrawingCatalog([catalog[0],catalog[0]])).toThrow('重复')
  })
  it('records a local batch as one undo and redo transaction',async()=>{
    const history=new DrawingHistory({context,apply:(_id,v)=>v})
    await history.submitBatch(['a','b'].map(id=>({kind:'create',logicalId:id,after:drawing(id)})),'programmatic')
    await history.undo();expect(history.getDrawings()).toEqual([]);expect(history.getState().canUndo).toBe(false)
    await history.redo();expect(history.getDrawings().map(d=>d.logicalId)).toEqual(['a','b'])
  })
  it('does not repeat a confirmed inverse after a later backend rejection',async()=>{
    let reject=false
    const commit=vi.fn(async change=>reject&&change.logicalId==='a'?{status:'rejected',message:'HTTP 409'} as DrawingCommitResult:{status:'confirmed',snapshot:change.after?{...change.after,backendId:change.before?.backendId??'new'}:null} as DrawingCommitResult)
    const history=new DrawingHistory({context,commit,apply:(_id,v)=>v})
    history.reconcile('backend',['a','b','c'].map(id=>drawing(id,'backend')))
    await history.submitBatch(['a','b'].map(id=>({kind:'delete',logicalId:id,after:null})),'programmatic')
    reject=true;await history.undo()
    expect(history.getLastResult()).toMatchObject({status:'partial',items:[{logicalId:'b',status:'confirmed'},{logicalId:'a',status:'rejected'}]})
    reject=false;await history.undo()
    expect(commit.mock.calls.filter(([c])=>c.logicalId==='b'&&c.kind==='create')).toHaveLength(1)
    expect(history.getDrawings().map(d=>d.logicalId).sort()).toEqual(['a','b','c'])
  })
  it('stops a backend batch after unknown and never compensates confirmed writes',async()=>{
    const commit=vi.fn(async change=>change.logicalId==='b'?{status:'uncertain',message:'lost'} as DrawingCommitResult:{status:'confirmed',snapshot:change.after} as DrawingCommitResult)
    const history=new DrawingHistory({context,commit,apply:(_id,v)=>v})
    history.reconcile('backend',['a','b','c'].map(id=>drawing(id,'backend')))
    const result=await history.submitBatch(['a','b','c'].map(id=>({kind:'delete',logicalId:id,after:null})),'programmatic')
    expect(result.items.map(i=>i.status)).toEqual(['confirmed','uncertain','not-attempted']);expect(commit).toHaveBeenCalledTimes(2)
    expect(history.getDrawings().map(d=>d.logicalId)).toEqual(['b','c'])
  })
  it('keeps backend presentation local and undoes it over a new canonical geometry',async()=>{
    const commit=vi.fn(),history=new DrawingHistory({context,commit,apply:(_id,v)=>v})
    history.reconcile('backend',[drawing('a','backend')])
    const changed={...drawing('a','backend'),presentation:{name:'Support'}}
    await history.submit('update','a',changed,'programmatic');expect(commit).not.toHaveBeenCalled()
    const canonical=drawing('a','backend');canonical.overlay.points[0].value=99
    history.reconcile('backend',[canonical]);expect(history.getDrawings()[0].presentation?.name).toBe('Support')
    await history.undo();expect(history.getDrawings()[0].overlay.points[0].value).toBe(99);expect(history.getDrawings()[0].presentation).toBeUndefined();expect(commit).not.toHaveBeenCalled()
  })
  it('preflights all protected targets, clones with new identity, and permits explicit unlock',async()=>{
    const commit=vi.fn(),history=new DrawingHistory({context,commit,apply:(_id,v)=>v})
    history.reconcile('local',[drawing('a'),drawing('protected')])
    const controller=new DrawingController({history,create:vi.fn(),cancel:vi.fn(),project:vi.fn(),validate:vi.fn(),owner:()=> 'backend',editable:d=>d.logicalId!=='protected'})
    expect((await controller.execute({type:'delete',ids:['a','protected']})).status).toBe('rejected');expect(history.getDrawings()).toHaveLength(2)
    await controller.execute({type:'copy',ids:['a']})
    commit.mockResolvedValue({status:'rejected',message:'HTTP 422'})
    await controller.execute({type:'paste'});expect(commit).toHaveBeenCalledOnce();expect(commit.mock.calls[0][0].after.backendId).toBeUndefined();expect(commit.mock.calls[0][0].logicalId).not.toBe('a')
    const locked=drawing('a');locked.overlay.lock=true;history.reconcile('local',[locked])
    expect((await controller.execute({type:'delete',ids:['a']})).status).toBe('rejected')
    expect((await controller.execute({type:'update',ids:['a'],patch:{overlay:{lock:false}}})).status).toBe('completed')
  })
  it('keeps confirmed authority and history even when the renderer throws, without duplicate create',async()=>{
    const commit=vi.fn(async change=>({status:'confirmed' as const,snapshot:{...change.after,backendId:'server-actual'}}))
    const history=new DrawingHistory({context,commit,apply:()=>{throw Error('Pane unavailable')}})
    await expect(history.submit('create','a',drawing('a','backend'),'programmatic')).resolves.toMatchObject({status:'confirmed'})
    expect(history.getDrawings()[0].backendId).toBe('server-actual');expect(history.getState()).toMatchObject({canUndo:true,projectionErrors:{a:'Pane unavailable'}})
    await expect(history.submit('create','a',drawing('a','backend'),'programmatic')).resolves.toMatchObject({status:'rejected'});expect(commit).toHaveBeenCalledOnce()
  })
  it('retains a successful prefix even when the next rejection cannot be projected',async()=>{
    const commit=vi.fn(async change=>change.logicalId==='b'?{status:'rejected' as const,message:'HTTP 409'}:{status:'confirmed' as const,snapshot:change.after})
    let fail=false
    const history=new DrawingHistory({context,commit,apply:(id,v)=>{if(fail&&id==='b')throw Error('Missing pane');return v}})
    history.reconcile('backend',['a','b','c'].map(id=>drawing(id,'backend')));fail=true
    const result=await history.submitBatch(['a','b','c'].map(logicalId=>({kind:'delete',logicalId,after:null})),'programmatic')
    expect(result).toMatchObject({status:'partial',items:[{logicalId:'a',status:'confirmed'},{logicalId:'b',status:'rejected'},{logicalId:'c',status:'not-attempted'}]})
    expect(history.getState()).toMatchObject({canUndo:true,projectionErrors:{b:'Missing pane'}});expect(history.getDrawings().map(d=>d.logicalId)).toEqual(['b','c'])
  })
  it('applies consecutive patches against the latest confirmed content',async()=>{
    const history=new DrawingHistory({context,apply:(_id,v)=>v})
    history.reconcile('local',[drawing('a')])
    const controller=new DrawingController({history,create:vi.fn(),cancel:vi.fn(),project:vi.fn(),validate:vi.fn(),owner:()=> 'local',editable:()=>true})
    const color=controller.execute({type:'update',ids:['a'],patch:{overlay:{styles:{line:{color:'#f00'}}}}})
    const hide=controller.execute({type:'update',ids:['a'],patch:{overlay:{visible:false}}})
    await Promise.all([color,hide]);expect(history.getDrawings()[0].overlay).toMatchObject({styles:{line:{color:'#f00'}},visible:false})
  })
  it('updates the authoritative anchors before backend submission and refuses ambiguous coordinate input',async()=>{
    const commit=vi.fn(async change=>({status:'confirmed' as const,snapshot:change.after})),history=new DrawingHistory({context,commit,apply:(_id,v)=>v})
    const original={...drawing('a','backend'),anchors:[{kind:'market' as const,timestamp:100,value:10},{kind:'market' as const,timestamp:200,value:20}]}
    history.reconcile('backend',[original])
    const controller=new DrawingController({history,create:vi.fn(),cancel:vi.fn(),project:vi.fn(),validate:vi.fn(),owner:()=> 'backend',editable:()=>true,coordinates:(value)=>({...value,anchors:anchorsFromPoints(value.overlay.points,[],period)})})
    expect((await controller.execute({type:'update',ids:['a'],patch:{overlay:{points:[{timestamp:100,value:99},{timestamp:200,value:20}]}}})).status).toBe('completed')
    expect(commit.mock.calls[0][0].after.anchors[0].value).toBe(99);expect(history.getDrawings()[0].anchors?.[0]).toMatchObject({value:99});expect(history.getState().canUndo).toBe(true)
    expect((await controller.execute({type:'update',ids:['a'],patch:{anchors:original.anchors,overlay:{points:original.overlay.points}}})).status).toBe('rejected');expect(commit).toHaveBeenCalledOnce()
  })
  it('merges a property intent after a pending drag in the same history queue',async()=>{
    let release!:(value:DrawingCommitResult)=>void
    const commit=vi.fn(async change=>commit.mock.calls.length===1?new Promise<DrawingCommitResult>(resolve=>{release=resolve}):{status:'confirmed' as const,snapshot:change.after})
    const history=new DrawingHistory({context,commit,apply:(_id,v)=>v});history.reconcile('backend',[drawing('a','backend')])
    const moved=drawing('a','backend');moved.overlay.points[0].value=99
    const drag=history.submit('update','a',moved,'drawing-bar')
    const controller=new DrawingController({history,create:vi.fn(),cancel:vi.fn(),project:vi.fn(),validate:vi.fn(),owner:()=> 'backend',editable:()=>true})
    const property=controller.execute({type:'update',ids:['a'],patch:{overlay:{styles:{line:{color:'#f00'}}}}})
    for(let i=0;i<10&&!release;i++)await Promise.resolve()
    release({status:'confirmed',snapshot:moved});await Promise.all([drag,property])
    expect(commit.mock.calls.map(([change])=>change.after.overlay.points[0].value)).toEqual([99,99]);expect(history.getDrawings()[0].overlay.styles?.line?.color).toBe('#f00')
  })
  it('merges only the requested style fields after a pending backend color change',async()=>{
    let release!:(value:DrawingCommitResult)=>void
    const commit=vi.fn(async change=>commit.mock.calls.length===1?new Promise<DrawingCommitResult>(resolve=>{release=resolve}):{status:'confirmed' as const,snapshot:change.after})
    const history=new DrawingHistory({context,commit,apply:(_id,v)=>v});history.reconcile('backend',[drawing('a','backend')])
    const red=drawing('a','backend');red.overlay.styles={line:{color:'#f00',size:1}}
    const color=history.submit('update','a',red,'property-bar')
    const controller=new DrawingController({history,create:vi.fn(),cancel:vi.fn(),project:vi.fn(),validate:vi.fn(),owner:()=> 'backend',editable:()=>true})
    const width=controller.execute({type:'update',ids:['a'],patch:{overlay:{styles:{line:{size:4}}}}})
    for(let i=0;i<10&&!release;i++)await Promise.resolve()
    release({status:'confirmed',snapshot:red});await Promise.all([color,width])
    expect(commit.mock.calls[1][0].after.overlay.styles.line).toEqual({color:'#f00',size:4});expect(history.getDrawings()[0].overlay.styles?.line).toEqual({color:'#f00',size:4})
  })
})
describe('drawing anchor projection',()=>{
  const bars=[100,200,300].map(timestamp=>({timestamp,open:1,high:2,low:1,close:2,volume:1}))
  it('retains real timestamps and fractional precision independently of prepended history',()=>{
    const anchors=anchorsFromPoints([{timestamp:125,dataIndex:.25,value:10}],bars,period,'interaction')
    expect(anchors).toEqual([{kind:'market',timestamp:100,value:10,interpolation:{nextTimestamp:200,fraction:.25}}])
    expect(projectAnchors(anchors,[{...bars[0],timestamp:0},...bars],period)).toEqual([{timestamp:125,value:10}])
  })
  it('projects future logical offsets only with the original period and an actual reference bar',()=>{
    const anchors=anchorsFromPoints([{dataIndex:5.5,value:10}],bars,period)
    expect(anchors).toEqual([{kind:'logical',referenceTimestamp:300,offsetBars:3.5,period:{multiplier:1,timespan:'minute'},value:10}])
    expect(projectAnchors(anchors,[{...bars[0],timestamp:0},...bars],period)).toEqual([{dataIndex:6.5,value:10}])
    expect(()=>projectAnchors(anchors,bars,{...period,timespan:'day'})).toThrow('原周期')
    expect(()=>anchorsFromPoints([{dataIndex:8,value:10}],[],period)).toThrow('原件已保留')
  })
  it('orders month/week filters by units without guessed millisecond durations',()=>{
    expect(intervalVisible({kind:'higher',period:{multiplier:1,timespan:'month'}},{...period,multiplier:5,timespan:'week'})).toBe(false)
    expect(intervalVisible({kind:'list',periods:[{multiplier:3,timespan:'custom'}]},{...period,multiplier:3,timespan:'custom'})).toBe(true)
  })
  it('preserves a legacy timestamp even when its saved index refers to a different loaded window',()=>{
    const anchors=anchorsFromPoints([{timestamp:150,dataIndex:.5,value:10}],bars.map(b=>({...b,timestamp:b.timestamp*10})),period)
    expect(anchors).toEqual([{kind:'market',timestamp:150,value:10}])
  })
  it('does not treat the engine extrapolated future timestamp as a market observation',()=>{
    const anchors=anchorsFromPoints([{timestamp:400,dataIndex:3,value:10}],bars,period,'interaction')
    expect(anchors).toEqual([{kind:'logical',referenceTimestamp:300,offsetBars:1,period:{multiplier:1,timespan:'minute'},value:10}])
  })
})
