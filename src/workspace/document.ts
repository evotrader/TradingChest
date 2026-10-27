import {migrateLayoutToV4} from '../persistence/v4'
import {chartLayoutV4Shape} from '../persistence/v4Validation'
import {isSharedDrawingDocument} from '../drawing/document'
import {jsonSafe} from '../persistence/v2'
import type {WorkspaceDocument,WorkspaceSync} from './types'
const ids=['primary','secondary-1','secondary-2','secondary-3']
const emptySync=():WorkspaceSync=>({symbol:false,period:false,crosshair:false,viewport:false})
export function isWorkspaceDocument(value:unknown):value is WorkspaceDocument {
  if(!value||typeof value!=='object'||!jsonSafe(value))return false
  const d=value as WorkspaceDocument
  return d.version===2&&Array.isArray(d.sharedDrawings)&&d.sharedDrawings.every(isSharedDrawingDocument)&&new Set(d.sharedDrawings.map(s=>s.key)).size===d.sharedDrawings.length&&[1,2,4].includes(d.layout)&&Array.isArray(d.cells)&&d.cells.length===d.layout
    &&d.cells.every((c,i)=>c.cellId===ids[i]&&typeof c.context==='string'&&typeof c.symbol?.ticker==='string'&&!!c.symbol.ticker
      &&typeof c.period?.timespan==='string'&&Number.isInteger(c.period.multiplier)&&c.period.multiplier>0&&chartLayoutV4Shape(c.chart)
      &&c.chart.context?.ticker===c.symbol.ticker&&c.chart.context?.period?.multiplier===c.period.multiplier&&c.chart.context?.period?.timespan===c.period.timespan)
    &&d.cells.some(c=>c.cellId===d.activeCellId)&&!!d.sync&&Object.keys(emptySync()).every(k=>typeof d.sync[k as keyof WorkspaceSync]==='boolean')
    &&[d.columnRatio,d.rowRatio].every(n=>Number.isFinite(n)&&n>=25&&n<=75)
}
/** Pure in-memory upgrade. The caller writes only after an explicit save. */
export function migrateWorkspaceDocument(value:unknown):WorkspaceDocument {
  if(isWorkspaceDocument(value))return structuredClone(value)
  if(!value||typeof value!=='object'||(value as any).version!==1||!Array.isArray((value as any).cells))throw Error('旧工作台已损坏，原件已保留')
  const old=value as any
  const cells=old.cells.map((cell:any)=>{
    if(!cell||typeof cell!=='object')throw Error('旧工作台窗格已损坏，原件已保留')
    const migrated=migrateLayoutToV4(cell.chart,{period:cell.period})
    if(migrated.status!=='ok')throw Error(migrated.status==='error'?migrated.message:'旧布局不存在')
    return {...cell,chart:migrated.value}
  })
  const migrated={...structuredClone(old),version:2,sharedDrawings:[],cells}
  if(!isWorkspaceDocument(migrated))throw Error('旧工作台无法迁移，原件已保留')
  return migrated
}
