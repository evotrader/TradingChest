import Decimal from 'decimal.js'

// Host Decimal settings must not change reference prices.
const Price=Decimal.clone({defaults:true,precision:50,rounding:Decimal.ROUND_HALF_EVEN})

export function preciseLogarithmicPrice(base:number,from:number,to:number,offset:number,span=1):number {
 return new Price(base).times(new Price(to).div(from).pow(new Price(offset).div(span))).toNumber()
}
