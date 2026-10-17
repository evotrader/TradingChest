import type {Chart} from 'klinecharts'
type RuntimeBindings={indicatorIds:Set<string>;paneIds:Set<string>;axisIds:Set<string>}
const bindingKey=Symbol.for('trading-chest.analysis-bindings.v1')
type OwnedChart=Chart&{[bindingKey]?:RuntimeBindings}
/** Ownership belongs to the actual chart, including when root/chart entrypoints are mixed. */
export const runtimeBindings={
  get(chart:Chart):RuntimeBindings|undefined{return (chart as OwnedChart)[bindingKey]},
  set(chart:Chart,bindings:RuntimeBindings):void {Object.defineProperty(chart,bindingKey,{value:bindings,writable:true,configurable:true})},
  delete(chart:Chart):boolean{return delete (chart as OwnedChart)[bindingKey]}
}
