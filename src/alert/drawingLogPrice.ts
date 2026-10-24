import Decimal from 'decimal.js'

// Keep host Decimal settings out of the evaluator's numeric contract.
const Price=Decimal.clone({defaults:true,precision:50,rounding:Decimal.ROUND_HALF_EVEN})

/** Resolve machine-rounding ambiguity, without treating neighbouring prices as equal. */
export function drawingLogPrice(a:number,b:number,offset:number,span:number,observed:number):number {
  const u=offset/span,left=(1-u)*Math.log(a),right=u*Math.log(b),level=left+right
  const approximate=Math.exp(level)
  // This bound only chooses a more precise calculation. It never decides that
  // two prices are equal, and never adds a price/tick-size tolerance.
  const roundingBound=16*Number.EPSILON*(1+Math.abs(left)+Math.abs(right))
  if(Number.isFinite(approximate)&&approximate>0&&Math.abs(Math.log(observed)-level)>roundingBound)return approximate
  return new Price(a).times(new Price(b).div(a).pow(new Price(offset).div(span))).toNumber()
}
