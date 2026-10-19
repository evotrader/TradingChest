import type { ChartPro, Period, SymbolInfo } from '../types'
import type { ChartLayoutV4 } from '../persistence/v4'

export type WorkspaceLayout = 1 | 2 | 4
export type WorkspaceSync = Record<'symbol'|'period'|'crosshair'|'viewport', boolean>
export interface WorkspaceCell { cellId:string; symbol:SymbolInfo; period:Period; context:string }
export interface WorkspaceBinding {
  ready:Promise<ChartPro>
  dispose:()=>void
  subscribeReady?:(accept:(chart:ChartPro)=>void)=>()=>void
  captureOptions?:()=>{localDrawingIds?:string[];annotationRefs?:string[]}
}
export interface WorkspaceDocument {
  version:2
  sharedDrawings:import('../drawing/document').SharedDrawingDocument[]
  layout:WorkspaceLayout
  activeCellId:string
  sync:WorkspaceSync
  columnRatio:number
  rowRatio:number
  cells:Array<WorkspaceCell & {chart:ChartLayoutV4}>
}
export interface ChartWorkspaceOptions {
  container:HTMLElement
  locale?:string
  theme?:string
  /** Defaults to 100%; the containing element must provide a definite height. */
  height?:number|'100%'
  toolbar?:{layout?:boolean;sync?:boolean;storage?:boolean;size?:boolean}
  context:string
  symbols:SymbolInfo[]
  initialSymbol:SymbolInfo
  initialPeriod?:Period
  getPeriods:(symbol:SymbolInfo,signal:AbortSignal)=>Promise<Period[]>
  mountCell:(container:HTMLElement,cell:WorkspaceCell,signal:AbortSignal)=>WorkspaceBinding
  store?:import('./store').WorkspaceStore
  onActiveCell?:(cell:WorkspaceCell)=>void
  /** Presentation notification; chart state and active-cell authority stay unchanged. */
  onLayoutChange?:(layout:WorkspaceLayout)=>void
  onError?:(error:Error)=>void
}
