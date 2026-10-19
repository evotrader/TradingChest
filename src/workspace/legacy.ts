import {loadLayoutV4} from '../persistence/v4'
import type {Period,SymbolInfo} from '../types'
import {isWorkspaceDocument,migrateWorkspaceDocument} from './document'
import {WorkspaceStoreError} from './store'
import type {WorkspaceDocument} from './types'

/** Read only. Neither detection nor import overwrites/deletes the original keys. */
export function readLegacyWorkspace(scope:string,options:{symbols:SymbolInfo[];fallback:{symbol:SymbolInfo;period:Period};storage?:Pick<Storage,'getItem'>}):WorkspaceDocument|null {
  try{
    const storage=options.storage??localStorage
    const raw=storage.getItem(`trading-chest-workspace-v1-${scope}`)
    if(raw!==null){try{return migrateWorkspaceDocument(JSON.parse(raw))}catch(error){throw new WorkspaceStoreError('WORKSPACE_INVALID_DOCUMENT',error instanceof Error?error.message:'旧工作台已损坏，原件已保留')}}
    const result=loadLayoutV4(scope,storage as Storage)
    if(result.status==='missing')return null
    if(result.status==='error')throw new WorkspaceStoreError('WORKSPACE_INVALID_DOCUMENT',result.message)
    const layout=result.value,symbol=layout.context?.ticker?options.symbols.find(s=>s.ticker===layout.context!.ticker):options.fallback.symbol
    if(!symbol)throw new WorkspaceStoreError('WORKSPACE_INVALID_DOCUMENT','旧布局标的不在当前目录，原件已保留')
    const saved=layout.context?.period,period=saved?{...saved,text:`${saved.multiplier} ${saved.timespan}`}:options.fallback.period
    const doc:WorkspaceDocument={version:2,sharedDrawings:[],layout:1,activeCellId:'primary',sync:{symbol:false,period:false,crosshair:false,viewport:false},columnRatio:50,rowRatio:50,cells:[{cellId:'primary',context:scope,symbol:{...symbol},period:{...period},chart:{...layout,context:{...layout.context,ticker:symbol.ticker,period:{multiplier:period.multiplier,timespan:period.timespan}}}}]}
    if(!isWorkspaceDocument(doc))throw new WorkspaceStoreError('WORKSPACE_INVALID_DOCUMENT','旧布局无法导入，原件已保留')
    return doc
  }catch(error){if(error instanceof WorkspaceStoreError)throw error;throw new WorkspaceStoreError('WORKSPACE_STORE_UNAVAILABLE',error instanceof Error?error.message:'旧布局读取失败')}
}
