import type {OverlaySnapshot} from '../types'
import type {DrawingSnapshot} from './types'

/** Imported IDs never confer permission to replace an existing host projection. */
export function validateDrawingRestore(values:DrawingSnapshot[],options:{editable:(overlay:OverlaySnapshot)=>boolean;existing:OverlaySnapshot[];ownedIds:Set<string>}):void {
  for(const value of values){
    if(!options.editable(value.overlay))throw Error(`绘图 ${value.logicalId} 由宿主管理，不能恢复或覆盖`)
    const existing=options.existing.find(o=>o.id===value.logicalId)
    if(existing&&(!options.ownedIds.has(value.logicalId)||!options.editable(existing)))throw Error(`绘图 ${value.logicalId} 与宿主覆盖物冲突，当前对象已保留`)
  }
}
