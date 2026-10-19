import type {Chart} from 'klinecharts'
import type {DrawingHistory} from './history'
import type {DrawingSnapshot,DrawingOwner} from './types'

/** Instance-local restore transactions; no global document or secondary writer. */
export const drawingBindings=new WeakMap<Chart,{history:DrawingHistory;validateRestore:(owner:DrawingOwner,values:DrawingSnapshot[])=>void}>()
