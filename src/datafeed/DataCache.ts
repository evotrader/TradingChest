import { KLineData } from 'klinecharts'

export class DataCache {
  private _store = new Map<string, KLineData[]>()

  private _key(symbol: string, period: string): string {
    return `${symbol}:${period}`
  }

  get(symbol: string, period: string): KLineData[] | null {
    return this._store.get(this._key(symbol, period)) ?? null
  }

  set(symbol: string, period: string, data: KLineData[]): void {
    this._store.set(this._key(symbol, period), [...data])
  }

  append(symbol: string, period: string, newData: KLineData[]): void {
    const key = this._key(symbol, period)
    const existing = this._store.get(key) ?? []
    const tsMap = new Map<number, KLineData>()
    for (const d of existing) tsMap.set(d.timestamp, d)
    for (const d of newData) tsMap.set(d.timestamp, d)
    const merged = Array.from(tsMap.values()).sort((a, b) => a.timestamp - b.timestamp)
    this._store.set(key, merged)
  }

  clear(): void {
    this._store.clear()
  }

  delete(symbol: string, period: string): void {
    this._store.delete(this._key(symbol, period))
  }
}
