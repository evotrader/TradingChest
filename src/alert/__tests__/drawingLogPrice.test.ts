import {describe,it,expect,vi} from 'vitest'

describe('isolated logarithmic reference precision',()=>{
 it('does not inherit host Decimal precision or exponent limits installed before import',async()=>{
  vi.resetModules()
  const {default:Decimal}=await import('decimal.js')
  const previous={precision:Decimal.precision,rounding:Decimal.rounding,minE:Decimal.minE,maxE:Decimal.maxE}
  try{
   Decimal.set({precision:3,rounding:Decimal.ROUND_UP,minE:-2,maxE:2})
   const {drawingLogPrice}=await import('../drawingLogPrice')
   expect(drawingLogPrice(49,81,1,2,63)).toBe(63)
   expect(drawingLogPrice(1e200,9e200,1,2,3e200)).toBe(3e200)
   expect(drawingLogPrice(1e-200,9e-200,1,2,3e-200)).toBe(3e-200)
   expect(Decimal.precision).toBe(3);expect(Decimal.maxE).toBe(2)
  }finally{Decimal.set(previous)}
 })
})
