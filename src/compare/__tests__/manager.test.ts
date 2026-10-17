import {describe,it,expect,vi} from 'vitest'
vi.mock('klinecharts',()=>({registerIndicator:vi.fn()}))
import type {Chart,KLineData} from 'klinecharts'
import type {HistoryQuery,HistoryResult,HistorySnapshot} from '../../types'
import type {ComparisonDatafeed} from '../types'
import {ComparisonManager} from '../manager'
const bars=(values:number[],start=1)=>values.map((close,i)=>({timestamp:start+i,open:close,high:close,low:close,close,volume:1}))
function historyResult(query:HistoryQuery,source:ReturnType<typeof bars>):HistoryResult {
 if(query.kind==='before'){
  const eligible=source.filter(bar=>bar.timestamp<query.before),selected=eligible.slice(-query.countBack)
  return {bars:selected,hasMoreBefore:eligible.length>selected.length}
 }
 return {bars:source.filter(bar=>bar.timestamp>=query.from&&bar.timestamp<query.to)}
}
function setup(instanceId='chart-a'){
 let main=bars([10,20,30]),next=0;const indicators=new Map<string,any>(),axis=new Map();
 const chart={getDataList:()=>main,getVisibleRange:()=>({from:1,to:3}),getIndicators:(filter?:{id?:string})=>filter?.id?[indicators.get(filter.id)].filter(Boolean):[...indicators.values()],createYAxis:vi.fn(value=>{axis.set(value.id,value);return value.id}),removeYAxis:vi.fn(({id})=>axis.delete(id)),createIndicator:vi.fn(value=>{const id=value.id??`indicator-${++next}`;indicators.set(id,{...value,id});return id}),overrideIndicator:vi.fn(value=>indicators.set(value.id,{...indicators.get(value.id),...value})),removeIndicator:vi.fn(({id})=>indicators.delete(id))} as unknown as Chart;
 const manager=new ComparisonManager({chart:()=>chart,symbol:()=>({ticker:'MAIN.X'}),period:()=>({multiplier:1,timespan:'minute',text:'1m'}),instanceId});
 return {manager,chart,indicators,axis,setMain:(v:KLineData[])=>main=v};
}
function feed(initial=bars([100,200,300])){
 let snapshot!:(value:HistorySnapshot)=>void,error!:(reason:unknown)=>void;const value:ComparisonDatafeed={searchSymbols:async()=>[],getHistoryKLineData:vi.fn(async(_s,_p,query:HistoryQuery)=>historyResult(query,initial)),subscribe:vi.fn(),subscribeSnapshots:vi.fn((_s,_p,cb,fail)=>{snapshot=cb;error=fail}),unsubscribe:vi.fn(),dispose:vi.fn()};
 return {value,fail:(reason:unknown)=>error(reason),push:(value:HistorySnapshot)=>snapshot(value)};
}
describe('independent comparison ownership',()=>{
 it('keeps one normal return axis and unique generic indicators with exact gaps',async()=>{
  const {manager,indicators,axis}=setup(),a=feed(bars([100,300],2));const h=await manager.add({ticker:'A.X'},a.value);
  expect(manager.getState().baseTimestamp).toBe(2);expect(indicators.size).toBe(2);expect(axis.size).toBe(1);
  const comp=indicators.get(h.indicatorId);expect(comp.name).toBe('COMPARE');expect(comp.extendData.valueAt(2)).toBe(0);expect(comp.extendData.valueAt(3)).toBe(200);expect(new Set([...indicators.values()].map(i=>i.yAxisId)).size).toBe(1);
  manager.dispose();expect(a.value.dispose).toHaveBeenCalledOnce();expect(axis.size).toBe(0);
 })
 it('preserves the accepted group when an added member has no overlap or a zero baseline',async()=>{
  const {manager}=setup(),a=feed();await manager.add({ticker:'A.X'},a.value);const before=manager.getState();const missing=feed(bars([1],20)),zero=feed(bars([0,1,2]));
  await expect(manager.add({ticker:'MISSING.X'},missing.value)).rejects.toThrow('共同实际时标');await expect(manager.add({ticker:'ZERO.X'},zero.value)).rejects.toThrow('零');
  expect(manager.getState().handles).toEqual(before.handles);expect(manager.getState().baseTimestamp).toBe(before.baseTimestamp);expect(missing.value.dispose).toHaveBeenCalledOnce();manager.dispose();
 })
 it('updates same/new bars and revisions without changing the fixed timestamp',async()=>{
  const {manager,indicators,setMain}=setup(),a=feed();const h=await manager.add({ticker:'A.X'},a.value);setMain(bars([10,20,30,40]));manager.mainChanged();a.push({bars:bars([200,220,240,260])});
  expect(manager.getState().baseTimestamp).toBe(1);expect(manager.getState().notice).toContain('基准价格被修订');expect(indicators.get(h.indicatorId).extendData.valueAt(4)).toBeCloseTo(30);
  setMain(bars([5,10,20,30,40],0));manager.mainChanged();expect(manager.getState().baseTimestamp).toBe(1);manager.dispose();
 })
 it('retains known history on incomplete same-basis reads and rejects a partial new adjustment basis',async()=>{
  const {manager,indicators}=setup(),a=feed();const h=await manager.add({ticker:'A.X'},a.value);
  a.push({bars:bars([100,300]).map((bar,index)=>({...bar,timestamp:index?3:1}))});expect(indicators.get(h.indicatorId).extendData.valueAt(2)).toBe(100);
  a.push({bars:bars([200,600]).map((bar,index)=>({...bar,timestamp:index?3:1})),basis:'new-adjustment'});expect(manager.getState().error).toContain('没有覆盖');expect(indicators.get(h.indicatorId).extendData.valueAt(2)).toBe(100);manager.dispose();
 })
 it('keeps one member read error visible while another member updates successfully',async()=>{
  const {manager}=setup(),a=feed(),b=feed();await manager.add({ticker:'A.X'},a.value);await manager.add({ticker:'B.X'},b.value);b.fail(Error('B HTTP 503'));a.push({bars:bars([100,220,300])});expect(manager.getState().error).toContain('B HTTP 503');b.push({bars:bars([100,210,300])});expect(manager.getState().error).toBeUndefined();manager.dispose();
 })
 it('validates the refreshed main base before leaving paused replay',async()=>{
  const {manager,setMain}=setup(),a=feed();await manager.add({ticker:'A.X'},a.value);manager.enterReplay(2);setMain(bars([0,20,30]));expect(()=>manager.leaveReplay()).toThrow('基准缺失或价格无效');expect(manager.getState().replay).toBe(true);setMain(bars([10,20,30]));manager.leaveReplay();expect(manager.getState().replay).toBe(false);manager.dispose();
 })
 it('settles cancellation even if a legacy provider ignores its abort signal',async()=>{
  const {manager}=setup(),a=feed();vi.mocked(a.value.getHistoryKLineData).mockImplementationOnce(()=>new Promise(()=>{}));const pending=manager.add({ticker:'A.X'},a.value);manager.cancel(manager.getState().pending[0].id);await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(a.value.dispose).toHaveBeenCalledOnce();manager.dispose();
 })
 it('isolates identical tickers across chart instances and disposes only the removed provider',async()=>{
  const left=setup('left'),right=setup('right'),a=feed(),b=feed();const x=await left.manager.add({ticker:'A.X'},a.value),y=await right.manager.add({ticker:'A.X'},b.value);
  expect(x.id).not.toBe(y.id);left.manager.remove(x.id);expect(a.value.dispose).toHaveBeenCalledOnce();expect(b.value.dispose).not.toHaveBeenCalled();expect(right.manager.getState().handles).toHaveLength(1);right.manager.dispose();left.manager.dispose();
 })
 it('rejects a shared provider across instances without disposing the accepted owner',async()=>{
  const left=setup('left-owner'),right=setup('right-owner'),a=feed();await left.manager.add({ticker:'A.X'},a.value);await expect(right.manager.add({ticker:'A.X'},a.value)).rejects.toThrow('独立');expect(a.value.dispose).not.toHaveBeenCalled();expect(left.manager.getState().handles).toHaveLength(1);left.manager.dispose();right.manager.dispose();
 })
 it('keeps the confirmed reference explicit if removing a member exposes an invalid earlier base',async()=>{
  const {manager,setMain}=setup();setMain(bars([0,20,30]));const a=await manager.add({ticker:'A.X'},feed(bars([200,300],2)).value);await manager.add({ticker:'B.X'},feed().value);manager.remove(a.id);expect(manager.getState().handles).toHaveLength(1);expect(manager.getState().baseTimestamp).toBe(2);expect(manager.getState().error).toContain('零');expect(manager.getState().notice).toContain('此前已确认');await manager.resetRange();expect(manager.getState().error).toBeUndefined();manager.dispose();
 })
 it('invalidates a pending add on cancellation without a late indicator or double disposal',async()=>{
  const {manager,indicators}=setup(),a=feed();let resolve!:(v:HistoryResult)=>void,query!:HistoryQuery;vi.mocked(a.value.getHistoryKLineData).mockImplementationOnce((_s,_p,value)=>{query=value;return new Promise(done=>resolve=done)});
  const adding=manager.add({ticker:'A.X'},a.value);manager.cancel(manager.getState().pending[0].id);resolve(historyResult(query,bars([100,200,300])));await expect(adding).rejects.toMatchObject({name:'AbortError'});expect(indicators.size).toBe(0);expect(a.value.dispose).toHaveBeenCalledOnce();manager.dispose();
 })
 it('explicitly rebases to the visible window and preserves that anchor for later group changes',async()=>{
  const {manager}=setup(),a=feed();await manager.add({ticker:'A.X'},a.value);await manager.resetRange();expect(manager.getState().baseTimestamp).toBe(2);expect(manager.getState().notice).toContain('显式重设');await manager.add({ticker:'B.X'},feed().value);expect(manager.getState().baseTimestamp).toBe(2);manager.dispose();
 })
 it('does not publish an obsolete restore failure after a context reset',async()=>{
  const {manager}=setup(),a=feed();await manager.add({ticker:'A.X'},a.value);manager.enterReplay(2);vi.mocked(a.value.getHistoryKLineData).mockImplementationOnce(()=>new Promise(()=>{}));const pending=manager.prepareResume();manager.clear();await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(manager.getState().error).toBeUndefined();expect(manager.getState().handles).toEqual([]);manager.dispose();
 })
 it('pauses streams in replay, clips all values, re-reads before resume and rejects stale callbacks',async()=>{
  const {manager,indicators}=setup(),a=feed();const h=await manager.add({ticker:'A.X'},a.value);manager.enterReplay(2);expect(a.value.unsubscribe).toHaveBeenCalledOnce();a.push({bars:bars([900,900,900])});expect(indicators.get(h.indicatorId).extendData.valueAt(2)).toBe(100);manager.seek(1);expect(indicators.get(h.indicatorId).extendData.cutoff).toBe(1);
  vi.mocked(a.value.getHistoryKLineData).mockImplementationOnce(async(_s,_p,query:HistoryQuery)=>historyResult(query,bars([200,220,240])));await manager.prepareResume();expect(indicators.get(h.indicatorId).extendData.valueAt(2)).toBe(100);expect(a.value.subscribeSnapshots).toHaveBeenCalledTimes(1);manager.leaveReplay();expect(indicators.get(h.indicatorId).extendData.valueAt(2)).toBeCloseTo(10);expect(a.value.subscribeSnapshots).toHaveBeenCalledTimes(2);manager.dispose();
 })
 it('keeps failed resume in paused replay and retries without changing the base',async()=>{
  const {manager}=setup(),a=feed();await manager.add({ticker:'A.X'},a.value);manager.enterReplay(2);vi.mocked(a.value.getHistoryKLineData).mockRejectedValueOnce(Error('HTTP 503'));await expect(manager.prepareResume()).rejects.toThrow('503');expect(manager.getState()).toMatchObject({replay:true,baseTimestamp:1,restoring:false});expect(a.value.subscribeSnapshots).toHaveBeenCalledTimes(1);await manager.prepareResume();manager.leaveReplay();manager.dispose();
 })
 it('cancels a pending comparison resume when the replay position changes',async()=>{
  const {manager,indicators}=setup(),a=feed();const handle=await manager.add({ticker:'A.X'},a.value);manager.enterReplay(3);
  let resolve!:(value:HistoryResult)=>void,query!:HistoryQuery;vi.mocked(a.value.getHistoryKLineData).mockImplementationOnce((_s,_p,value)=>{query=value;return new Promise(done=>resolve=done)});
  const restoring=manager.prepareResume();manager.seek(2);resolve(historyResult(query,bars([100,20,30])));await expect(restoring).rejects.toMatchObject({name:'AbortError'});
  expect(manager.getState()).toMatchObject({replay:true,restoring:false,error:undefined});expect(indicators.get(handle.indicatorId).extendData.valueAt(2)).toBe(100);
  await manager.prepareResume();manager.leaveReplay();expect(manager.getState().replay).toBe(false);manager.dispose();
 })
 it('cancels an earlier comparison refresh before accepting a new replay cutoff',async()=>{
  const {manager,indicators}=setup(),a=feed();const handle=await manager.add({ticker:'A.X'},a.value);
  let resolve!:(value:HistoryResult)=>void,query!:HistoryQuery;vi.mocked(a.value.getHistoryKLineData).mockImplementationOnce((_s,_p,value)=>{query=value;return new Promise(done=>resolve=done)});
  const restoring=manager.retry();manager.enterReplay(2);resolve(historyResult(query,bars([100,20,30])));await expect(restoring).rejects.toMatchObject({name:'AbortError'});
  expect(manager.getState()).toMatchObject({replay:true,restoring:false,error:undefined});expect(indicators.get(handle.indicatorId).extendData.valueAt(2)).toBe(100);manager.dispose();
 })
 it('copies provider metadata before a staged replay resume commits',async()=>{
  const {manager}=setup(),a=feed();await manager.add({ticker:'A.X'},a.value);manager.enterReplay(2);
  const metadata={state:'ready' as const,sourceTimestamp:123};vi.mocked(a.value.getHistoryKLineData).mockImplementationOnce(async(_s,_p,query)=>({...historyResult(query,bars([100,200,300])),metadata}));await manager.prepareResume();metadata.sourceTimestamp=NaN;manager.leaveReplay();expect(manager.getState().handles[0].sourceTimestamp).toBe(123);manager.dispose();
 })

})
