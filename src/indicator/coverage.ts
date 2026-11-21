import type { KLineData } from 'klinecharts'

export function calculateAcrossCoverage<T>(
  bars: KLineData[], missing: readonly number[], calculate: (section: KLineData[]) => T[] | Promise<T[]>,
): T[] | Promise<T[]> {
  if (!missing.length || bars.length < 2) return calculate(bars)

  const cuts: number[] = []
  let gap = 0
  for (let i = 1; i < bars.length && gap < missing.length; i++) {
    while (gap < missing.length && missing[gap] <= bars[i - 1].timestamp) gap++
    if (gap < missing.length && missing[gap] < bars[i].timestamp) cuts.push(i)
  }
  if (!cuts.length) return calculate(bars)

  return calculateSections(bars, cuts, calculate)
}

async function calculateSections<T>(
  bars: KLineData[], cuts: number[], calculate: (section: KLineData[]) => T[] | Promise<T[]>,
): Promise<T[]> {
  const output: T[] = []
  let from = 0
  for (const to of cuts) {
    const section = await calculate(bars.slice(from, to))
    for (let i = 0; i < to - from; i++) output[from + i] = section[i]
    from = to
  }
  return output.concat(await calculate(bars.slice(from)))
}
