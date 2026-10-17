import {isChartLayoutV3} from '../persistence/v3'
import {jsonSafe} from '../persistence/v2'
import type {WorkspaceDocument,WorkspaceSync} from './types'
const ids=['primary','secondary-1','secondary-2','secondary-3']
const emptySync=():WorkspaceSync=>({symbol:false,period:false,crosshair:false,viewport:false})
export function isWorkspaceDocument(value:unknown):value is WorkspaceDocument {
  if(!value||typeof value!=='object'||!jsonSafe(value))return false
  const d=value as WorkspaceDocument
  return d.version===1&&[1,2,4].includes(d.layout)&&Array.isArray(d.cells)&&d.cells.length===d.layout
    &&d.cells.every((c,i)=>c.cellId===ids[i]&&typeof c.context==='string'&&typeof c.symbol?.ticker==='string'&&!!c.symbol.ticker
      &&typeof c.period?.timespan==='string'&&Number.isInteger(c.period.multiplier)&&c.period.multiplier>0&&isChartLayoutV3(c.chart)
      &&c.chart.context?.ticker===c.symbol.ticker&&c.chart.context?.period?.multiplier===c.period.multiplier&&c.chart.context?.period?.timespan===c.period.timespan)
    &&d.cells.some(c=>c.cellId===d.activeCellId)&&!!d.sync&&Object.keys(emptySync()).every(k=>typeof d.sync[k as keyof WorkspaceSync]==='boolean')
    &&[d.columnRatio,d.rowRatio].every(n=>Number.isFinite(n)&&n>=25&&n<=75)
}
