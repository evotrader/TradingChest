import type {Chart,KLineData} from 'klinecharts'
import type {EngineDataLoader} from '../core/engineDataLoader'
import type {ComparisonManager} from '../compare/manager'
import type {AnalysisManager} from '../analysis/manager'
import type {DrawingAlertRuntime} from '../alert/drawingRuntime'
import type {ChartProOptions} from '../types'
import {WorkspaceReplayError} from '../replay/types'
import {waitChartPaint,guardReplayCalculations} from '../core/chartPaint'
import {locateDataTimestamp} from '../core/locateTimestamp'
import type {ReplayParticipant,ReplayTransaction} from './replayParticipant'

interface Options {
  loader:()=>EngineDataLoader|undefined
  chart:()=>Chart|null
  comparisons:ComparisonManager
  analysis:AnalysisManager
  alerts:()=>DrawingAlertRuntime|undefined
  factory?:ChartProOptions['createComparisonDatafeed']
  assertTransition():void
  legacyActive():boolean
  owner(value:boolean):void
  callbacks():{publish():void;rollback():void}
  active(value:boolean):void
  reset(bar?:KLineData):void
  price(bar:KLineData):void
  signal:AbortSignal
}
export function createReplayParticipant(options:Options):ReplayParticipant {
  let owned=false
  let calculations:ReturnType<typeof guardReplayCalculations>|undefined
  const valid=()=>{options.signal.throwIfAborted();const loader=options.loader(),chart=options.chart();if(!loader||!chart)throw new WorkspaceReplayError('BUSY','图表尚未就绪');return {loader,chart}}
  const begin=(live:boolean,apply:(loader:ReturnType<EngineDataLoader['beginWorkspaceUpdate']>,compare:ReturnType<ComparisonManager['beginWorkspaceUpdate']>,cursor:number,incremental:boolean)=>Promise<void>|void,onSeal?:()=>void):ReplayTransaction=>{
    const {loader,chart}=valid(),wasReplay=loader.getDataState()?.replay??false;options.assertTransition()
    calculations?.reset()
    const callbacks=options.callbacks(),analysis=options.analysis.beginTransaction(),alerts=options.alerts()?.beginTransaction(),data=loader.beginWorkspaceUpdate(),compare=options.comparisons.beginWorkspaceUpdate()
    let sealed=false,published=false
    return {
      apply:async(cursor,incremental,signal)=>{signal.throwIfAborted();await apply(data,compare,cursor,incremental);signal.throwIfAborted()},
      seal:()=>{data.seal();compare.seal();options.active(!live);sealed=true},
      finalize:async signal=>{await data.publish();compare.publish();await calculations!.settle(AbortSignal.any([signal,options.signal]))},
      publish:()=>{if(!sealed)return;published=true;onSeal?.();alerts?.publish();callbacks.publish()},
      rollback:async()=>{
        if(published)return
        calculations?.reset()
        const failures:unknown[]=[]
        for(const rollback of [()=>data.rollback(),()=>compare.rollback(),()=>analysis.rollback(),()=>alerts?.rollback(),()=>calculations!.settle(options.signal)])try{await rollback()}catch(error){failures.push(error)}
        options.active(wasReplay);callbacks.rollback();if(failures.length)throw new AggregateError(failures,'图表复盘回滚未完成')
      }
    }
  }
  return {
    claim:()=>{const {chart}=valid();options.assertTransition();if(owned||options.legacyActive())throw new WorkspaceReplayError('REPLAY_OWNED','图表已有回放正在使用');calculations=guardReplayCalculations(chart);owned=true;options.owner(true);options.comparisons.lockWorkspace(true)},
    release:()=>{calculations?.dispose();calculations=undefined;owned=false;options.owner(false);options.comparisons.lockWorkspace(false)},
    prepare:async(query,context,record)=>{
      const {loader,chart}=valid(),version=loader.workspaceVersion()
      // Calculations started before claim used the engine's original unguarded method.
      await waitChartPaint(chart,AbortSignal.any([context.signal,options.signal]))
      const window=await loader.readWorkspaceHistory(query,context,record)
      const compare=await options.comparisons.prepareWorkspace(query,context,record?.comparisons,options.factory)
      const assertCurrent=()=>{valid();context.signal.throwIfAborted();if(loader.workspaceVersion()!==version)throw new WorkspaceReplayError('BUSY','准备期间行情已改变，请重试');compare.assertCurrent()}
      try{assertCurrent()}catch(error){compare.release();throw error}
      return {window,record:{identity:{...window.identity},basis:window.basis,comparisons:compare.records},assertCurrent,release:compare.release,
        begin:()=>begin(false,async(data,comparisons,cursor,incremental)=>{
          comparisons.applyReplay(compare,window,cursor,incremental)
          data.applyReplay(window,{owner:'workspace',from:query.from,to:query.to,cutoff:cursor},incremental,()=>{const last=loader.getConfirmedBars().at(-1);if(last)options.price(last)})
          if(!incremental)options.reset(loader.getConfirmedBars().at(-1))
        },compare.installed)}
    },
    prepareLive:async signal=>{
      const {loader}=valid(),version=loader.workspaceVersion(),result=await loader.prepareWorkspaceLive(signal),compare=await options.comparisons.prepareWorkspaceLive(result.bars,signal)
      const assertCurrent=()=>{valid();signal.throwIfAborted();if(loader.workspaceVersion()!==version)throw new WorkspaceReplayError('BUSY','实时恢复准备已过期');compare.assertCurrent()}
      assertCurrent()
      return {assertCurrent,release:()=>{},begin:()=>begin(true,async(data,comparisons)=>{await data.applyLive(result);comparisons.applyLive(compare,result.bars)})}
    },
    summary:()=>{const bars=options.loader()?.getConfirmedBars()??[];return {timestamp:bars.at(-1)?.timestamp,barCount:bars.length}},
    events:()=>options.analysis.views().filter(view=>view.state.type==='events'&&view.state.visible).map(view=>({layerId:view.state.id,label:view.state.label,events:view.events,error:view.state.status==='error'?view.state.reason:undefined})),
    navigate:timestamp=>{const {loader,chart}=valid(),state=loader.getConfirmedSeries()!;const result=locateDataTimestamp(loader.getConfirmedBars(),state.symbol.ticker,state.period,timestamp);if(result.dataIndex!==undefined)chart.scrollToDataIndex(result.dataIndex,0);return result},
    selectEvent:(layerId,eventId)=>options.analysis.selectEvent(layerId,eventId),
    restoreLiveComparisons:async(record,signal)=>{
      if(record.comparisons.length&&!options.factory)throw new WorkspaceReplayError('UNSUPPORTED','宿主没有提供比较行情工厂')
      for(const comparison of record.comparisons){signal.throwIfAborted();await options.comparisons.add(comparison.symbol,options.factory!(comparison.symbol,comparison.period));signal.throwIfAborted()}
    }
  }
}
