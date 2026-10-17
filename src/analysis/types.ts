import type {Period,SymbolInfo} from '../types'
export interface AnalysisContext {token:string;symbol:SymbolInfo;period:Period;basis?:string}
export interface AnalysisPoint {timestamp:number;value:number|null;availableAt?:number}
export interface AnalysisBandPoint {timestamp:number;lower:number|null;upper:number|null;availableAt?:number}
export interface AnalysisLabelPoint {id:string;label:string;value:number|null;availableAt?:number}
export interface AnalysisEvent<T=unknown> {id:string;timestamp:number;endTimestamp?:number;availableAt?:number;label:string;data?:T}
interface Base {id:string;label:string;visible?:boolean;color?:string;unit?:string}
type SeriesPresentation = {placement:'main'|'sub'} & ({valueType:'price';dataBasis:string|null}|{valueType:'scalar'|'percent'|'amount'})
export type AnalysisLayerSpec =
  | Base & SeriesPresentation & {type:'line'|'histogram';data:AnalysisPoint[]}
  | Base & SeriesPresentation & {type:'band';data:AnalysisBandPoint[]}
  | Base & {type:'events';data:AnalysisEvent[]}
  | Base & {type:'label-series';data:AnalysisLabelPoint[]}
export type AnalysisLayerState = {id:string;label:string;type:AnalysisLayerSpec['type'];visible:boolean;status:'ready'|'hidden'|'empty'|'unaligned'|'error';unalignedCount:number;reason?:string}
export type AnalysisLayerHandle<S extends AnalysisLayerSpec=AnalysisLayerSpec>={id:string;replaceData:(data:S['data'])=>void;setVisible:(visible:boolean)=>void;dispose:()=>void}
export interface AnalysisOptions {
  analysisLayerListVisible?:boolean
  onAnalysisLayerChange?:(state:AnalysisLayerState)=>void
  onAnalysisEventClick?:(event:{layerId:string;event:AnalysisEvent;timestamp:number})=>void
  onAnalysisPointSelect?:(event:{layerId:string;point:AnalysisLabelPoint})=>void
}
