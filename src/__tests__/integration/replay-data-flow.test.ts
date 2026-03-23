import { describe, it, expect, vi } from 'vitest'
import { ReplayEngine } from '../../replay/ReplayEngine'
import { KLineData } from 'klinecharts'

function makeData(count: number): KLineData[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: (i + 1) * 60000,
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 102 + i,
    volume: 1000 + i * 10
  })) as KLineData[]
}

describe('Replay Data Flow Integration', () => {
  it('start delivers initial slice via onDataChange', () => {
    const onDataChange = vi.fn()
    const onBarUpdate = vi.fn()
    const onStateChange = vi.fn()
    const engine = new ReplayEngine({ onDataChange, onBarUpdate, onStateChange })
    const data = makeData(20)

    engine.start(data, 10)

    expect(onDataChange).toHaveBeenCalledTimes(1)
    const slice = onDataChange.mock.calls[0][0]
    expect(slice.length).toBe(10)
    expect(slice[0].timestamp).toBe(data[0].timestamp)
    expect(slice[9].timestamp).toBe(data[9].timestamp)
  })

  it('stepForward delivers next bar via onBarUpdate', () => {
    const onDataChange = vi.fn()
    const onBarUpdate = vi.fn()
    const onStateChange = vi.fn()
    const engine = new ReplayEngine({ onDataChange, onBarUpdate, onStateChange })
    const data = makeData(20)

    engine.start(data, 10)
    engine.stepForward()

    expect(onBarUpdate).toHaveBeenCalledTimes(1)
    expect(onBarUpdate.mock.calls[0][0].timestamp).toBe(data[10].timestamp)
  })

  it('sequential stepForward delivers bars in chronological order', () => {
    const onDataChange = vi.fn()
    const onBarUpdate = vi.fn()
    const onStateChange = vi.fn()
    const engine = new ReplayEngine({ onDataChange, onBarUpdate, onStateChange })
    const data = makeData(20)

    engine.start(data, 10)
    for (let i = 0; i < 5; i++) engine.stepForward()

    expect(onBarUpdate).toHaveBeenCalledTimes(5)
    for (let i = 0; i < 5; i++) {
      expect(onBarUpdate.mock.calls[i][0].timestamp).toBe(data[10 + i].timestamp)
    }
  })

  it('stepBackward rebuilds via onDataChange with one fewer bar', () => {
    const onDataChange = vi.fn()
    const onBarUpdate = vi.fn()
    const onStateChange = vi.fn()
    const engine = new ReplayEngine({ onDataChange, onBarUpdate, onStateChange })
    const data = makeData(20)

    engine.start(data, 10)
    onDataChange.mockClear()
    engine.stepBackward()

    expect(onDataChange).toHaveBeenCalledTimes(1)
    expect(onDataChange.mock.calls[0][0].length).toBe(9)
  })

  it('play auto-advances and auto-pauses at end', () => {
    vi.useFakeTimers()
    const onDataChange = vi.fn()
    const onBarUpdate = vi.fn()
    const onStateChange = vi.fn()
    const engine = new ReplayEngine({ onDataChange, onBarUpdate, onStateChange })
    const data = makeData(5)

    engine.start(data, 3) // 2 bars remaining
    engine.play()

    vi.advanceTimersByTime(3000) // enough time for 2+ bars at 1x speed

    expect(engine.getState().playing).toBe(false) // auto-paused
    expect(engine.getState().position).toBe(5) // reached end
    engine.dispose()
    vi.useRealTimers()
  })
})
