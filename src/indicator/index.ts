import { registerIndicator, getSupportedIndicators } from 'klinecharts'
import { IndicatorRegistry, type IndicatorLoader } from './registry'
import { indicatorLoaders } from './loaders'
import type { IndicatorTemplate } from 'klinecharts'

const registryKey=Symbol.for('trading-chest.indicator-definitions.v1')
const scope=globalThis as typeof globalThis&{[registryKey]?:IndicatorRegistry}
/** Only definitions/loaders are shared across entrypoints; no chart data lives here. */
export const indicatorRegistry=scope[registryKey]??(()=>{
  const registry=new IndicatorRegistry()
  registry.setRegisterFn(registerIndicator)
  registry.setSupportedProvider(getSupportedIndicators)
  registry.setLoaders(indicatorLoaders)
  scope[registryKey]=registry
  return registry
})()
export {indicatorCategories,builtinIndicatorCatalog} from './catalog'
export function registerIndicatorDefinition(name:string,definition:IndicatorTemplate|IndicatorLoader):void {indicatorRegistry.registerDefinition(name,definition)}
