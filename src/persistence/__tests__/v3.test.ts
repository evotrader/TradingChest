import {describe,it,expect,beforeEach,vi} from 'vitest'
vi.mock('klinecharts',()=>({getSupportedIndicators:()=>['MA'],registerIndicator:vi.fn()}))
import {isChartLayoutV3,migrateLayoutToV3,saveLayoutV3,loadLayoutV3,listLayoutsV3,deleteLayoutV3,restoreLayout,type ChartLayoutV3} from '../v3'
import {builtinIndicatorCatalog} from '../../indicator/catalog'
import type {ChartPro} from '../../types'
const values=new Map<string,string>()
const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k),key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size}} as Storage
const old={version:2,timestamp:1,theme:'dark',locale:'zh-CN',timezone:'UTC',styles:{yAxis:{type:'log',reverse:true},indicator:{tooltip:{icons:[{id:'settings',icon:'s',fontFamily:'icons',position:'middle'}]}}},indicators:[],panes:[],overlayData:[]}
beforeEach(()=>values.clear())
describe('v3 layouts and read-only migration',()=>{
 it('rejects duplicate indicator IDs and malformed nested records without throwing',()=>{
  const indicator={id:'same',name:'MA',placement:'main',paneId:'candle_pane',calcParams:[5],visible:true};
  const valid={...old,version:3,axes:[],panes:[{id:'candle_pane'}],indicators:[indicator]};
  expect(isChartLayoutV3(valid)).toBe(true);
  expect(isChartLayoutV3({...valid,indicators:[indicator,indicator]})).toBe(false);
  expect(isChartLayoutV3({...valid,indicators:[null]})).toBe(false);
  expect(isChartLayoutV3({...valid,panes:[null]})).toBe(false);
 })
 it('rejects an unsupported indicator before changing the existing drawing or layout',async()=>{
  const resetDrawingHistory=vi.fn(),removeIndicator=vi.fn(),chart={removeIndicator};
  const pro={getIndicatorCatalog:()=>builtinIndicatorCatalog,getChart:()=>chart,getSymbol:()=>({ticker:'A'}),getPeriod:()=>({multiplier:1,timespan:'day',text:'1d'}),getDrawingHistoryState:()=>({pending:0,uncertainLogicalIds:[]}),retryData:async()=>{},resetDrawingHistory} as unknown as ChartPro;
  const layout={...old,version:3,axes:[],panes:[{id:'candle_pane'}],indicators:[{name:'UNAVAILABLE',placement:'main',paneId:'candle_pane',calcParams:[],visible:true}]} as unknown as ChartLayoutV3;
  await expect(restoreLayout(pro,layout)).rejects.toThrow('不在当前目录');expect(resetDrawingHistory).not.toHaveBeenCalled();expect(removeIndicator).not.toHaveBeenCalled();
 })
 it('does not treat a null engine creation result as a restored indicator',async()=>{
  const restoreDrawings=vi.fn(),chart={getIndicators:()=>[],setStyles:vi.fn(),createIndicator:vi.fn(()=>null)};
  const pro={getIndicatorCatalog:()=>builtinIndicatorCatalog,getChart:()=>chart,getSymbol:()=>({ticker:'A'}),getPeriod:()=>({multiplier:1,timespan:'day',text:'1d'}),getDrawingHistoryState:()=>({pending:0,uncertainLogicalIds:[]}),getDrawings:()=>[],retryData:async()=>{},resetDrawingHistory:vi.fn(),setTheme:vi.fn(),setLocale:vi.fn(),setTimezone:vi.fn(),restoreDrawings} as unknown as ChartPro;
  const layout={...old,version:3,axes:[],panes:[{id:'candle_pane'}],indicators:[{name:'MA',placement:'main',paneId:'candle_pane',calcParams:[5],visible:true}]} as unknown as ChartLayoutV3;
  await expect(restoreLayout(pro,layout)).rejects.toThrow('创建结果');expect(restoreDrawings).not.toHaveBeenCalled();
 })
 it('maps the independent axis and tooltip features without changing the old record',()=>{
  const before=JSON.stringify(old),result=migrateLayoutToV3(old)
  expect(result.status).toBe('ok');if(result.status!=='ok')throw Error('migration failed')
  expect(result.value.axes[0]).toMatchObject({name:'logarithm',reverse:true})
  expect((result.value.styles?.indicator as any).tooltip.features[0]).toMatchObject({type:'icon_font',content:{code:'s',family:'icons'}})
  expect(JSON.stringify(old)).toBe(before);expect(isChartLayoutV3(result.value)).toBe(true)
 })
 it('round-trips under a new key and keeps old keys through delete',()=>{
  storage.setItem('trading-chest-layout-v2-default',JSON.stringify(old))
  const migrated=loadLayoutV3('default',storage);expect(values.size).toBe(1)
  if(migrated.status!=='ok')throw Error('migration failed')
  expect(saveLayoutV3('default',migrated.value,storage).status).toBe('ok')
  expect(values.size).toBe(2);expect(listLayoutsV3(storage)).toMatchObject({status:'ok',value:[{key:'default'}]})
  expect(deleteLayoutV3('default',storage).status).toBe('ok');expect(values.size).toBe(1)
 })
 it('does not mask a corrupt newer record with the old one',()=>{
  storage.setItem('trading-chest-layout-v2-default',JSON.stringify(old));storage.setItem('trading-chest-layout-v3-default','{}')
  expect(loadLayoutV3('default',storage)).toMatchObject({status:'error',code:'corrupt'});expect(values.size).toBe(2)
 })
 it('distinguishes absent, unsupported migration, denied reads and failed writes',()=>{
  expect(loadLayoutV3('absent',storage)).toEqual({status:'missing'})
  expect(migrateLayoutToV3({...old,styles:{yAxis:{type:'custom'}}})).toMatchObject({status:'error',code:'migration'})
  expect(loadLayoutV3('a',{getItem:()=>{throw Error('denied')}} as any)).toMatchObject({status:'error',code:'read'})
  const result=migrateLayoutToV3(old);if(result.status!=='ok')throw Error('migration failed')
  expect(saveLayoutV3('a',result.value,{setItem:()=>{throw Error('quota')}} as any)).toMatchObject({status:'error',code:'write'})
 })
})
