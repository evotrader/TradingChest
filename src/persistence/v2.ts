/** Explicit opt-in layout storage. The host remains the sole persistence owner. */
export type LayoutJson = null | boolean | number | string | LayoutJson[] | { [key: string]: LayoutJson }
export interface LayoutIndicator {
  name: string
  placement: 'main' | 'sub'
  paneId?: string
  calcParams?: LayoutJson[]
  visible?: boolean
}
export interface LayoutPane { id: string; height?: number; minHeight?: number; order?: number }
export interface LayoutOverlay {
  id?: string
  paneId?: string
  name: string
  groupId: string
  points: Array<{ timestamp: number; value: number }>
  lock: boolean
  visible: boolean
  styles?: { [key: string]: LayoutJson }
  extendData?: { [key: string]: LayoutJson }
}
export interface ChartLayoutV2 {
  version: 2
  timestamp: number
  theme: string
  locale: string
  timezone: string
  styles: { [key: string]: LayoutJson } | null
  indicators: LayoutIndicator[]
  panes: LayoutPane[]
  overlayData: LayoutOverlay[]
  context?: {
    ticker: string
    market?: string
    exchange?: string
    currency?: string
    period?: { multiplier: number; timespan: string }
    adjustment?: string
    sessionFilter?: string
  }
}
const PREFIX = 'trading-chest-layout-v2-'
const LEGACY_PREFIX = 'trading-chest-layout-'
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const optionalString = (v: unknown) => v === undefined || typeof v === 'string'
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k))
const reservedJsonKey=/^(?:__proto__|prototype|constructor|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credentials)$/i
/** Reject runtime objects/cycles and conventional credential fields, rather than silently stripping them. */
export function jsonSafe(v: unknown, seen = new Set<object>()): boolean {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true
  if (typeof v === 'number') return Number.isFinite(v)
  if (!Array.isArray(v) && !object(v)) return false
  if (seen.has(v)) return false
  seen.add(v)
  // Avoid allocating an entry tuple and callback for every coordinate property.
  let safe=true
  if(Array.isArray(v)){
    for(let index=0;index<v.length;index++)if(index in v&&!jsonSafe(v[index],seen)){safe=false;break}
  }else{
    for(const key of Object.keys(v))if(reservedJsonKey.test(key)||!jsonSafe((v as Record<string,unknown>)[key],seen)){safe=false;break}
  }
  seen.delete(v)
  return safe
}
function overlay(v: unknown): boolean {
  return object(v) && keys(v,['id','paneId','name','groupId','points','lock','visible','styles','extendData']) &&
    optionalString(v.id) && optionalString(v.paneId) && typeof v.name === 'string' && typeof v.groupId === 'string' &&
    typeof v.lock === 'boolean' && typeof v.visible === 'boolean' &&
    Array.isArray(v.points) && v.points.every(p => object(p) && keys(p,['timestamp','value']) && finite(p.timestamp) && finite(p.value)) &&
    (v.styles === undefined || object(v.styles)) && (v.extendData === undefined || object(v.extendData))
}
function common(v: Record<string, unknown>): boolean {
  return finite(v.timestamp) && v.timestamp >= 0 && ['theme','locale','timezone'].every(k => typeof v[k] === 'string') &&
    (v.styles === null || object(v.styles)) && Array.isArray(v.overlayData) && v.overlayData.every(overlay)
}
export function isChartLayoutV2(v: unknown): v is ChartLayoutV2 {
  if (!object(v) || !jsonSafe(v) || !keys(v,['version','timestamp','theme','locale','timezone','styles','indicators','panes','overlayData','context']) || v.version !== 2 || !common(v)) return false
  if (!Array.isArray(v.indicators) || !v.indicators.every(i => object(i) && keys(i,['name','placement','paneId','calcParams','visible']) &&
    typeof i.name === 'string' && ['main','sub'].includes(i.placement as string) && optionalString(i.paneId) &&
    (i.calcParams === undefined || Array.isArray(i.calcParams)) && (i.visible === undefined || typeof i.visible === 'boolean'))) return false
  if (!Array.isArray(v.panes) || !v.panes.every(p => object(p) && keys(p,['id','height','minHeight','order']) && typeof p.id === 'string' &&
    ['height','minHeight','order'].every(k => p[k] === undefined || finite(p[k]) && (p[k] as number) >= 0))) return false
  if (new Set(v.panes.map(p => p.id)).size !== v.panes.length) return false
  const paneIds = new Set(v.panes.map(p => p.id))
  if ([...v.indicators, ...(v.overlayData as Record<string,unknown>[])].some(item => item.paneId !== undefined && !paneIds.has(item.paneId))) return false
  const overlayIds = (v.overlayData as Record<string,unknown>[]).map(item => item.id).filter(id => id !== undefined)
  if (new Set(overlayIds).size !== overlayIds.length) return false
  if (v.context !== undefined) {
    const c = v.context
    if (!object(c) || !keys(c,['ticker','market','exchange','currency','period','adjustment','sessionFilter']) || typeof c.ticker !== 'string' ||
      !['market','exchange','currency','adjustment','sessionFilter'].every(k => optionalString(c[k]))) return false
    if (c.period !== undefined && (!object(c.period) || !keys(c.period,['multiplier','timespan']) || !finite(c.period.multiplier) || c.period.multiplier <= 0 || typeof c.period.timespan !== 'string')) return false
  }
  return true
}
/** Pure migration; absent v1 parameters/pane geometry/context stay unknown, never fabricated. */
export function migrateLayoutV1(v: unknown): ChartLayoutV2 | null {
  if (!object(v) || v.version !== 1 || !jsonSafe(v) || !common(v) || !strings(v.mainIndicators) || !strings(v.subIndicators)) return null
  const result = {
    version: 2, timestamp:v.timestamp, theme:v.theme, locale:v.locale, timezone:v.timezone, styles:v.styles,
    indicators:[...v.mainIndicators.map(name=>({name,placement:'main'})),...v.subIndicators.map(name=>({name,placement:'sub'}))],
    panes:[], overlayData:v.overlayData
  }
  return isChartLayoutV2(result) ? JSON.parse(JSON.stringify(result)) : null
}
/** Reads v2 first. If absent, returns migrated v1 in memory; never writes during a read. */
export function loadLayoutV2(key: string): ChartLayoutV2 | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      return isChartLayoutV2(parsed) ? parsed : null
    }
    const legacy = localStorage.getItem(LEGACY_PREFIX + key)
    return legacy === null ? null : migrateLayoutV1(JSON.parse(legacy))
  } catch { return null }
}
