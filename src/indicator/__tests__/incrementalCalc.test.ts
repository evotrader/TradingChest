import { describe, it, expect, vi } from 'vitest'
import { wrapWithIncrementalCalc } from '../incrementalCalc'

describe('wrapWithIncrementalCalc', () => {
  it('首次调用执行完整计算', () => {
    const fullCalc = vi.fn((dataList: any[]) =>
      dataList.map((d: any) => ({ val: d.close * 2 }))
    )
    const wrapped = wrapWithIncrementalCalc(fullCalc, 5)

    const data = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 30 },
    ]
    const result = wrapped(data as any, {} as any)

    expect(fullCalc).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(3)
    expect(result[0].val).toBe(20)
    expect(result[2].val).toBe(60)
  })

  it('仅追加一根 K 线时只重算尾部', () => {
    const callArgs: number[] = []
    const fullCalc = vi.fn((dataList: any[]) => {
      callArgs.push(dataList.length)
      return dataList.map((d: any) => ({ val: d.close * 2 }))
    })
    const wrapped = wrapWithIncrementalCalc(fullCalc, 3)

    const data1 = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 30 },
      { timestamp: 4, close: 40 },
      { timestamp: 5, close: 50 },
    ]
    wrapped(data1 as any, {} as any)

    // Append one candle
    const data2 = [...data1, { timestamp: 6, close: 60 }]
    const result2 = wrapped(data2 as any, {} as any)

    expect(fullCalc).toHaveBeenCalledTimes(2)
    // Second call should receive only lookback=3 elements
    expect(callArgs[1]).toBe(3)
    expect(result2).toHaveLength(6)
    expect(result2[5].val).toBe(120)
  })

  it('数据长度变短时重新完整计算', () => {
    const callArgs: number[] = []
    const fullCalc = vi.fn((dataList: any[]) => {
      callArgs.push(dataList.length)
      return dataList.map((d: any) => ({ val: d.close }))
    })
    const wrapped = wrapWithIncrementalCalc(fullCalc, 3)

    wrapped([
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 30 },
      { timestamp: 4, close: 40 },
    ] as any, {} as any)

    // Data shrinks (symbol change)
    wrapped([{ timestamp: 5, close: 50 }] as any, {} as any)

    expect(fullCalc).toHaveBeenCalledTimes(2)
    // Second call should be full calc (data length = 1)
    expect(callArgs[1]).toBe(1)
  })

  it('最后一根 K 线更新时重算尾部', () => {
    const callArgs: number[] = []
    const fullCalc = vi.fn((dataList: any[]) => {
      callArgs.push(dataList.length)
      return dataList.map((d: any) => ({ val: d.close }))
    })
    const wrapped = wrapWithIncrementalCalc(fullCalc, 3)

    const data1 = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 30 },
      { timestamp: 4, close: 40 },
      { timestamp: 5, close: 50 },
    ]
    wrapped(data1 as any, {} as any)

    // Update last candle's close
    const data2 = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 30 },
      { timestamp: 4, close: 40 },
      { timestamp: 5, close: 55 },  // updated
    ]
    const result = wrapped(data2 as any, {} as any)

    expect(result).toHaveLength(5)
    expect(result[4].val).toBe(55)
    // Should be incremental (lookback=3)
    expect(callArgs[1]).toBe(3)
  })

  it('空数据返回空', () => {
    const fullCalc = vi.fn(() => [])
    const wrapped = wrapWithIncrementalCalc(fullCalc, 5)
    expect(wrapped([] as any, {} as any)).toEqual([])
  })
})
