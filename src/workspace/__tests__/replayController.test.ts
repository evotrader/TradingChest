import {afterEach,describe,expect,it,vi} from 'vitest'
import type {ChartPro} from '../../types'
import {WorkspaceReplayController} from '../replayController'
import {registerReplayParticipant,type ReplayParticipant,type ReplayTransaction} from '../replayParticipant'
import type {ReplayWindow} from '../../replay/history'
import {replayAbortable} from '../../replay/history'
const identity={source:'test',ticker:'A',market:'test',exchange:'X',currency:'USD',multiplier:1,timespan:'minute',adjustment:'none',sessionFilter:'all',timezone:'UTC'}
const windows=(times:number[]):ReplayWindow=>({bars:times.map((at,index)=>({timestamp:index,open:1,high:1,low:1,close:1})),clocks:times.map((at,index)=>({timestamp:index,completedAt:at})),visibleAt:times,availabilityAssumed:true,identity,basis:'raw',historyKind:'current-history',metadata:{state:times.length?'ready':'empty'},coverage:{from:10,to:100,warmupBars:0}})
const cleanups:Array<()=>void>=[]
afterEach(()=>{cleanups.splice(0).forEach(fn=>fn());vi.useRealTimers()})
function setup(times:number[][]=[[10,20,20,40],[15,35]]){
 const log:string[]=[],cells=times.map((_,i)=>({cellId:`c${i}`,chart:{} as ChartPro})),states=times.map(()=>({mode:'live',cursor:99,claimed:false})),faults=new Map<string,string>(),holds=new Map<string,Promise<void>>()
 let work:WorkspaceReplayController
 const participants:ReplayParticipant[]=cells.map((cell,index)=>{
  const id=cell.cellId,s=states[index],window=windows(times[index])
  const transaction=(live:boolean):ReplayTransaction=>{
   const before={...s};log.push(`begin:${id}`)
   return {apply:async(cursor,_incremental,signal)=>{log.push(`apply:${id}`);s.mode=live?'live':'replay';s.cursor=live?99:cursor;const hold=holds.get(`${id}:apply`);if(hold)await replayAbortable(hold,signal);if(faults.get(id)===(live?'resume':'apply'))throw Error(`${id} failed`);signal.throwIfAborted()},rollback:async()=>{log.push(`rollback:${id}`);if(faults.get(id)==='rollback')throw Error('rollback failed');Object.assign(s,before)},seal:()=>log.push(`seal:${id}`),publish:()=>{log.push(`publish:${id}`);expect(states.every(state=>state.mode===s.mode&&state.cursor===s.cursor)).toBe(true)}}
  }
  return {claim:()=>{s.claimed=true},release:()=>{s.claimed=false},prepare:vi.fn(async(_query,context)=>{const hold=holds.get(`${id}:prepare`);if(hold)await replayAbortable(hold,context.signal);if(faults.get(id)==='prepare')throw Error(`${id} prepare failed`);return {window,availabilityAssumed:window.availabilityAssumed,record:{identity,basis:'raw',comparisons:[]},release:vi.fn(),assertCurrent:()=>{if(faults.get(id)==='stale')throw Error('revision changed')},begin:()=>transaction(false)}}),prepareLive:vi.fn(async signal=>{signal.throwIfAborted();if(faults.get(id)==='prepare-live')throw Error('resume read failed');return {assertCurrent:()=>{},begin:()=>transaction(true),release:()=>{}}}),summary:()=>({timestamp:s.cursor,barCount:s.mode==='live'?9:1}),events:()=>[],navigate:()=>({status:'unavailable',requestedTimestamp:0,ticker:'A',period:{multiplier:1,timespan:'minute',text:'1m'}}),selectEvent:()=>{},restoreLiveComparisons:async()=>{}}
 })
 cells.forEach((cell,i)=>cleanups.push(registerReplayParticipant(cell.chart,participants[i])))
 work=new WorkspaceReplayController({cells:()=>cells,active:()=>cells[0].cellId});cleanups.push(()=>work.dispose())
 return {work,states,faults,holds,log,participants,start:()=>work.start({from:10,to:100})}
}
describe('workspace clock and atomic protocol',()=>{
 it('uses the driver visible times, batches equal times, retains arbitrary cutoffs and never reads during steps',async()=>{
  const s=setup();await s.start();expect(s.work.getState()).toMatchObject({cursor:10,driverCellId:'c0',availabilityAssumed:true})
  await s.work.step('forward');expect(s.work.getState().cursor).toBe(20);await s.work.step('forward');expect(s.work.getState().cursor).toBe(40)
  await s.work.seek(29);expect(s.work.getState().cursor).toBe(29);await s.work.step('backward');expect(s.work.getState().cursor).toBe(20);await s.work.step('backward');expect(s.work.getState().cursor).toBe(10)
  s.work.driver('c1');await s.work.step('forward');expect(s.work.getState().cursor).toBe(15)
  for(const p of s.participants)expect(p.prepare).toHaveBeenCalledOnce()
  await s.work.stop();expect(s.states.every(v=>v.mode==='live'&&!v.claimed)).toBe(true);expect(s.work.getRecord()).toMatchObject({mode:'live',cursor:15})
 })
 it('permits empty followers and rejects an empty driver before applying',async()=>{
  const s=setup([[20,40],[]]);await s.start();expect(s.work.getState().phase).toBe('paused');expect(()=>s.work.driver('c1')).toThrow('没有可推进');await s.work.stop();await expect(s.work.start({from:10,to:100,driverCellId:'c1'})).rejects.toMatchObject({code:'EMPTY_DRIVER'});expect(s.states.every(v=>v.mode==='live')).toBe(true)
 })
 it.each([0,1,3])('rolls back all applied cells when entry cell %i fails and publishes no success',async index=>{
  const s=setup([[20],[20],[20],[20]]);s.faults.set(`c${index}`,'apply');await expect(s.start()).rejects.toThrow('failed');expect(s.states.every(v=>v.mode==='live'&&!v.claimed)).toBe(true);expect(s.work.getState().mode).toBe('live');expect(s.log.filter(v=>v.startsWith('publish'))).toEqual([])
 })
 it.each(['prepare','stale'])('keeps live unchanged on %s failure',async fault=>{
  const s=setup();s.faults.set('c1',fault);await expect(s.start()).rejects.toThrow();expect(s.log).toEqual([]);expect(s.states.every(v=>v.mode==='live'&&!v.claimed)).toBe(true)
 })
 it.each(['apply','resume','prepare-live'])('retains the last committed cursor on %s failure and can retry',async fault=>{
  const s=setup();await s.start();s.faults.set('c1',fault)
  await expect(fault==='apply'?s.work.seek(35):s.work.stop()).rejects.toThrow();expect(s.work.getState()).toMatchObject({mode:'replay',phase:'paused',cursor:10});expect(s.states.every(v=>v.mode==='replay'&&v.cursor===10)).toBe(true)
  s.faults.clear();await s.work.stop();expect(s.work.getState()).toMatchObject({mode:'live',phase:'idle'})
 })
 it('keeps an explicit error after failed rollback, including failed recovery, then retries from real live preparation',async()=>{
  const s=setup();await s.start();s.faults.set('c0','rollback');s.faults.set('c1','apply');await expect(s.work.seek(40)).rejects.toThrow();expect(s.work.getState().phase).toBe('error');expect(()=>s.work.play()).toThrow();s.faults.set('c1','prepare-live');await expect(s.work.stop()).rejects.toThrow();expect(s.work.getState().phase).toBe('error');s.faults.clear();await s.work.stop();expect(s.work.getState().mode).toBe('live')
 })
 it('cancels sibling preparations immediately after one source fails',async()=>{
  const s=setup();s.faults.set('c0','prepare');s.holds.set('c1:prepare',new Promise(()=>{}));await expect(s.start()).rejects.toMatchObject({cellId:'c0'});expect(s.states.every(v=>!v.claimed)).toBe(true)
 })
 it('cancels an ignored read on stop and does not adopt its late value',async()=>{
  const s=setup();let resolve!:()=>void;s.holds.set('c1:prepare',new Promise(r=>resolve=r));const start=s.start();const rejected=expect(start).rejects.toMatchObject({name:'AbortError'});await vi.waitFor(()=>expect(s.participants[1].prepare).toHaveBeenCalled());await s.work.stop();await rejected;resolve();await Promise.resolve();expect(s.states.every(v=>v.mode==='live'&&!v.claimed)).toBe(true)
 })
 it('keeps only the newest seek and waits for old rollback before applying it',async()=>{
  const s=setup();await s.start();s.holds.set('c0:apply',new Promise(()=>{}));const first=s.work.seek(25),rejected=expect(first).rejects.toMatchObject({name:'AbortError'});await vi.waitFor(()=>expect(s.states[0].cursor).toBe(25));s.holds.clear();const second=s.work.seek(35);await rejected;await second;expect(s.work.getState().cursor).toBe(35);expect(s.states.every(v=>v.cursor===35)).toBe(true)
 })
 it('isolates state copies and throwing or reentrant subscribers',async()=>{
  const s=setup();let rejected:Promise<unknown>|undefined;s.work.subscribe(state=>{state.cells.length=0;if(state.phase==='loading')rejected=s.start().catch(e=>e);throw Error('host callback')});await s.start();expect(await rejected).toMatchObject({code:'BUSY'});const state=s.work.getState();state.cells.length=0;expect(s.work.getState().cells).toHaveLength(2)
 })
 it('has one scheduler, awaits each application, and pause during an in-flight step stays paused',async()=>{
  vi.useFakeTimers();const s=setup();await s.start();s.work.play();s.work.play();expect(vi.getTimerCount()).toBe(1)
  let resolve!:()=>void;s.holds.set('c0:apply',new Promise(r=>resolve=r));await vi.advanceTimersByTimeAsync(1000);expect(s.states[0].cursor).toBe(20);expect(s.states[1].cursor).toBe(10);expect(vi.getTimerCount()).toBe(0);s.work.pause();resolve();await vi.advanceTimersByTimeAsync(0);expect(s.work.getState().phase).toBe('paused');expect(vi.getTimerCount()).toBe(0)
 })
 it('preserves record notes and bookmark ids when resuming and drops no live state on failure',async()=>{
  const s=setup();await s.start();s.work.editRecord(record=>{record.notes='研究';record.bookmarks=[{id:'stable',timestamp:20,title:'A',note:'B'}]});await s.work.stop();const before=s.work.getRecord();s.faults.set('c1','prepare');await expect(s.work.resume()).rejects.toThrow();expect(s.work.getRecord()).toEqual(before);s.faults.clear();await s.work.resume();expect(s.work.getRecord()).toMatchObject({mode:'paused',notes:'研究',bookmarks:[{id:'stable'}]})
 })
 it('rejects out-of-range and invalid controls without changing the cursor',async()=>{
  const s=setup();await s.start();for(const target of [9,100,NaN,Infinity,20.2])await expect(s.work.seek(target)).rejects.toMatchObject({code:'OUT_OF_RANGE'});expect(()=>s.work.speed(3 as never)).toThrow();expect(s.work.getState().cursor).toBe(10)
 })
 it('disposes during reading and releases ownership without a live reload',async()=>{
  const s=setup();s.holds.set('c0:prepare',new Promise(()=>{}));const task=s.start(),rejected=expect(task).rejects.toMatchObject({name:'AbortError'});await vi.waitFor(()=>expect(s.participants[0].prepare).toHaveBeenCalled());s.work.dispose();await rejected;expect(s.participants[0].prepareLive).not.toHaveBeenCalled();expect(s.states.every(v=>!v.claimed)).toBe(true)
 })
})
