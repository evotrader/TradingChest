import type {Chart} from 'klinecharts'
import {WorkspaceReplayError} from '../replay/types'

/** KLineCharts 10.1 has no public draw-completion action. Keep its scheduler seam isolated. */
interface PaintChart {getChartStore():{_calcFlushScheduled:boolean;_pendingCalcIndicators:Map<unknown,unknown>;_taskScheduler:{_running:boolean;_holdingTasks:unknown}};_layoutPending:boolean}
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
