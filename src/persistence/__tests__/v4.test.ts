import {describe,it,expect,vi} from 'vitest'
vi.mock('klinecharts',()=>({getSupportedOverlays:()=>['segment'],getSupportedIndicators:()=>['MA'],registerIndicator:vi.fn()}))
import {migrateLayoutToV4,isChartLayoutV4,loadLayoutV4,saveLayoutV4,restoreLayout} from '../index'
import type {ChartPro} from '../../types'
import {builtinDrawingCatalog} from '../../drawing/catalog'
import {DrawingHistory} from '../../drawing/history'
import {drawingBindings} from '../../drawing/bindings'
import {projectAnchors} from '../../drawing/anchors'
import {validateDrawingRestore} from '../../drawing/restore'
import {isDrawingSnapshot} from '../v4'
import {builtinIndicatorCatalog} from '../../indicator/catalog'
import {indicatorRegistry} from '../../indicator'
const legacy={version:3,timestamp:1,theme:'dark',locale:'zh-CN',timezone:'UTC',styles:{},indicators:[],panes:[{id:'candle_pane'}],axes:[],annotationRefs:['server-1'],overlayData:[{id:'a',paneId:'candle_pane',groupId:'drawing_tools',name:'segment',points:[{timestamp:100,value:1},{timestamp:200,value:2}],visible:true,lock:false}]}
describe('v4 drawing persistence',()=>{
  it('checks nested JSON on every layout read and on standalone snapshot reads',()=>{
    const migrated=migrateLayoutToV4(legacy);if(migrated.status!=='ok')throw Error('migration failed')
    const layout=migrated.value,drawing=layout.drawings[0]
    expect(isChartLayoutV4(layout)).toBe(true);expect(isDrawingSnapshot(drawing)).toBe(true)
    for(const invalid of [()=>1,NaN,new Date(),{api_key:'not-a-credential'},layout]){
      drawing.overlay.extendData={metadata:invalid} as any
      expect(isChartLayoutV4(layout)).toBe(false)
      expect(isDrawingSnapshot(drawing)).toBe(false)
    }
    drawing.overlay.extendData={metadata:{label:'retained'}}
    expect(isChartLayoutV4(layout)).toBe(true)
    drawing.anchors![0]={kind:'market',timestamp:100,value:Infinity}
    expect(isChartLayoutV4(layout)).toBe(false)
  })
  it('migrates without writing or mutating v3 and retains backend references',()=>{
    const original=JSON.stringify(legacy),result=migrateLayoutToV4(legacy)
    expect(result.status).toBe('ok');if(result.status!=='ok')throw Error('migration failed')
    expect(isChartLayoutV4(result.value)).toBe(true);expect(result.value.annotationRefs).toEqual(['server-1'])
    expect(result.value.drawings[0].anchors).toEqual([{kind:'market',timestamp:100,value:1},{kind:'market',timestamp:200,value:2}]);expect(JSON.stringify(legacy)).toBe(original)
  })
  it('validates host references separately from the legacy engine configuration',()=>{
    const result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const identity={namespace:'host',symbol:{market:'equity',exchange:'X',ticker:'A.X',priceCurrency:'USD'},priceBasisKey:'raw'}
    const reference={namespace:'host',documentId:'fixed',logicalId:'shared',identity}
    expect(isChartLayoutV4({...result.value,sharedDrawingRefs:[reference]})).toBe(true)
    expect(isChartLayoutV4({...result.value,sharedDrawingRefs:[{...reference,identity:{...identity,symbol:{ticker:'A.X'}}}]})).toBe(false)
    expect(isChartLayoutV4({...result.value,sharedDrawingRefs:[reference,reference]})).toBe(false)
  })
  it('refuses unresolved legacy indexes and resolves them only with supplied actual history',()=>{
    const value={...legacy,overlayData:[{...legacy.overlayData[0],points:[{dataIndex:0,value:2}]}]}
    expect(migrateLayoutToV4(value)).toMatchObject({status:'error',code:'migration'})
    const result=migrateLayoutToV4(value,{bars:[{timestamp:123,open:1,high:2,low:1,close:2}]})
    expect(result).toMatchObject({status:'ok',value:{drawings:[{anchors:[{kind:'market',timestamp:123,value:2}]}]}})
  })
  it('writes under a new key, preserves the old original, and never masks corrupt v4',()=>{
    const values=new Map([['trading-chest-layout-v3-a',JSON.stringify(legacy)]])
    const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)} as Storage
    const loaded=loadLayoutV4('a',store);expect(values.size).toBe(1);if(loaded.status!=='ok')throw Error('load failed')
    expect(saveLayoutV4('a',loaded.value,store).status).toBe('ok');expect(values.size).toBe(2)
    values.set('trading-chest-layout-v4-a','{}');expect(loadLayoutV4('a',store)).toMatchObject({status:'error',code:'corrupt'});expect(values.get('trading-chest-layout-v3-a')).toBe(JSON.stringify(legacy))
  })
  it('rejects backend content, duplicate logical IDs and malformed anchors',()=>{
    const result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const layout=result.value,drawing=layout.drawings[0]
    expect(isChartLayoutV4({...layout,drawings:[{...drawing,owner:'backend'}]})).toBe(false)
    expect(isChartLayoutV4({...layout,drawings:[{...drawing,presentation:{scope:'host'}}]})).toBe(false)
    expect(isChartLayoutV4({...layout,drawings:[drawing,drawing]})).toBe(false)
    expect(isChartLayoutV4({...layout,drawings:[{...drawing,anchors:[{kind:'market',timestamp:NaN,value:2}]}]})).toBe(false)
  })
  it('preflights unknown tools and parameters before changing existing layout',async()=>{
    const result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const getChart=vi.fn(),pro={getDrawingTools:()=>builtinDrawingCatalog,getChart} as unknown as ChartPro
    const layout=structuredClone(result.value);layout.drawings[0].overlay.name='custom:unknown'
    await expect(restoreLayout(pro,layout)).rejects.toThrow('请先注册工具');expect(getChart).not.toHaveBeenCalled()
    layout.drawings[0].overlay.name='segment';layout.drawings[0].parameters={notSupported:true}
    await expect(restoreLayout(pro,layout)).rejects.toThrow('不支持参数');expect(getChart).not.toHaveBeenCalled()
  })
  function runtime(){
    const period={multiplier:1,timespan:'day',text:'1d'},bars=[{timestamp:100,open:1,high:2,low:1,close:2}]
    const chart:any={getIndicators:()=>[],getPaneOptions:()=>[{id:'candle_pane',height:300,minHeight:30,order:0}],getYAxes:()=>[],getOverlays:()=>[],getDataList:()=>bars,getVisibleRange:()=>({from:0,to:1}),getBarSpace:()=>({bar:8}),getStyles:()=>({}),setStyles:vi.fn(),setPaneOptions:vi.fn(),setBarSpace:vi.fn(),scrollToDataIndex:vi.fn()}
    const history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period}),apply:(_id,value)=>{if(value?.anchors)projectAnchors(value.anchors,bars,period);return value}})
    const pro:any={getChart:()=>chart,getSymbol:()=>({ticker:'A'}),getPeriod:()=>period,getTheme:()=> 'dark',getLocale:()=> 'zh-CN',getTimezone:()=> 'UTC',getDrawingHistoryState:()=>history.getState(),getDrawings:()=>history.getDrawings(),getDrawingTools:()=>builtinDrawingCatalog,getIndicatorCatalog:()=>[],resetDrawingHistory:()=>history.reset(),setTheme:vi.fn(),setLocale:vi.fn(),setTimezone:vi.fn(),restoreDrawings:(owner:any,values:any)=>history.reconcile(owner,values)}
    const validate=(values:any[])=>validateDrawingRestore(values,{editable:o=>!o.id.startsWith('alert_')&&o.id!=='host-denied',existing:chart.getOverlays(),ownedIds:new Set(history.getDrawings().map(d=>d.logicalId))})
    drawingBindings.set(chart,{history,validateRestore:(_owner,values)=>validate(values),validateRestoreStep:(before,after)=>validate(before&&after?[before,after]:[after??before!])});return {chart,history,pro}
  }
  it('retains an unprojectable imported object and reports its missing reference explicitly',async()=>{
    const {history,pro}=runtime(),result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const drawing=result.value.drawings[0];drawing.anchors=[{kind:'logical',referenceTimestamp:999,offsetBars:2,period:{multiplier:1,timespan:'day'},value:1},{kind:'market',timestamp:200,value:2}]
    await restoreLayout(pro,result.value)
    expect(history.getDrawings()).toEqual([drawing]);expect(history.getState().projectionErrors?.a).toContain('参考历史尚未加载')
  })
  it('restores the current document and its undo history if configuration application fails',async()=>{
    const {chart,history,pro}=runtime(),result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const original={...result.value.drawings[0],logicalId:'original',overlay:{...result.value.drawings[0].overlay,id:'original'}}
    await history.submit('create','original',original,'programmatic')
    chart.setStyles.mockImplementationOnce(()=>{throw Error('Engine configuration failed')})
    await expect(restoreLayout(pro,result.value)).rejects.toThrow('Engine configuration failed')
    expect(history.getDrawings()).toEqual([original]);expect(history.getState().canUndo).toBe(true)
  })
  it('rejects local/backend logical identity collisions before configuration or history mutation',async()=>{
    const {chart,history,pro}=runtime(),result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    history.reconcile('backend',[{...result.value.drawings[0],owner:'backend',backendId:'server-a'}])
    await expect(restoreLayout(pro,result.value)).rejects.toThrow('与后端标注冲突');expect(chart.setStyles).not.toHaveBeenCalled();expect(history.getDrawings()[0].owner).toBe('backend')
  })
  it.each(['alert_x','host-denied'])('preflights protected %s before resetting configuration or undo history',async id=>{
    const {chart,history,pro}=runtime(),result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const original={...result.value.drawings[0],logicalId:'original',overlay:{...result.value.drawings[0].overlay,id:'original'}}
    await history.submit('create','original',original,'programmatic')
    const host={...original.overlay,id,name:id.startsWith('alert_')?'alertLine':'segment'}
    chart.getOverlays=()=>[host]
    result.value.drawings[0].logicalId=id;result.value.drawings[0].overlay.id=id
    await expect(restoreLayout(pro,result.value)).rejects.toThrow('宿主管理')
    expect(chart.getOverlays()).toEqual([host]);expect(chart.setStyles).not.toHaveBeenCalled();expect(history.getDrawings()).toEqual([original]);expect(history.getState()).toMatchObject({pending:0,canUndo:true})
  })
  it('never rolls an A checkpoint into B when identity changes during asynchronous registration',async()=>{
    const {chart,history,pro}=runtime(),result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    pro.getIndicatorCatalog=()=>builtinIndicatorCatalog
    result.value.indicators=[{name:'MA',placement:'main',paneId:'candle_pane',calcParams:[5],visible:true}]
    let release!:()=>void
    const registration=vi.spyOn(indicatorRegistry,'ensureRegistered').mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve}))
    const pending=restoreLayout(pro,result.value)
    for(let i=0;i<100&&!release;i++)await Promise.resolve()
    expect(release).toBeTypeOf('function')
    pro.getSymbol=()=>({ticker:'B'});history.reset(true)
    const current={...result.value.drawings[0],logicalId:'B-current',overlay:{...result.value.drawings[0].overlay,id:'B-current'}}
    history.reconcile('local',[current]);release()
    await expect(pending).rejects.toMatchObject({name:'AbortError'})
    expect(history.getDrawings()).toEqual([current]);expect(chart.setStyles).not.toHaveBeenCalled();registration.mockRestore()
  })
  it('isolates content submissions and canonical adoption during an asynchronous restore',async()=>{
    const {chart,history,pro}=runtime(),result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const original={...result.value.drawings[0],logicalId:'original',overlay:{...result.value.drawings[0].overlay,id:'original'}}
    await history.submit('create','original',original,'programmatic')
    pro.getIndicatorCatalog=()=>builtinIndicatorCatalog
    result.value.indicators=[{name:'MA',placement:'main',paneId:'candle_pane',calcParams:[5],visible:true}]
    let release!:()=>void
    const registration=vi.spyOn(indicatorRegistry,'ensureRegistered').mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve}))
    chart.setStyles.mockImplementationOnce(()=>{throw Error('Configuration failed')})
    const pending=restoreLayout(pro,result.value)
    for(let i=0;i<100&&!release;i++)await Promise.resolve()
    expect(release).toBeTypeOf('function');expect(history.getState().pending).toBe(1)
    await expect(history.submit('delete','original',null,'programmatic')).rejects.toThrow('正在恢复')
    expect(()=>history.reconcile('backend',[])).toThrow('正在恢复')
    release();await expect(pending).rejects.toThrow('Configuration failed')
    expect(history.getDrawings()).toEqual([original]);expect(history.getState()).toMatchObject({pending:0,canUndo:true});registration.mockRestore()
  })
  it('rolls back a shared binding if adoption or a later operation fails',async()=>{
    const {chart,history,pro}=runtime(),result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const original={...result.value.drawings[0],logicalId:'original',overlay:{...result.value.drawings[0].overlay,id:'original'}};await history.submit('create','original',original,'programmatic')
    let binding='original';const live=drawingBindings.get(chart)!
    live.prepareSharedReferences=async()=>({validateLocal:()=>{},release:()=>{},apply:()=>{binding='new';throw Error('after adoption')},rollback:()=>{binding='original'}})
    const identity={namespace:'host',symbol:{market:'equity',exchange:'X',ticker:'A.X',priceCurrency:'USD'},priceBasisKey:'raw'}
    await expect(restoreLayout(pro,{...result.value,sharedDrawingRefs:[{namespace:'host',documentId:'new',logicalId:'shared',identity}]})).rejects.toThrow('after adoption')
    expect(binding).toBe('original');expect(history.getDrawing('original')).toEqual(original);expect(history.getState().canUndo).toBe(true)
  })
  it('rolls back the document and undo stack when permission alone changes after a layout yield',async()=>{
    const {chart,history,pro}=runtime(),result=migrateLayoutToV4(legacy);if(result.status!=='ok')throw Error('migration failed')
    const original={...result.value.drawings[0],logicalId:'original',overlay:{...result.value.drawings[0].overlay,id:'original'}}
    await history.submit('create','original',original,'programmatic')
    const values=Array.from({length:128},(_,index)=>({...result.value.drawings[0],logicalId:`next-${index}`,overlay:{...result.value.drawings[0].overlay,id:`next-${index}`}}))
    const binding=drawingBindings.get(chart)!,validate=binding.validateRestoreStep;let allowed=true,checked=0
    binding.validateRestoreStep=(before,after)=>{if(!allowed)throw Error('Permission revoked');validate(before,after);if(after){checked++;queueMicrotask(()=>{allowed=false})}}
    let elapsed=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>elapsed+=40)
    try{await expect(restoreLayout(pro,{...result.value,drawings:values})).rejects.toThrow('Permission revoked')}
    finally{clock.mockRestore()}
    expect(checked).toBe(1);expect(history.getDrawings()).toEqual([original]);expect(history.getState()).toMatchObject({pending:0,canUndo:true});expect(pro.getSymbol()).toEqual({ticker:'A'})
    await history.undo();expect(history.getDrawings()).toEqual([])
  })

})
