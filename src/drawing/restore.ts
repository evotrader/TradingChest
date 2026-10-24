import type {OverlaySnapshot} from '../types'
import type {DrawingSnapshot} from './types'

/** Content restoration never acquires a second writer for a shared canonical ID. */
export function assertDrawingRestoreAuthority(values:DrawingSnapshot[],sharedIds:Iterable<string>):void {
  const ids=new Set(sharedIds)
  for(const value of values)if(ids.has(value.logicalId))throw Error(`绘图 ${value.logicalId} 已由共享文档拥有，不能恢复为本图内容；请使用作用域转移`)
}

/** Imported IDs never confer permission to replace an existing host projection. */
export function validateDrawingRestore(values:DrawingSnapshot[],options:{editable:(overlay:OverlaySnapshot)=>boolean;existing:OverlaySnapshot[];ownedIds:Set<string>}):void {
  const inventory=new Map(options.existing.map(value=>[value.id,value]))
  for(const value of values){
    if(!options.editable(value.overlay))throw Error(`绘图 ${value.logicalId} 由宿主管理，不能恢复或覆盖`)
    const existing=inventory.get(value.logicalId)
    if(existing&&(!options.ownedIds.has(value.logicalId)||!options.editable(existing)))throw Error(`绘图 ${value.logicalId} 与宿主覆盖物冲突，当前对象已保留`)
  }
}
