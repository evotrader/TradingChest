// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mountAnalyticalWidget } from '../mountWidget'

describe('cross-framework widget mounting', () => {
  it('updates values and callbacks with stable IDs without remounting the root', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const first = vi.fn(), second = vi.fn()
    const props = { viewState: { status: 'ready' as const }, points: [{id:'a',x:'a',y:1}, {id:'b',x:'b',y:2}], onPointSelect:first }
    const mounted = mountAnalyticalWidget('MetricSeries', el, props)
    const root = el.firstElementChild
    const oldPath = el.querySelector('path')!.getAttribute('d')
    mounted.update({...props, points:[{id:'a',x:'a',y:4}, {id:'b',x:'b',y:2}], onPointSelect:second})
    expect(el.firstElementChild).toBe(root)
    expect(el.querySelector('path')!.getAttribute('d')).not.toBe(oldPath)
    el.querySelector('circle')!.dispatchEvent(new MouseEvent('click', {bubbles:true}))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(expect.objectContaining({id:'a',y:4}))
    mounted.update({...props, viewState:{status:'error', message:'Feed unavailable'} } as any)
    expect(el.textContent).toContain('Feed unavailable')
    mounted.dispose(); mounted.dispose(); mounted.update(props)
    expect(el.childNodes).toHaveLength(0)
    el.remove()
  })
  it('keeps separate hosts independent', () => {
    const a = document.createElement('div'), b = document.createElement('div')
    const props = {viewState:{status:'ready' as const}, points:[{id:'a',x:'a',y:1}]}
    const one = mountAnalyticalWidget('MetricSeries', a, props)
    const two = mountAnalyticalWidget('MetricSeries', b, props)
    one.dispose()
    expect(b.querySelector('circle')).not.toBeNull()
    two.dispose()
  })
})
