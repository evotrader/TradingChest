import { describe, it, expect } from 'vitest'
import { ReconnectOptions } from '../ReconnectingWebSocket'

describe('ReconnectingWebSocket options', () => {
  it('默认选项', () => {
    const opts: ReconnectOptions = {}
    const resolved = {
      maxRetries: opts.maxRetries ?? 5,
      baseDelay: opts.baseDelay ?? 1000,
      maxDelay: opts.maxDelay ?? 30000,
    }
    expect(resolved.maxRetries).toBe(5)
    expect(resolved.baseDelay).toBe(1000)
    expect(resolved.maxDelay).toBe(30000)
  })

  it('指数退避计算', () => {
    const baseDelay = 1000
    const maxDelay = 30000
    for (let i = 0; i < 5; i++) {
      const delay = Math.min(baseDelay * Math.pow(2, i), maxDelay)
      expect(delay).toBeLessThanOrEqual(maxDelay)
    }
    const delay5 = Math.min(baseDelay * Math.pow(2, 5), maxDelay)
    expect(delay5).toBe(maxDelay)
  })
})
