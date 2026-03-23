import { describe, it, expect, vi } from 'vitest'
import { AlertManager } from '../index'

describe('AlertManager', () => {
  it('添加和查询 alert', () => {
    const mgr = new AlertManager()
    mgr.addAlert({ id: 'a1', price: 100, condition: 'crossing' })
    expect(mgr.getAlerts()).toHaveLength(1)
    expect(mgr.getAlert('a1')?.price).toBe(100)
  })

  it('removeAlert 移除', () => {
    const mgr = new AlertManager()
    mgr.addAlert({ id: 'a1', price: 100, condition: 'crossing' })
    mgr.removeAlert('a1')
    expect(mgr.getAlerts()).toHaveLength(0)
  })

  it('checkPrice — crossing 条件触发', () => {
    const mgr = new AlertManager()
    const onTrigger = vi.fn()
    mgr.onTrigger = onTrigger
    mgr.addAlert({ id: 'a1', price: 100, condition: 'crossing' })
    mgr.checkPrice(95, 1000)  // set prevPrice
    expect(onTrigger).not.toHaveBeenCalled()
    mgr.checkPrice(105, 2000)  // crosses 100
    expect(onTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ alert: expect.objectContaining({ id: 'a1' }), triggerPrice: 105 })
    )
  })

  it('above 条件只在上穿时触发', () => {
    const mgr = new AlertManager()
    const onTrigger = vi.fn()
    mgr.onTrigger = onTrigger
    mgr.addAlert({ id: 'a1', price: 100, condition: 'above' })
    mgr.checkPrice(105, 1000)  // above but no prevPrice yet, sets prevPrice
    mgr.checkPrice(95, 2000)   // drops below — no trigger
    expect(onTrigger).not.toHaveBeenCalled()
    mgr.checkPrice(101, 3000)  // crosses up — trigger
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('clearAll 清空', () => {
    const mgr = new AlertManager()
    mgr.addAlert({ id: 'a1', price: 100, condition: 'crossing' })
    mgr.addAlert({ id: 'a2', price: 200, condition: 'above' })
    mgr.clearAll()
    expect(mgr.getAlerts()).toHaveLength(0)
  })

  it('below 条件触发', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: '1', price: 100, condition: 'below', triggered: false })
    mgr.checkPrice(101, 1000) // above, sets prevPrice
    mgr.checkPrice(99, 2000)  // drops below
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].alert.condition).toBe('below')
  })

  it('已触发的报警不重复触发', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: '1', price: 100, condition: 'crossing', triggered: false })
    mgr.checkPrice(99, 1000)
    mgr.checkPrice(101, 2000) // triggers
    mgr.checkPrice(99, 3000)  // crosses again but already triggered
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('resetAll 重置触发状态', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: '1', price: 100, condition: 'crossing', triggered: false })
    mgr.checkPrice(99, 1000)
    mgr.checkPrice(101, 2000) // triggers
    expect(cb).toHaveBeenCalledTimes(1)
    mgr.resetAll()
    mgr.checkPrice(99, 3000)  // crosses again after reset
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('精确等于边界价格', () => {
    const mgr = new AlertManager()
    const cb = vi.fn()
    mgr.onTrigger = cb
    mgr.addAlert({ id: '1', price: 100, condition: 'above', triggered: false })
    mgr.checkPrice(99, 1000)
    mgr.checkPrice(100, 2000) // exactly at price, not above
    expect(cb).toHaveBeenCalledTimes(0)
    mgr.checkPrice(101, 3000) // now above
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
