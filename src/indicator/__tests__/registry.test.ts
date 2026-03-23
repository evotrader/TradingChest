import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IndicatorRegistry } from '../registry'

describe('IndicatorRegistry', () => {
  let registry: IndicatorRegistry

  beforeEach(() => {
    registry = new IndicatorRegistry()
  })

  it('isRegistered 初始为 false', () => {
    expect(registry.isRegistered('ATR')).toBe(false)
  })

  it('markRegistered 后 isRegistered 为 true', () => {
    registry.markRegistered('ATR')
    expect(registry.isRegistered('ATR')).toBe(true)
  })

  it('ensureRegistered 只调用 loader 一次', async () => {
    const loader = vi.fn().mockResolvedValue({ name: 'ATR', calc: () => [] })
    const registerFn = vi.fn()
    registry.setLoader('ATR', loader)
    registry.setRegisterFn(registerFn)

    await registry.ensureRegistered('ATR')
    await registry.ensureRegistered('ATR')

    expect(loader).toHaveBeenCalledTimes(1)
    expect(registerFn).toHaveBeenCalledTimes(1)
    expect(registry.isRegistered('ATR')).toBe(true)
  })

  it('ensureRegistered 并发调用只加载一次', async () => {
    const loader = vi.fn().mockResolvedValue({ name: 'RSI', calc: () => [] })
    const registerFn = vi.fn()
    registry.setLoader('RSI', loader)
    registry.setRegisterFn(registerFn)

    await Promise.all([
      registry.ensureRegistered('RSI'),
      registry.ensureRegistered('RSI'),
      registry.ensureRegistered('RSI'),
    ])

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('无 loader 的指标视为内置，直接标记', async () => {
    const registerFn = vi.fn()
    registry.setRegisterFn(registerFn)

    await registry.ensureRegistered('MA')

    expect(registry.isRegistered('MA')).toBe(true)
    expect(registerFn).not.toHaveBeenCalled()
  })
})
