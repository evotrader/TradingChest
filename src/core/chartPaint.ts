import type {Chart,KLineData} from 'klinecharts'
import {WorkspaceReplayError} from '../replay/types'
import {replayAbortable} from '../replay/history'

/** KLineCharts 10.1 has no public draw-completion action. Keep its scheduler seam isolated. */
interface PaintChart {getChartStore():{_calcFlushScheduled:boolean;_pendingCalcIndicators:Map<unknown,unknown>;_taskScheduler:{_running:boolean;_holdingTasks:unknown}};_layoutPending:boolean}
type CalculationIndicator={id:string;name:string;result:unknown;calc:(bars:KLineData[],indicator:CalculationIndicator)=>unknown;calcImp:(bars:KLineData[])=>Promise<boolean>}
/** Own only this chart's calc seam while a workspace owns replay. Never patch a global prototype. */
export function guardReplayCalculations(chart:Chart){
  const store=(chart as unknown as {getChartStore():{_calcIndicator:(data:CalculationIndicator|CalculationIndicator[])=>void}}).getChartStore?.()
  if(typeof store?._calcIndicator!=='function')throw new WorkspaceReplayError('UNSUPPORTED','当前引擎不能确认复盘指标计算')
  const original=store._calcIndicator,descriptor=Object.getOwnPropertyDescriptor(store,'_calcIndicator')
  const indicators=new Map<CalculationIndicator,{descriptor?:PropertyDescriptor;controller?:AbortController;sequence:number}>(),failures=new Map<CalculationIndicator,unknown>()
  let generation=new AbortController(),disposed=false
  const release=(indicator:CalculationIndicator)=>{const entry=indicators.get(indicator);if(!entry)return;entry.controller?.abort();if(entry.descriptor)Object.defineProperty(indicator,'calcImp',entry.descriptor);else delete (indicator as Partial<CalculationIndicator>).calcImp;indicators.delete(indicator);failures.delete(indicator)}
  const wrap=(indicator:CalculationIndicator)=>{
    if(indicators.has(indicator))return
    if(typeof indicator.calcImp!=='function'||typeof indicator.calc!=='function')throw new WorkspaceReplayError('UNSUPPORTED','当前指标不支持复盘计算确认')
    const entry={descriptor:Object.getOwnPropertyDescriptor(indicator,'calcImp'),controller:undefined as AbortController|undefined,sequence:0};indicators.set(indicator,entry)
    indicator.calcImp=async function(bars){
      entry.controller?.abort();const controller=new AbortController(),sequence=++entry.sequence,signal=AbortSignal.any([controller.signal,generation.signal]);entry.controller=controller
      const current=()=>!disposed&&!signal.aborted&&entry.sequence===sequence
      try{
        const result=await replayAbortable(Promise.resolve(this.calc(bars,this)),signal)
        if(!current())return false
        this.result=result;failures.delete(indicator);return true
      }catch(error){if(current())failures.set(indicator,error);return false}
      finally{if(entry.controller===controller)entry.controller=undefined}
    }
  }
  const install=(data:CalculationIndicator|CalculationIndicator[])=>{for(const indicator of Array.isArray(data)?data:[data])wrap(indicator)}
  try{install(chart.getIndicators() as unknown as CalculationIndicator[])}catch(error){for(const indicator of indicators.keys())release(indicator);throw error}
  store._calcIndicator=function(data){install(data);original.call(this,data)}
  return {
    reset:()=>{generation.abort();generation=new AbortController();failures.clear()},
    settle:async(signal:AbortSignal)=>{
      await waitChartPaint(chart,signal)
      const current=new Set(chart.getIndicators() as unknown as CalculationIndicator[])
      for(const indicator of indicators.keys())if(!current.has(indicator))release(indicator)
      for(const [indicator,cause] of failures)if(current.has(indicator))throw new WorkspaceReplayError('RESTORE_FAILED',`指标 ${indicator.name} 计算失败：${cause instanceof Error?cause.message:String(cause)}`,{cause})
    },
    dispose:()=>{if(disposed)return;disposed=true;generation.abort();if(descriptor)Object.defineProperty(store,'_calcIndicator',descriptor);else delete (store as Partial<typeof store>)._calcIndicator;for(const indicator of indicators.keys())release(indicator)}
  }
}
export const replayFrame=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  let id:number
  const cancel=()=>{cancelAnimationFrame(id);signal.removeEventListener('abort',cancel);reject(new DOMException('绘制等待已取消','AbortError'))}
  if(signal.aborted){reject(new DOMException('绘制等待已取消','AbortError'));return}
  signal.addEventListener('abort',cancel,{once:true})
  id=requestAnimationFrame(()=>{signal.removeEventListener('abort',cancel);resolve()})
})
export async function waitChartPaint(chart:Chart,signal:AbortSignal):Promise<void> {
  const target=chart as unknown as PaintChart,store=target.getChartStore?.()
  if(!store?._taskScheduler||!(store._pendingCalcIndicators instanceof Map))throw new WorkspaceReplayError('UNSUPPORTED','当前图表引擎不支持确认复盘绘制完成')
  const pending=()=>store._calcFlushScheduled||store._pendingCalcIndicators.size>0||store._taskScheduler._running||!!store._taskScheduler._holdingTasks||target._layoutPending
  const timeout=AbortSignal.any([signal,AbortSignal.timeout(30000)])
  // A calc completion queues layout and canvas RAFs. Observe quiescence across that paint boundary.
  do {await replayFrame(timeout);if(pending())continue;await replayFrame(timeout)}while(pending())
}
