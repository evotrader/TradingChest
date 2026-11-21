import {expect, it, vi} from 'vitest'
import {calculateAcrossCoverage} from '../coverage'

it('restarts indicator calculation at missing timestamps and preserves visible bar indices', async () => {
  const bars = [1, 2, 4, 5, 7].map(timestamp => ({timestamp, open: 1, high: 1, low: 1, close: 1}))
  const calculate = vi.fn(async section => section.map((_bar: unknown, index: number) => index))
  expect(await calculateAcrossCoverage(bars, [3, 5, 6], calculate)).toEqual([0, 1, 0, 1, 0])
  expect(calculate.mock.calls.map(([segment]) => segment.map(({timestamp}: {timestamp:number}) => timestamp)))
    .toEqual([[1, 2], [4, 5], [7]])
})
