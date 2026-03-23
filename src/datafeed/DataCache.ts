import { KLineData } from 'klinecharts'

export class DataCache {
  private _store = new Map<string, KLineData[]>()
  private _maxEntries: number

  constructor(maxEntries: number = 30) {
    this._maxEntries = maxEntries
  }

  private _key(symbol: string, period: string): string {
    return `${symbol}:${period}`
  }

  private _touch(key: string): void {
    const val = this._store.get(key)
    if (val !== undefined) {
      this._store.delete(key)
      this._store.set(key, val)
    }
  }

  private _evict(): void {
    while (this._store.size > this._maxEntries) {
      const oldest = this._store.keys().next().value
      if (oldest !== undefined) this._store.delete(oldest)
    }
  }

  get(symbol: string, period: string): KLineData[] | null {
    const key = this._key(symbol, period)
    const val = this._store.get(key)
    if (val === undefined) return null
    this._touch(key)
    return val
  }

  set(symbol: string, period: string, data: KLineData[]): void {
    const key = this._key(symbol, period)
    this._store.delete(key)
    this._store.set(key, [...data])
    this._evict()
  }

  append(symbol: string, period: string, newData: KLineData[]): void {
    const key = this._key(symbol, period)
    const existing = this._store.get(key) ?? []
    const tsMap = new Map<number, KLineData>()
    for (const d of existing) tsMap.set(d.timestamp, d)
    for (const d of newData) tsMap.set(d.timestamp, d)
    const merged = Array.from(tsMap.values()).sort((a, b) => a.timestamp - b.timestamp)
    this._store.delete(key)
    this._store.set(key, merged)
    this._evict()
  }

  clear(): void {
    this._store.clear()
  }

  delete(symbol: string, period: string): void {
    this._store.delete(this._key(symbol, period))
  }
}
