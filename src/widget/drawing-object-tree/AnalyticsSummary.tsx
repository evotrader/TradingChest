import {For,Show,type Component} from 'solid-js'
import type {DrawingAnalyticsState} from '../../drawing/analytics'

const AnalyticsSummary:Component<{state:DrawingAnalyticsState;locale:string}>=props=>{
  const en=()=>props.locale==='en-US',t=(zh:string,english:string)=>en()?english:zh
  const number=(value:number|undefined)=>value===undefined?'—':value.toLocaleString(en()?'en-US':'zh-CN',{maximumSignificantDigits:12})
  return <div class="tc-volume-summary" role="status" aria-label={t('量价分析结果','Volume analysis result')}>
    <strong>{t('当前周期 OHLCV 估算','Current-interval OHLCV estimate')} · {props.state.period?.text||(props.state.period?`${props.state.period.multiplier} ${props.state.period.timespan}`:t('周期尚未确认','Interval not confirmed'))}</strong>
    <span>{t('仅按已加载数据估算，覆盖未声明','Uses loaded bars only; coverage is not established')}</span>
    <span>{t('起点','Start')}: {new Date(props.state.requestedRange.from).toISOString()}<Show when={props.state.requestedRange.to!==undefined}> — {new Date(props.state.requestedRange.to!).toISOString()}</Show></span>
    <Show when={props.state.actualRange}><span>{t('实际参与','Actual samples')}: {new Date(props.state.actualRange!.from).toISOString()} — {new Date(props.state.actualRange!.to).toISOString()} · {props.state.count} {t('根','bars')}</span></Show>
    <Show when={props.state.boundarySampled}><span>{t('边界按当前周期时标采样；未拆分 K 线','Boundaries use current-interval timestamps; candles are not split')}</span></Show>
    <Show when={props.state.summary}>{summary=><span>
      <Show when={summary().vwap!==undefined}>VWAP {number(summary().vwap)} · {summary().source} · </Show>
      {t('成交量','Volume')} {number(summary().volume)} ({t('数据源成交量单位','provider volume units')})
      <Show when={summary().poc!==undefined}> · POC {number(summary().poc)} · VAH {number(summary().vah)} · VAL {number(summary().val)} · VA {number((summary().valueArea??0)*100)}% · {summary().rows} {t('行','rows')}</Show>
    </span>}</Show>
    <Show when={props.state.bands}>{bands=><span>{bands().mode==='percentage'?t('百分比带','Percentage bands'):t('成交量加权总体标准差带','Volume-weighted population deviation bands')}<For each={bands().values}>{value=><span> · {value.multiplier}{bands().mode==='percentage'?'%':'σ'}: {number(value.lower)} — {number(value.upper)}</span>}</For><Show when={bands().reason}><strong>{t('带不可用','Bands unavailable')}: {bands().reason}</strong></Show></span>}</Show>
    <Show when={props.state.replayPartial}><strong>{t('回放区间尚未完整','Replay interval is not complete')}</strong></Show>
    <Show when={props.state.reason}><span data-analytics-status={props.state.status}>{props.state.status}: {props.state.reason}</span></Show>
  </div>
}
export default AnalyticsSummary
