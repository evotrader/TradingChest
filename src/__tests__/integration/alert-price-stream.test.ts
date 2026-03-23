import { describe, it, expect, vi } from 'vitest'
import { AlertManager } from '../../alert'

describe('Alert Price Stream Integration', () => {
  it('simulated tick stream triggers crossing alert exactly once', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: 'cross100', price: 100, condition: 'crossing', triggered: false })

    // Simulate a price stream: 95 → 97 → 99 → 101 → 103 → 101 → 99
    const ticks = [95, 97, 99, 101, 103, 101, 99]
    ticks.forEach((price, i) => mgr.checkPrice(price, i * 1000))

    // Should trigger once (at tick 3: 99→101 crosses 100)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].triggerPrice).toBe(101)
  })

  it('above alert fires only on upward crossing', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: 'above50', price: 50, condition: 'above', triggered: false })

    const ticks = [45, 48, 51, 49, 52]
    ticks.forEach((price, i) => mgr.checkPrice(price, i * 1000))

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].triggerPrice).toBe(51)
  })

  it('below alert fires only on downward crossing', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: 'below50', price: 50, condition: 'below', triggered: false })

    const ticks = [55, 52, 49, 51, 48]
    ticks.forEach((price, i) => mgr.checkPrice(price, i * 1000))

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].triggerPrice).toBe(49)
  })

  it('multiple alerts on same price stream fire independently', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: 'a1', price: 100, condition: 'above', triggered: false })
    mgr.addAlert({ id: 'a2', price: 110, condition: 'above', triggered: false })

    const ticks = [95, 101, 105, 111, 115]
    ticks.forEach((price, i) => mgr.checkPrice(price, i * 1000))

    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb.mock.calls[0][0].alert.id).toBe('a1')
    expect(cb.mock.calls[1][0].alert.id).toBe('a2')
  })

  it('resetAll allows alerts to re-fire', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: 'r1', price: 100, condition: 'crossing', triggered: false })

    mgr.checkPrice(95, 1000)
    mgr.checkPrice(105, 2000) // fires
    expect(cb).toHaveBeenCalledTimes(1)

    mgr.resetAll()
    mgr.checkPrice(95, 3000)  // crosses back
    expect(cb).toHaveBeenCalledTimes(2)
  })
})
