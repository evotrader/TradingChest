import {expect,it,vi} from 'vitest'
import type {Chart,Indicator,KLineData} from 'klinecharts'
import {DrawingSnapResults} from '../snapResults'

const deferred=()=>{let resolve!:(value:any[])=>void,reject!:(error:unknown)=>void;const promise=new Promise<any[]>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function setup(){
 let key:string|undefined='1:1'
 const indicator={calc:vi.fn(()=>[{value:12}]),result:[],calcParams:[2]} as unknown as Indicator
 const chart={getIndicators:()=>[indicator],createIndicator:vi.fn(()=>indicator.id),overrideIndicator:vi.fn((value:any)=>{if(value.calc)indicator.calc=value.calc;return true})} as unknown as Chart
 const create=chart.createIndicator,override=chart.overrideIndicator,calc=indicator.calc,reader=new DrawingSnapResults(chart,()=>key)
 const run=async()=>{try{indicator.result=await indicator.calc([] as KLineData[],indicator);return true}catch{return false}}
 return {indicator,chart,reader,run,create,override,calc,key:(value:string|undefined)=>key=value}
}
it('accepts only the actual native publication for the current confirmed content',async()=>{
 const s=setup();expect(s.reader.getCurrent(s.indicator)).toBeUndefined();const raw=s.indicator.calc([],s.indicator);expect(Array.isArray(raw)).toBe(true);expect(s.reader.getCurrent(s.indicator)).toBeUndefined();s.indicator.result=await raw;expect(s.reader.getCurrent(s.indicator)).toBe(s.indicator.result)
 s.key('1:2');expect(s.reader.getCurrent(s.indicator)).toBeUndefined();await s.run();expect(s.reader.getCurrent(s.indicator)).toBe(s.indicator.result);s.key(undefined);expect(s.reader.getCurrent(s.indicator)).toBeUndefined();s.reader.dispose()
})
it('excludes equal-length stale results during same-bar and parameter recalculation',async()=>{
 const s=setup();await s.run();const old=s.indicator.result,job=deferred();s.chart.overrideIndicator({id:s.indicator.id,calc:()=>job.promise});const pending=s.run();expect(s.indicator.result).toBe(old);expect(s.reader.getCurrent(s.indicator)).toBeUndefined();job.resolve([{value:22}]);await pending;expect(s.reader.getCurrent(s.indicator)).toEqual([{value:22}]);s.reader.dispose()
})
it('does not accept a late old calculation overwriting the current native array or failed calculations',async()=>{
 const s=setup(),jobs=[deferred(),deferred()];let index=0;s.chart.overrideIndicator({id:s.indicator.id,calc:()=>jobs[index++].promise});const old=s.run(),latest=s.run();jobs[1].resolve([{value:22}]);await latest;expect(s.reader.getCurrent(s.indicator)).toEqual([{value:22}]);jobs[0].resolve([{value:12}]);await old;expect(s.indicator.result).toEqual([{value:12}]);expect(s.reader.getCurrent(s.indicator)).toBeUndefined()
 const failure=deferred();s.chart.overrideIndicator({id:s.indicator.id,calc:()=>failure.promise});const pending=s.run();failure.reject(Error('计算失败'));expect(await pending).toBe(false);expect(s.reader.getCurrent(s.indicator)).toBeUndefined();s.reader.dispose()
})
it.each(['latest-first','old-first'])('tracks overlapping calculations reusing one result array: %s',async order=>{
 const s=setup(),jobs=[deferred(),deferred(),deferred()],shared:{value:number}[]=[];let index=0
 s.chart.overrideIndicator({id:s.indicator.id,calc:()=>jobs[index++].promise})
 const old=s.run();s.key('1:2');const latest=s.run()
 const finish=(job:number,value:number)=>{shared.splice(0,shared.length,{value});jobs[job].resolve(shared)}
 if(order==='latest-first'){
  finish(1,22);await latest;expect(s.reader.getCurrent(s.indicator)).toBe(shared)
  finish(0,12);await old;expect(s.indicator.result).toEqual([{value:12}]);expect(s.reader.getCurrent(s.indicator)).toBeUndefined()
 }else{
  finish(0,12);await old;expect(s.reader.getCurrent(s.indicator)).toBeUndefined()
  finish(1,22);await latest;expect(s.reader.getCurrent(s.indicator)).toEqual([{value:22}])
 }
 const recovered=s.run();finish(2,32);await recovered;expect(s.reader.getCurrent(s.indicator)).toBe(shared);expect(shared).toEqual([{value:32}]);s.reader.dispose()
})
it('invalidates an aliased result when an old failed calculation mutates it',async()=>{
 const s=setup(),jobs=[deferred(),deferred(),deferred()],shared:{value:number}[]=[];let index=0
 s.chart.overrideIndicator({id:s.indicator.id,calc:()=>jobs[index++].promise})
 const old=s.run(),latest=s.run();shared.push({value:22});jobs[1].resolve(shared);await latest;expect(s.reader.getCurrent(s.indicator)).toBe(shared)
 shared[0].value=12;jobs[0].reject(Error('Old calculation failed'));expect(await old).toBe(false);expect(s.indicator.result).toEqual([{value:12}]);expect(s.reader.getCurrent(s.indicator)).toBeUndefined()
 const recovered=s.run();shared[0].value=32;jobs[2].resolve(shared);await recovered;expect(s.reader.getCurrent(s.indicator)).toEqual([{value:32}]);s.reader.dispose()
})
it('observes a replaced native calculator and releases methods and results on disposal',async()=>{
 const s=setup(),calc=vi.fn(function(this:unknown){expect(this).toBe(s.indicator);return [{value:30}]});s.chart.overrideIndicator({id:s.indicator.id,calc});await s.run();expect(s.reader.getCurrent(s.indicator)).toEqual([{value:30}]);s.reader.dispose();expect(s.chart.createIndicator).toBe(s.create);expect(s.chart.overrideIndicator).toBe(s.override);expect(s.indicator.calc).toBe(calc);expect(s.reader.getCurrent(s.indicator)).toBeUndefined()
})
