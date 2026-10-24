import type {Chart} from 'klinecharts'
import type {DrawingHistory,DrawingWriteGuard} from './history'
import type {DrawingSnapshot,DrawingOwner} from './types'

export interface DrawingRestoreTarget {axes:Array<{id?:string;default?:boolean;paneId:string;name:string}>}
interface DrawingBinding {
  history:DrawingHistory
  captureSharedReferences?:()=>import('./session').DrawingSharedReference[]
  prepareSharedReferences?:(references:import('./session').DrawingSharedReference[])=>Promise<{validateLocal:(values:DrawingSnapshot[])=>void;apply:()=>void;rollback:()=>void;release:()=>void}>
  validateRestore:(owner:DrawingOwner,values:DrawingSnapshot[],target?:DrawingRestoreTarget)=>void
  validateRestoreStep:DrawingWriteGuard
}
const key=Symbol.for('trading-chest.drawing-binding')
type BoundChart=Chart&{[key]?:DrawingBinding}
/** The owning chart carries its transaction across separately bundled public entries. */
export const drawingBindings={
  get(chart:Chart):DrawingBinding|undefined{return (chart as BoundChart)[key]},
  set(chart:Chart,binding:DrawingBinding):void{Object.defineProperty(chart,key,{value:binding,configurable:true})},
  delete(chart:Chart):void{delete (chart as BoundChart)[key]}
}
