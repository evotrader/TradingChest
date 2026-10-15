import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLayoutV2, migrateLayoutV1, isChartLayoutV2, type ChartLayoutV2 } from '../v2'
import { loadLayoutV3 } from '../v3'
// Historical fixture writer, never exported by the v10 product.
function saveLayoutV2(key:string,input:Omit<ChartLayoutV2,'version'|'timestamp'>):boolean {
  const data={...input,version:2,timestamp:Date.now()}
  if(!isChartLayoutV2(data))return false
  try{localStorage.setItem('trading-chest-layout-v2-'+key,JSON.stringify(data));return true}catch{return false}
}
const store: Record<string,string> = {}
const storage = {
  getItem: vi.fn((k:string)=>store[k]??null),
  setItem: vi.fn((k:string,v:string)=>{store[k]=v}),
  key: (i:number)=>Object.keys(store)[i]??null,
  get length(){return Object.keys(store).length},
  removeItem:(k:string)=>{delete store[k]}
}
const legacy = () => ({version:1,timestamp:100,theme:'dark',locale:'en',timezone:'Asia/Shanghai',styles:null,mainIndicators:['MA'],subIndicators:['VOL'],overlayData:[{name:'segment',groupId:'user',points:[{timestamp:1,value:10}],lock:false,visible:true,extendData:{text:'note'}}]})
const layout = (): Omit<ChartLayoutV2,'version'|'timestamp'> => ({
  theme:'dark',locale:'en',timezone:'Asia/Shanghai',styles:null,
  indicators:[{name:'MA',placement:'main',calcParams:[5,10],paneId:'candle_pane'},{name:'VOL',placement:'sub',paneId:'volume',visible:true}],
  panes:[{id:'candle_pane',height:400,order:0},{id:'volume',height:100,minHeight:50,order:1}],
  overlayData:[{id:'drawing-1',name:'segment',groupId:'user',points:[{timestamp:1,value:10}],lock:false,visible:true,styles:{line:{color:'#fff',size:2}},extendData:{text:'note'}}],
  context:{ticker:'TEST',market:'stocks',currency:'CNY',period:{multiplier:1,timespan:'minute'},adjustment:'raw',sessionFilter:'regular'}
})
beforeEach(()=>{for(const k of Object.keys(store)) delete store[k];vi.stubGlobal('localStorage',storage);vi.clearAllMocks()})
describe('opt-in non-destructive layout v2',()=>{
  it('round trips parameters, styles, pane geometry and explicit context',()=>{
    const input=layout();expect(saveLayoutV2('a',input)).toBe(true)
    expect(loadLayoutV2('a')).toMatchObject({...input,version:2})
  })
  it('migrates v1 in memory without writing or inventing missing context',()=>{
    const raw=JSON.stringify(legacy());store['trading-chest-layout-a']=raw
    expect(loadLayoutV2('a')).toMatchObject({version:2,timestamp:100,indicators:[{name:'MA',placement:'main'},{name:'VOL',placement:'sub'}],panes:[]})
    expect(loadLayoutV2('a')?.context).toBeUndefined()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(store['trading-chest-layout-a']).toBe(raw)
  })
  it('saves to a new key while preserving v1 for rollback',()=>{
    const raw=JSON.stringify(legacy());store['trading-chest-layout-a']=raw
    expect(saveLayoutV2('a',layout())).toBe(true)
    expect(store['trading-chest-layout-a']).toBe(raw)
    expect(loadLayoutV3('a')).toMatchObject({status:'ok',value:{version:3}})
    expect(store['trading-chest-layout-a']).toBe(raw)
  })
  it('prefers v2 and does not resurrect stale v1 when v2 is corrupt',()=>{
    store['trading-chest-layout-a']=JSON.stringify(legacy())
    store['trading-chest-layout-v2-a']='broken'
    expect(loadLayoutV2('a')).toBeNull()
  })
  it.each([null,{}, {version:1}, {...legacy(), mainIndicators:'MA'}, {...legacy(), overlayData:[{}]}])('rejects malformed legacy state',value=>{
    expect(migrateLayoutV1(value)).toBeNull()
  })
  it('rejects functions, runtime objects, cycles and credential fields without writes',()=>{
    for (const bad of [()=>{},new Date(),{apiKey:'fixture-not-a-real-key'},{callback:()=>{}}]) {
      const input=layout();input.overlayData[0].extendData=bad as never
      expect(saveLayoutV2('bad',input)).toBe(false)
    }
    const cyclic: Record<string,unknown>={};cyclic.self=cyclic
    const input=layout();input.styles=cyclic as never
    expect(saveLayoutV2('bad',input)).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it('rejects nonfinite numeric state and duplicated pane ids',()=>{
    const input=layout();input.panes[0].height=NaN
    expect(saveLayoutV2('bad',input)).toBe(false)
    input.panes=[{id:'same'},{id:'same'}]
    expect(saveLayoutV2('bad',input)).toBe(false)
  })
  it('does not mutate the source during migration',()=>{
    const source=legacy();const result=migrateLayoutV1(source)!
    result.overlayData[0].points[0].value=999
    expect(source.overlayData[0].points[0].value).toBe(10)
  })
  it('handles unavailable or full storage without destroying the old value',()=>{
    const raw=JSON.stringify(legacy());store['trading-chest-layout-a']=raw
    storage.setItem.mockImplementationOnce(()=>{throw Error('quota')})
    expect(saveLayoutV2('a',layout())).toBe(false)
    expect(store['trading-chest-layout-a']).toBe(raw)
    storage.getItem.mockImplementationOnce(()=>{throw Error('blocked')})
    expect(loadLayoutV2('a')).toBeNull()
  })
  it('rejects unsupported future versions',()=>{
    expect(isChartLayoutV2({...layout(),version:3,timestamp:1})).toBe(false)
  })
})
