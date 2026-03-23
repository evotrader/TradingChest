import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReplayEngine } from '../ReplayEngine'
import { KLineData } from 'klinecharts'

function makeKlines(count: number): KLineData[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: 1700000000000 + i * 60000,
    open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i,
    volume: 1000, turnover: 0
  }))
}

describe('ReplayEngine', () => {
  let engine: ReplayEngine
  const onDataChange = vi.fn()
  const onBarUpdate = vi.fn()
  const onStateChange = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    engine = new ReplayEngine({ onDataChange, onBarUpdate, onStateChange })
    onDataChange.mockClear()
    onBarUpdate.mockClear()
    onStateChange.mockClear()
  })

  afterEach(() => {
    engine.dispose()
    vi.useRealTimers()
  })

  it('start 进入回放模式', () => {
    const data = makeKlines(100)
    engine.start(data, 50)
    expect(onDataChange).toHaveBeenCalledTimes(1)
    expect(onDataChange.mock.calls[0][0]).toHaveLength(50)
    expect(engine.getState().active).toBe(true)
    expect(engine.getState().position).toBe(50)
    expect(engine.getState().totalBars).toBe(100)
    expect(engine.getState().playing).toBe(false)
  })

  it('stepForward 前进一根', () => {
    engine.start(makeKlines(100), 50)
    onDataChange.mockClear()
    engine.stepForward()
    expect(onBarUpdate).toHaveBeenCalledTimes(1)
    expect(engine.getState().position).toBe(51)
  })

  it('stepBackward 后退一根', () => {
    engine.start(makeKlines(100), 50)
    onDataChange.mockClear()
    engine.stepBackward()
    expect(onDataChange).toHaveBeenCalledTimes(1)
    expect(onDataChange.mock.calls[0][0]).toHaveLength(49)
    expect(engine.getState().position).toBe(49)
  })

  it('play/pause 自动前进', () => {
    engine.start(makeKlines(100), 50)
    onBarUpdate.mockClear()
    engine.play()
    expect(engine.getState().playing).toBe(true)
    vi.advanceTimersByTime(3000)
    expect(onBarUpdate.mock.calls.length).toBe(3)
    expect(engine.getState().position).toBe(53)
    engine.pause()
    expect(engine.getState().playing).toBe(false)
    vi.advanceTimersByTime(3000)
    expect(onBarUpdate.mock.calls.length).toBe(3) // no more
  })

  it('setSpeed 改变速度', () => {
    engine.start(makeKlines(100), 50)
    onBarUpdate.mockClear()
    engine.setSpeed(4)
    engine.play()
    vi.advanceTimersByTime(1000) // 4x = 250ms/bar = 4 bars in 1s
    expect(onBarUpdate.mock.calls.length).toBe(4)
  })

  it('到达末尾自动暂停', () => {
    engine.start(makeKlines(5), 3)
    onBarUpdate.mockClear()
    engine.play()
    vi.advanceTimersByTime(5000)
    expect(engine.getState().position).toBe(5)
    expect(engine.getState().playing).toBe(false)
  })

  it('goToPosition 跳转', () => {
    engine.start(makeKlines(100), 50)
    onDataChange.mockClear()
    engine.goToPosition(80)
    expect(onDataChange).toHaveBeenCalledTimes(1)
    expect(onDataChange.mock.calls[0][0]).toHaveLength(80)
    expect(engine.getState().position).toBe(80)
  })

  it('stop 退出回放', () => {
    engine.start(makeKlines(100), 50)
    engine.stop()
    expect(engine.getState().active).toBe(false)
  })

  it('stepBackward 在位置 1 时不后退', () => {
    engine.start(makeKlines(100), 1)
    engine.stepBackward()
    expect(engine.getState().position).toBe(1)
  })
})
