import { afterEach, describe, expect, it, vi } from 'vitest'
import DefaultDatafeed from '../../DefaultDatafeed'
const symbol = {ticker:'TEST'}
const period = {multiplier:1,timespan:'minute',text:'1m'}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('history cancellation contract', () => {
  it('passes caller cancellation through to fetch and does not return fake empty data', async () => {
    vi.useFakeTimers()
    let fetchSignal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      fetchSignal = options.signal
      fetchSignal.addEventListener('abort', () => reject(fetchSignal.reason), {once:true})
    })))
    const controller = new AbortController()
    const feed = new DefaultDatafeed('fixture', {fetchTimeout:1000})
    const pending = feed.getHistoryKLineData(symbol, period, 0, 1, {signal:controller.signal,reason:'initial'})
    const rejected = expect(pending).rejects.toMatchObject({name:'AbortError'})
    controller.abort()
    await rejected
    expect(fetchSignal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps legacy calls valid and releases the timeout after success', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,json:async()=>({results:[]})}))
    await expect(new DefaultDatafeed('fixture').getHistoryKLineData(symbol,period,0,1)).resolves.toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
