import { describe, it, expect } from 'vitest'
import { DataCache } from '../DataCache'

describe('DataCache', () => {
  it('get returns null for missing key', () => {
    const cache = new DataCache()
    expect(cache.get('BTC', '1m')).toBeNull()
  })

  it('set and get round-trip', () => {
    const cache = new DataCache()
    const data = [{ timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }] as any
    cache.set('BTC', '1m', data)
    expect(cache.get('BTC', '1m')).toEqual(data)
  })

  it('append deduplicates by timestamp', () => {
    const cache = new DataCache()
    cache.set('BTC', '1m', [{ timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }] as any)
    cache.append('BTC', '1m', [{ timestamp: 1000, open: 2, high: 3, low: 1, close: 2.5 }] as any)
    const result = cache.get('BTC', '1m')!
    expect(result.length).toBe(1)
    expect(result[0].open).toBe(2)
  })

  it('LRU evicts oldest entry when maxEntries exceeded', () => {
    const cache = new DataCache(2)
    cache.set('A', '1m', [{ timestamp: 1 }] as any)
    cache.set('B', '1m', [{ timestamp: 2 }] as any)
    cache.set('C', '1m', [{ timestamp: 3 }] as any)
    expect(cache.get('A', '1m')).toBeNull()
    expect(cache.get('B', '1m')).not.toBeNull()
    expect(cache.get('C', '1m')).not.toBeNull()
  })

  it('get refreshes LRU order', () => {
    const cache = new DataCache(2)
    cache.set('A', '1m', [{ timestamp: 1 }] as any)
    cache.set('B', '1m', [{ timestamp: 2 }] as any)
    cache.get('A', '1m') // refresh A
    cache.set('C', '1m', [{ timestamp: 3 }] as any) // should evict B
    expect(cache.get('A', '1m')).not.toBeNull()
    expect(cache.get('B', '1m')).toBeNull()
  })

  it('delete removes entry', () => {
    const cache = new DataCache()
    cache.set('X', '1h', [{ timestamp: 1 }] as any)
    cache.delete('X', '1h')
    expect(cache.get('X', '1h')).toBeNull()
  })

  it('clear removes all', () => {
    const cache = new DataCache()
    cache.set('A', '1m', [{ timestamp: 1 }] as any)
    cache.set('B', '1h', [{ timestamp: 2 }] as any)
    cache.clear()
    expect(cache.get('A', '1m')).toBeNull()
    expect(cache.get('B', '1h')).toBeNull()
  })
})
