import type {Chart} from 'klinecharts'

const key=Symbol.for('trading-chest.identity-epoch')
type IdentityChart=Chart&{[key]?:()=>number}
/** Read the owning loader's epoch across independently bundled public entries. */
export function bindIdentityEpoch(chart:Chart,read?:()=>number):void {
  if(read)Object.defineProperty(chart,key,{value:read,configurable:true})
  else delete (chart as IdentityChart)[key]
}
export function getIdentityEpoch(chart:Chart):number|undefined {return (chart as IdentityChart)[key]?.()}
