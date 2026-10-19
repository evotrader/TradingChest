import type {Point} from 'klinecharts'
export type DrawingMagnetMode='normal'|'weak_magnet'|'strong_magnet'
export interface DrawingSnapCandidate {value:number;label:string;source:'ohlc'|'indicator'}
export function snappedPoint(point:Partial<Point>,y:number,candidates:DrawingSnapCandidate[],mode:DrawingMagnetMode,toPixel:(value:number)=>number,tolerance=8):{point:Partial<Point>;candidate?:DrawingSnapCandidate}{
  if(mode==='normal')return {point:{...point}}
  let nearest:DrawingSnapCandidate|undefined,distance=Infinity
  for(const candidate of candidates){if(!Number.isFinite(candidate.value))continue;const pixel=toPixel(candidate.value),next=Math.abs(pixel-y);if(Number.isFinite(pixel)&&next<distance){nearest=candidate;distance=next}}
  if(!nearest||mode==='weak_magnet'&&distance>tolerance)return {point:{...point}}
  return {point:{...point,value:nearest.value},candidate:{...nearest}}
}
