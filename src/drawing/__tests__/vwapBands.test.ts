import {describe,it,expect,vi} from 'vitest'
import type {KLineData} from 'klinecharts'
import {VwapIndex,type VwapPriceSource} from '../analytics'
import {VwapBandIndex,vwapBandOptions,vwapBands} from '../vwapBands'
import {DrawingAnalyticsRuntime} from '../analyticsRuntime'
import {builtinDrawingCatalog,validateDrawingParameters} from '../catalog'
import oracle from './fixtures/vwap-bands-oracle.json'
import type {DrawingSnapshot} from '../types'
const finite=(value:number)=>expect(Number.isFinite(value)).toBe(true)
const near=(actual:number,expected:number,relative=2e-13)=>{finite(actual);finite(expected);expect(Math.abs(actual-expected)).toBeLessThanOrEqual(Math.max(1e-300,Math.abs(expected)*relative))}
const flat=(timestamp:number,close:number,volume=1):KLineData=>({timestamp,open:close,high:close,low:close,close,volume})
const drawing=(parameters:DrawingSnapshot['parameters']={}):DrawingSnapshot=>({logicalId:'a',owner:'local',anchors:[{kind:'market',timestamp:1,value:10}],parameters,overlay:{id:'a',name:'anchoredVwap',points:[{timestamp:1,value:10}],groupId:'drawing_tools',visible:true,lock:false,styles:null,extendData:null}})
const context=(contentRevision=1)=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute' as const,text:'1m'},confirmed:true,epoch:1,revision:1,contentRevision,replay:false})
describe('VWAP population bands around the unchanged public center',()=>{
 for(const sample of oracle.cases)it(`matches independent Decimal oracle: ${sample.name}`,()=>{
  const bars=sample.bars,index=new VwapIndex(sample.source as VwapPriceSource),moments=new VwapBandIndex(sample.source as VwapPriceSource);index.update(bars);moments.update(bars)
  const center=index.at(bars,0,bars.length-1).value!,sigma=moments.deviation(bars,0,bars.length-1,center)
  expect(center).toBe(sample.center);near(sigma,sample.deviation,2e-13)
  const bands=vwapBands(center,vwapBandOptions({bandMode:'standard-deviation'}),()=>sigma)!
  expect(bands.reason).toBeUndefined();expect(bands.values).toHaveLength(3)
  for(const value of bands.values){finite(value.lower);finite(value.upper);expect(value.lower).toBe(center-sigma*value.multiplier);expect(value.upper).toBe(center+sigma*value.multiplier)}
 })
 it('retains tiny deviations and highly unequal but representable weights',()=>{
  for(const [prices,weights,expected] of [[[-1e-150,1e-150],[1,1],1e-150],[[0,1e150],[1e-300,1],1]] as Array<[number[],number[],number]>){
   const bars=prices.map((price,i)=>flat(i+1,price,weights[i])),moments=new VwapBandIndex('close'),index=new VwapIndex('close');moments.update(bars);index.update(bars)
   near(moments.deviation(bars,0,1,index.at(bars,0,1).value!),expected)
  }
 })
 for(const sample of oracle.precisionCases)it(`reports insufficient precision instead of false bands: ${sample.name}`,()=>{
  const runtime=new DrawingAnalyticsRuntime();runtime.sync(context(),sample.bars)
  const state=runtime.read(drawing({source:'close',bandMode:'standard-deviation',bandMultipliers:[1]})).state
  finite(sample.deviation);expect(sample.deviation).toBeGreaterThan(0);expect(state.summary?.vwap).toBe(sample.center);expect(state.status).toBe('ready')
  expect(state.bands?.reason).toContain('精度不足');expect(state.bands?.values).toEqual([])
 })
 it('uses absolute percentage width for negative and zero prices and does no moment work when off',()=>{
  const compute=vi.fn(()=>{throw Error('must not run')})
  expect(vwapBands(10,vwapBandOptions({}),compute)).toBeUndefined();expect(compute).not.toHaveBeenCalled()
  expect(vwapBands(-100,vwapBandOptions({bandMode:'percentage',bandMultipliers:[2]}),compute)?.values).toEqual([{multiplier:2,lower:-102,upper:-98}])
  expect(vwapBands(0,vwapBandOptions({bandMode:'percentage'}),compute)?.values.every(value=>value.lower===0&&value.upper===0)).toBe(true);expect(compute).not.toHaveBeenCalled()
 })
 it('replaces the same bar from its preceding checkpoint, appends once, and repairs bad samples',()=>{
  const runtime=new DrawingAnalyticsRuntime(),object=drawing({source:'close',bandMode:'standard-deviation',bandMultipliers:[1]})
  const bars=[flat(1,10),flat(2,20)];runtime.sync(context(),bars)
  expect(runtime.read(object).state.bands?.values).toEqual([{multiplier:1,lower:10,upper:20}])
  bars[1]=flat(2,30,3);runtime.sync({...context(2),contentChange:'tail'},bars)
  const current=runtime.read(object).state;expect(current.summary).toMatchObject({vwap:25,volume:4});near(current.bands!.values[0].upper,25+Math.sqrt(75))
  bars.push(flat(3,20,2));runtime.sync({...context(3),contentChange:'tail'},bars)
  expect(runtime.read(object).state.summary).toMatchObject({vwap:140/6,volume:6})
  bars[2].volume=undefined;runtime.sync({...context(4),contentChange:'tail'},bars);expect(runtime.read(object).state.status).toBe('unavailable')
  bars[2].volume=2;runtime.sync({...context(5),contentChange:'tail'},bars);expect(runtime.read(object).state.bands?.reason).toBeUndefined()
  const fresh=new DrawingAnalyticsRuntime();fresh.sync(context(),bars);expect(runtime.read(object).state.bands).toEqual(fresh.read(object).state.bands)
 })
 it('keeps zero prefixes unavailable, rebuilds pagination, isolates periods and handles replay backwards',()=>{
  const a=new DrawingAnalyticsRuntime(),b=new DrawingAnalyticsRuntime(),object=drawing({bandMode:'standard-deviation'}),data=[flat(1,10,0),flat(2,20,2),flat(3,30,4)]
  a.sync(context(),data);b.sync({...context(),period:{multiplier:5,timespan:'minute',text:'5m'}},[flat(1,100,2)])
  expect(a.read(object).band?.(0)?.reason).toBeDefined();expect(a.read(object).band?.(1)?.values[0]).toMatchObject({lower:20,upper:20})
  expect(b.read(object).state.summary?.vwap).toBe(100)
  a.sync({...context(2),replay:true,cutoff:2},data.slice(0,2));expect(a.read(object).state.bands?.values.every(value=>value.lower===20&&value.upper===20)).toBe(true)
  a.sync({...context(3),contentChange:'replace'},[flat(0,0,5),...data]);expect(a.read({...object,anchors:[{kind:'market',timestamp:0,value:0}]}).state.summary?.volume).toBe(11)
 })
 it('reuses moments when multipliers change and skips all accumulation for disabled or percentage bands',()=>{
  const deviation=vi.spyOn(VwapBandIndex.prototype,'deviation'),runtime=new DrawingAnalyticsRuntime(),bars=[flat(1,10),flat(2,20)]
  runtime.sync(context(),bars);runtime.read(drawing());runtime.read(drawing({bandMode:'percentage'}));expect(deviation).not.toHaveBeenCalled()
  const first=runtime.read(drawing({bandMode:'standard-deviation'}));expect(first.state.bands?.values).toHaveLength(3)
  const count=deviation.mock.calls.length;runtime.read(drawing({bandMode:'standard-deviation',bandFill:false,bandOpacity:.5}));expect(deviation).toHaveBeenCalledTimes(count)
  runtime.read(drawing({bandMode:'standard-deviation',bandMultipliers:[.5]}));expect(deviation.mock.calls.length).toBe(count+1)
  deviation.mockRestore()
 })
 it('retains a finite center when boundaries overflow or moment precision cannot represent weights',()=>{
  const overflow=vwapBands(1e308,vwapBandOptions({bandMode:'percentage',bandMultipliers:[100]}))!;expect(overflow.values).toEqual([]);expect(overflow.reason).toContain('溢出')
  const runtime=new DrawingAnalyticsRuntime();runtime.sync(context(),[flat(1,0,1e308),flat(2,1e308,1e-308)])
  const state=runtime.read(drawing({bandMode:'standard-deviation'})).state;expect(state.status).toBe('ready');finite(state.summary!.vwap!);expect(state.bands?.values).toEqual([]);expect(state.bands?.reason).toBeDefined()
 })
 it('validates all new parameter domains while allowing old definitions and six/eight digit colors',()=>{
  const vwap=builtinDrawingCatalog.find(tool=>tool.toolId==='anchoredVwap')!,profile=builtinDrawingCatalog.find(tool=>tool.toolId==='fixedRangeVolumeProfile')!
  for(const parameters of [{bandMultipliers:[]},{bandMultipliers:[1,1]},{bandMultipliers:[1,2,3,4]},{bandMode:'standard-deviation',bandMultipliers:[11]},{bandMode:'percentage',bandMultipliers:[101]},{bandOpacity:NaN},{bandFill:1},{bandAlgorithm:'future'}])expect(()=>validateDrawingParameters(vwap,parameters)).toThrow()
  expect(()=>validateDrawingParameters(vwap,{})).not.toThrow();expect(()=>validateDrawingParameters(profile,{})).not.toThrow()
  for(const color of ['#ffffff','#ffffff80','transparent'])expect(()=>validateDrawingParameters(profile,{pocColor:color})).not.toThrow()
  for(const parameters of [{pocColor:'red'},{pocColor:'#fff'},{profileWidth:0},{profileSide:'center'},{pocWidth:5},{vahStyle:'dots'}])expect(()=>validateDrawingParameters(profile,parameters)).toThrow()
 })
 it('retains the identical FRVP math result for every display-only combination',()=>{
  const runtime=new DrawingAnalyticsRuntime();runtime.sync(context(),[flat(1,10,2),flat(2,20,3)])
  const object={...drawing(),anchors:[{kind:'market' as const,timestamp:1,value:10},{kind:'market' as const,timestamp:2,value:20}],overlay:{...drawing().overlay,name:'fixedRangeVolumeProfile'}}
  const initial=runtime.read(object)
  for(const side of ['left','right'])for(const extent of ['profile','range','pane-right'])for(const width of [.05,.3,1])expect(runtime.read({...object,parameters:{profileSide:side,profileWidth:width,levelExtent:extent,showPoc:false,pocColor:'#f44336'}})).toBe(initial)
 })
})
