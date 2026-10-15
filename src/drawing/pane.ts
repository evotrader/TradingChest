import type {Chart} from 'klinecharts'
export interface DrawingPaneIndicator {id?:string;name:string;calcParams:unknown[]}
const key=(indicators:DrawingPaneIndicator[],ids=false)=>JSON.stringify(indicators.map(i=>JSON.stringify(ids?i.id:[i.name,i.calcParams])).sort())
/** Keep an explicit pane when present; otherwise require a unique indicator identity. */
export function resolveDrawingPane(chart:Chart,preferred:string|undefined,identity:DrawingPaneIndicator[]):string|undefined {
  if(!preferred||preferred==='candle_pane')return preferred
  if(chart.getPaneOptions(preferred))return preferred
  if(!identity.length)throw Error('标注副图不存在且缺少指标身份，请恢复对应副图后刷新标注')
  const indicators=chart.getIndicators(),panes=[...new Set(indicators.map(i=>i.paneId))].filter(id=>id!=='candle_pane')
  const find=(ids:boolean)=>panes.filter(pane=>key(indicators.filter(i=>i.paneId===pane),ids)===key(identity,ids))
  const byId=identity.every(i=>i.id)?find(true):[]
  const candidates=byId.length?byId:find(false)
  if(candidates.length!==1)throw Error(candidates.length?'标注副图有多个匹配，请恢复明确副图后刷新标注':'标注副图没有匹配指标，请恢复对应副图后刷新标注')
  return candidates[0]
}
