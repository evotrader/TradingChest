import {describe,it,expect,vi} from 'vitest'
vi.mock('klinecharts',()=>({registerIndicator:vi.fn()}))
import type {Chart} from 'klinecharts'
import i18n from '../../i18n'
import {AnalysisManager} from '../manager'
import {runtimeBindings} from '../renderers'
import type {ConfirmedSeries} from '../../core/engineDataLoader'
function setup(){
 let bars=[1,2,3,4].map(timestamp=>({timestamp,open:1,close:1,high:1,low:1})),next=0
 const indicators=new Map<string,any>(),axes=new Map<string,any>(),onEvent=vi.fn(),onPoint=vi.fn()
 const chart={getDataList:()=>bars,getIndicators:(f?:{id?:string})=>[...indicators.values()].filter(i=>!f?.id||i.id===f.id),createIndicator:(d:any)=>{const id=`i${++next}`,paneId=d.paneId??`p${next}`,yAxisId=`y${next}`;indicators.set(id,{...d,id,paneId,yAxisId});axes.set(yAxisId,{id:yAxisId,paneId});return id},overrideIndicator:(d:any)=>{indicators.set(d.id,{...indicators.get(d.id),...d})},removeIndicator:({id}:{id:string})=>{axes.delete(indicators.get(id)?.yAxisId);indicators.delete(id)},setPaneOptions:vi.fn()} as unknown as Chart
 Object.assign(chart,{getPaneOptions:(id:string)=>({id,height:100,minHeight:30})})
 const manager=new AnalysisManager({chart:()=>chart,locale:()=> 'zh-CN',onAnalysisEventClick:onEvent,onAnalysisPointSelect:onPoint})
 const state:ConfirmedSeries={symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'},basis:'raw',confirmed:true,epoch:1,revision:1,replay:false}
 manager.sync(state)
 return {manager,chart,state,indicators,axes,onEvent,onPoint,setBars:(b:typeof bars)=>{bars=b}}
}
describe('analysis ownership, source alignment and replay visibility',()=>{
 it('rejects event dates outside the displayable Unix millisecond range before replacing confirmed data',()=>{
  const {manager}=setup(),layer=manager.add(manager.getContext()!,{id:'events',label:'events',type:'events',data:[{id:'valid',label:'source',timestamp:1}]})
  expect(()=>layer.replaceData([{id:'bad',label:'bad',timestamp:1e100}])).toThrow()
  expect(()=>layer.replaceData([{id:'bad-end',label:'bad',timestamp:1,endTimestamp:1e100}])).toThrow()
  expect(manager.views()[0].events).toEqual([{id:'valid',label:'source',timestamp:1}])
 })
 it('requires a current context and its own matching price basis',()=>{
  const {manager,state}=setup(),context=manager.getContext()!
  expect(()=>manager.add(context,{id:'price',label:'p',type:'line',placement:'main',valueType:'price',dataBasis:null,data:[]})).toThrow('一致')
  expect(()=>manager.add(context,{id:'price',label:'p',type:'line',placement:'main',valueType:'price',dataBasis:'adjusted',data:[]})).toThrow('一致')
  manager.add(context,{id:'price',label:'p',type:'line',placement:'main',valueType:'price',dataBasis:'raw',data:[{timestamp:1,value:2}]})
  manager.sync({...state,epoch:2});manager.sync({...state,epoch:3});expect(()=>manager.add(context,{id:'old',label:'old',type:'events',data:[]})).toThrow('失效')
 })
 it('copies snapshots, rejects whole invalid replacements and disposes only its own renderer',()=>{
  const {manager,chart,indicators}=setup(),data=[{timestamp:1,value:-3},{timestamp:3,value:null}],context=manager.getContext()!
  const layer=manager.add(context,{id:'h',label:'负柱',type:'histogram',placement:'sub',valueType:'scalar',data})
  data[0].value=999;expect([...indicators.values()][0].extendData.valueAt(1).value).toBe(-3)
  expect(()=>layer.replaceData([{timestamp:2,value:1},{timestamp:2,value:2}])).toThrow('唯一');expect([...indicators.values()][0].extendData.valueAt(1).value).toBe(-3)
  expect(manager.views()[0].state.status).toBe('error');expect(runtimeBindings.get(chart)?.paneIds.size).toBe(1)
  layer.dispose();layer.dispose();expect(indicators.size).toBe(0);expect(runtimeBindings.get(chart)?.paneIds.size).toBe(0);expect(()=>layer.setVisible(true)).toThrow('释放')
 })
 it('retains unmapped source events instead of snapping and realigns after historical bars arrive',()=>{
  const {manager,state,setBars,indicators}=setup(),context=manager.getContext()!
  manager.add(context,{id:'e',label:'事件',type:'events',data:[{id:'x',label:'缺口',timestamp:1.5},{id:'a',label:'one',timestamp:2},{id:'b',label:'two',timestamp:2}]})
  expect(manager.views()[0].state.unalignedCount).toBe(1);expect([...indicators.values()][0].extendData.events.map((e:any)=>e.id)).toEqual(['a','b'])
  setBars([1,1.5,2,3,4].map(timestamp=>({timestamp,open:1,close:1,high:1,low:1})));manager.sync({...state,revision:2});expect(manager.views()[0].state.unalignedCount).toBe(0)
 })
 it('deep-copies nested event payloads and isolates callback mutations',()=>{
  const {manager,onEvent}=setup(),data=[{id:'nested',label:'source',timestamp:1,data:{nested:{value:3}}}]
  const layer=manager.add(manager.getContext()!,{id:'events',label:'events',type:'events',data})
  data[0].data.nested.value=99;manager.selectEvent('events','nested')
  expect(onEvent.mock.calls[0][0].event.data.nested.value).toBe(3)
  onEvent.mock.calls[0][0].event.data.nested.value=88;manager.selectEvent('events','nested')
  expect(onEvent.mock.calls[1][0].event.data.nested.value).toBe(3)
  layer.replaceData(data);data[0].data.nested.value=77;manager.selectEvent('events','nested')
  expect(onEvent.mock.calls[2][0].event.data.nested.value).toBe(99)
 })
 it('refreshes calculated values after replacement, visibility and replay changes',()=>{
  const {manager,chart,state,indicators}=setup()
  const layer=manager.add(manager.getContext()!,{id:'line',label:'line',type:'line',placement:'sub',valueType:'scalar',data:[{timestamp:1,value:3,availableAt:4}]})
  const values=()=>[...indicators.values()][0].extendData.calculate(chart.getDataList())
  expect(values()[0]).toEqual({value:3})
  layer.replaceData([{timestamp:1,value:7,availableAt:4}]);expect(values()[0]).toEqual({value:7})
  layer.setVisible(false);expect(values()[0]).toEqual({});layer.setVisible(true);expect(values()[0]).toEqual({value:7})
  manager.sync({...state,replay:true,cutoff:2});expect(values()[0]).toEqual({})
  manager.sync(state);expect(values()[0]).toEqual({value:7})
 })
 it('clips availability, interval metadata, lists and callbacks together',()=>{
  const {manager,state,onEvent,indicators}=setup(),context=manager.getContext()!
  const layer=manager.add(context,{id:'e',label:'事件',type:'events',data:[{id:'range',label:'future endpoint 4',timestamp:1,endTimestamp:4,data:{future:4}},{id:'late',label:'late',timestamp:1,availableAt:4},{id:'future',label:'future',timestamp:4}]})
  manager.sync({...state,replay:true,cutoff:2})
  expect(manager.views()[0].events).toEqual([{id:'range',timestamp:1,endTimestamp:2,availableAt:undefined,label:i18n('analysis_ongoing','zh-CN')}])
  manager.selectEvent('e','late');expect(onEvent).not.toHaveBeenCalled();manager.selectEvent('e','range');expect(onEvent.mock.calls[0][0].event).not.toHaveProperty('data')
  layer.replaceData([{id:'new',label:'new',timestamp:3}]);expect([...indicators.values()][0].extendData.events).toEqual([])
  manager.sync({...state,replay:true,cutoff:4});expect(manager.views()[0].events[0].id).toBe('new')
 })
 it('hides all label results when any availability is unknown and preserves null ordinal positions',()=>{
  const {manager,state,onPoint}=setup(),context=manager.getContext()!
  manager.add(context,{id:'l',label:'日期净值',type:'label-series',data:[{id:'1',label:'day1',value:1},{id:'2',label:'day2',value:null},{id:'3',label:'day3',value:1.1}]})
  expect(manager.views()[0].points.map(p=>p.value)).toEqual([1,null,1.1]);manager.sync({...state,replay:true,cutoff:2});expect(manager.views()[0].points).toEqual([]);manager.selectPoint('l','1');expect(onPoint).not.toHaveBeenCalled()
  manager.sync(state);manager.selectPoint('l','3');expect(onPoint.mock.calls[0][0].point.value).toBe(1.1)
 })
 it('keeps tokens through ordinary revisions but releases layers after confirmed basis changes',()=>{
  const {manager,state,indicators}=setup(),context=manager.getContext()!
  manager.add(context,{id:'l',label:'线',type:'line',placement:'sub',valueType:'scalar',data:[{timestamp:1,value:2}]});manager.sync({...state,revision:2});expect(manager.getContext()?.token).toBe(context.token)
  manager.sync({...state,basis:'adjusted',revision:3});expect(indicators.size).toBe(0);expect(manager.getContext()?.token).not.toBe(context.token)
 })
})
