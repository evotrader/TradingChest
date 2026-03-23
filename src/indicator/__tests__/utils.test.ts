import { describe, it, expect } from 'vitest'
import {
  calcSMA,
  calcEMA,
  calcWMA,
  calcTR,
  calcStdDev,
  calcRMA,
  calcSum,
  calcChange,
  calcGain,
  calcLoss,
  calcHighest,
  calcLowest,
} from '../utils'

// ---------------------------------------------------------------------------
// Helper: compare floating-point arrays with a tolerance
// ---------------------------------------------------------------------------
function expectArrayClose(actual: (number | null)[], expected: (number | null)[], eps = 1e-10) {
  expect(actual).toHaveLength(expected.length)
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] === null) {
      expect(actual[i]).toBeNull()
    } else {
      expect(actual[i]).toBeCloseTo(expected[i] as number, 10)
    }
  }
}

// ---------------------------------------------------------------------------
// calcSMA
// ---------------------------------------------------------------------------
describe('calcSMA', () => {
  it('returns null-padded array with correct averages', () => {
    // [1,2,3,4,5], period 3
    // i=0 → null, i=1 → null, i=2 → (1+2+3)/3=2, i=3 → (2+3+4)/3=3, i=4 → (3+4+5)/3=4
    expectArrayClose(calcSMA([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4])
  })

  it('period 1 returns every element unchanged', () => {
    expectArrayClose(calcSMA([3, 7, 2], 1), [3, 7, 2])
  })

  it('period equals data length returns one value', () => {
    expectArrayClose(calcSMA([1, 2, 3, 4], 4), [null, null, null, 2.5])
  })

  it('period larger than data length returns all nulls', () => {
    expectArrayClose(calcSMA([1, 2, 3], 5), [null, null, null])
  })

  it('empty array returns empty array', () => {
    expect(calcSMA([], 3)).toEqual([])
  })

  it('single element, period 1', () => {
    expectArrayClose(calcSMA([42], 1), [42])
  })

  it('single element, period > 1 returns null', () => {
    expectArrayClose(calcSMA([42], 3), [null])
  })
})

// ---------------------------------------------------------------------------
// calcEMA
// ---------------------------------------------------------------------------
describe('calcEMA', () => {
  it('seed is SMA, subsequent values use EMA formula', () => {
    // data=[1,2,3,4,5], period=3 → k=2/4=0.5
    // i=2: seed = (1+2+3)/3 = 2
    // i=3: 4*0.5 + 2*0.5 = 3
    // i=4: 5*0.5 + 3*0.5 = 4
    const result = calcEMA([1, 2, 3, 4, 5], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).toBeCloseTo(2, 10)
    expect(result[3]).toBeCloseTo(3, 10)
    expect(result[4]).toBeCloseTo(4, 10)
  })

  it('period 1 returns each value (k=1)', () => {
    // k = 2/(1+1) = 1, so EMA_i = data[i]*1 + prev*0 = data[i]
    expectArrayClose(calcEMA([5, 10, 15], 1), [5, 10, 15])
  })

  it('period equals data length returns single EMA value', () => {
    const result = calcEMA([1, 2, 3], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).toBeCloseTo(2, 10)
  })

  it('period larger than data length returns all nulls', () => {
    const result = calcEMA([1, 2], 5)
    expect(result).toEqual([null, null])
  })

  it('empty array returns empty array', () => {
    expect(calcEMA([], 3)).toEqual([])
  })

  it('single element with period 1', () => {
    expectArrayClose(calcEMA([7], 1), [7])
  })
})

// ---------------------------------------------------------------------------
// calcWMA
// ---------------------------------------------------------------------------
describe('calcWMA', () => {
  it('computes weighted average correctly for period 3', () => {
    // data=[1,2,3,4,5], period=3, weightSum=6
    // i=2: (1*1 + 2*2 + 3*3)/6 = (1+4+9)/6 = 14/6 ≈ 2.3333
    // i=3: (2*1 + 3*2 + 4*3)/6 = (2+6+12)/6 = 20/6 ≈ 3.3333
    // i=4: (3*1 + 4*2 + 5*3)/6 = (3+8+15)/6 = 26/6 ≈ 4.3333
    const result = calcWMA([1, 2, 3, 4, 5], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).toBeCloseTo(14 / 6, 10)
    expect(result[3]).toBeCloseTo(20 / 6, 10)
    expect(result[4]).toBeCloseTo(26 / 6, 10)
  })

  it('period 1 weights single element fully', () => {
    expectArrayClose(calcWMA([3, 6, 9], 1), [3, 6, 9])
  })

  it('period equals data length returns one weighted value', () => {
    // data=[1,2,3], period=3, weightSum=6
    // (1*1 + 2*2 + 3*3)/6 = 14/6
    const result = calcWMA([1, 2, 3], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).toBeCloseTo(14 / 6, 10)
  })

  it('period larger than data length returns all nulls', () => {
    expect(calcWMA([1, 2], 5)).toEqual([null, null])
  })

  it('empty array returns empty array', () => {
    expect(calcWMA([], 3)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// calcTR
// ---------------------------------------------------------------------------
describe('calcTR', () => {
  it('first bar uses high - low (no previous close)', () => {
    const result = calcTR([10], [6], [8])
    expect(result[0]).toBeCloseTo(4, 10) // 10 - 6 = 4
  })

  it('subsequent bars use max(hl, |h-pc|, |l-pc|)', () => {
    // Bar 0: H=10, L=6, C=8  → TR = 4
    // Bar 1: H=11, L=7, C=9  prevC=8 → hl=4, hc=|11-8|=3, lc=|7-8|=1 → TR=4
    const result = calcTR([10, 11], [6, 7], [8, 9])
    expect(result[0]).toBeCloseTo(4, 10)
    expect(result[1]).toBeCloseTo(4, 10)
  })

  it('gap-up scenario: prevClose far below low', () => {
    // Bar 0: H=100, L=90, C=95
    // Bar 1: H=120, L=110, C=115  prevC=95 → hl=10, hc=|120-95|=25, lc=|110-95|=15 → TR=25
    const result = calcTR([100, 120], [90, 110], [95, 115])
    expect(result[1]).toBeCloseTo(25, 10)
  })

  it('gap-down scenario: prevClose far above high', () => {
    // Bar 0: H=100, L=90, C=95
    // Bar 1: H=80, L=70, C=75  prevC=95 → hl=10, hc=|80-95|=15, lc=|70-95|=25 → TR=25
    const result = calcTR([100, 80], [90, 70], [95, 75])
    expect(result[1]).toBeCloseTo(25, 10)
  })

  it('multiple bars returns correct length', () => {
    const high  = [10, 11, 12, 13, 14]
    const low   = [ 8,  9, 10, 11, 12]
    const close = [ 9, 10, 11, 12, 13]
    const result = calcTR(high, low, close)
    expect(result).toHaveLength(5)
    // All values should be non-null numbers
    result.forEach(v => expect(typeof v).toBe('number'))
  })

  it('single bar returns [high - low]', () => {
    expect(calcTR([15], [10], [12])).toEqual([5])
  })

  it('empty arrays return empty array', () => {
    expect(calcTR([], [], [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// calcStdDev
// ---------------------------------------------------------------------------
describe('calcStdDev', () => {
  it('computes population std dev correctly', () => {
    // data=[2,4,4,4,5,5,7,9], period=8
    // mean=5, variance=((9+1+1+1+0+0+4+16)/8)=4, stddev=2
    const data = [2, 4, 4, 4, 5, 5, 7, 9]
    const result = calcStdDev(data, 8)
    expect(result[7]).toBeCloseTo(2, 10)
    // First 7 should be null
    for (let i = 0; i < 7; i++) expect(result[i]).toBeNull()
  })

  it('constant data has zero std dev', () => {
    const result = calcStdDev([5, 5, 5, 5], 4)
    expect(result[3]).toBeCloseTo(0, 10)
  })

  it('period 1 returns zero (single-element window)', () => {
    const result = calcStdDev([1, 2, 3], 1)
    result.forEach(v => expect(v).toBeCloseTo(0, 10))
  })

  it('period larger than data returns all nulls', () => {
    expect(calcStdDev([1, 2], 5)).toEqual([null, null])
  })

  it('empty array returns empty array', () => {
    expect(calcStdDev([], 3)).toEqual([])
  })

  it('sliding window updates correctly', () => {
    // data=[1,2,3,4,5], period=3
    // i=2: window=[1,2,3] mean=2, var=(1+0+1)/3=2/3, std=sqrt(2/3)
    // i=3: window=[2,3,4] mean=3, var=(1+0+1)/3=2/3, std=sqrt(2/3)
    const result = calcStdDev([1, 2, 3, 4, 5], 3)
    const expected = Math.sqrt(2 / 3)
    expect(result[2]).toBeCloseTo(expected, 10)
    expect(result[3]).toBeCloseTo(expected, 10)
    expect(result[4]).toBeCloseTo(expected, 10)
  })
})

// ---------------------------------------------------------------------------
// calcRMA
// ---------------------------------------------------------------------------
describe('calcRMA', () => {
  it('seed is SMA of first period elements', () => {
    // data=[1,2,3,4,5], period=3
    // seed at i=2: (1+2+3)/3=2
    // i=3: (2*2 + 4)/3 = 8/3 ≈ 2.6667
    // i=4: (8/3 * 2 + 5)/3 = (16/3 + 5)/3 = 31/9 ≈ 3.4444
    const result = calcRMA([1, 2, 3, 4, 5], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).toBeCloseTo(2, 10)
    expect(result[3]).toBeCloseTo(8 / 3, 10)
    expect(result[4]).toBeCloseTo(31 / 9, 10)
  })

  it('period 1 returns each value unchanged', () => {
    // seed=data[0], then RMA=(prev*0 + data[i])/1=data[i]
    expectArrayClose(calcRMA([3, 7, 2], 1), [3, 7, 2])
  })

  it('period equals data length returns single seed value', () => {
    const result = calcRMA([1, 2, 3], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).toBeCloseTo(2, 10)
  })

  it('period larger than data length returns all nulls', () => {
    expect(calcRMA([1, 2], 5)).toEqual([null, null])
  })

  it('empty array returns empty array', () => {
    expect(calcRMA([], 3)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// calcSum
// ---------------------------------------------------------------------------
describe('calcSum', () => {
  it('returns rolling sums correctly', () => {
    // data=[1,2,3,4,5], period=3
    // i=0 → null, i=1 → null, i=2 → 6, i=3 → 9, i=4 → 12
    expectArrayClose(calcSum([1, 2, 3, 4, 5], 3), [null, null, 6, 9, 12])
  })

  it('period 1 returns each element', () => {
    expectArrayClose(calcSum([4, 5, 6], 1), [4, 5, 6])
  })

  it('period equals data length returns single sum', () => {
    expectArrayClose(calcSum([1, 2, 3, 4], 4), [null, null, null, 10])
  })

  it('period larger than data returns all nulls', () => {
    expect(calcSum([1, 2], 5)).toEqual([null, null])
  })

  it('empty array returns empty array', () => {
    expect(calcSum([], 3)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// calcChange
// ---------------------------------------------------------------------------
describe('calcChange', () => {
  it('first element is null, rest are differences', () => {
    expectArrayClose(calcChange([1, 3, 6, 4]), [null, 2, 3, -2])
  })

  it('single element returns [null]', () => {
    expect(calcChange([5])).toEqual([null])
  })

  it('empty array returns empty array', () => {
    expect(calcChange([])).toEqual([])
  })

  it('constant data returns zeros after first null', () => {
    expectArrayClose(calcChange([7, 7, 7]), [null, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// calcGain
// ---------------------------------------------------------------------------
describe('calcGain', () => {
  it('returns gain when positive, 0 when flat or negative', () => {
    // [1,3,3,2,5] → [null, 2, 0, 0, 3]
    expectArrayClose(calcGain([1, 3, 3, 2, 5]), [null, 2, 0, 0, 3])
  })

  it('single element returns [null]', () => {
    expect(calcGain([10])).toEqual([null])
  })

  it('empty array returns empty array', () => {
    expect(calcGain([])).toEqual([])
  })

  it('monotonically decreasing returns zeros after null', () => {
    expectArrayClose(calcGain([5, 4, 3, 2]), [null, 0, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// calcLoss
// ---------------------------------------------------------------------------
describe('calcLoss', () => {
  it('returns absolute loss when negative, 0 when flat or positive', () => {
    // [5,3,3,4,1] → [null, 2, 0, 0, 3]
    expectArrayClose(calcLoss([5, 3, 3, 4, 1]), [null, 2, 0, 0, 3])
  })

  it('single element returns [null]', () => {
    expect(calcLoss([10])).toEqual([null])
  })

  it('empty array returns empty array', () => {
    expect(calcLoss([])).toEqual([])
  })

  it('monotonically increasing returns zeros after null', () => {
    expectArrayClose(calcLoss([1, 2, 3, 4]), [null, 0, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// calcHighest
// ---------------------------------------------------------------------------
describe('calcHighest', () => {
  it('returns rolling max correctly', () => {
    // data=[3,1,4,1,5,9,2,6], period=3
    expectArrayClose(
      calcHighest([3, 1, 4, 1, 5, 9, 2, 6], 3),
      [null, null, 4, 4, 5, 9, 9, 9]
    )
  })

  it('period 1 returns every element', () => {
    expectArrayClose(calcHighest([7, 3, 5], 1), [7, 3, 5])
  })

  it('period equals data length returns global max', () => {
    const result = calcHighest([3, 1, 4, 2], 4)
    expect(result[3]).toBe(4)
    for (let i = 0; i < 3; i++) expect(result[i]).toBeNull()
  })

  it('period larger than data returns all nulls', () => {
    expect(calcHighest([1, 2], 5)).toEqual([null, null])
  })

  it('empty array returns empty array', () => {
    expect(calcHighest([], 3)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// calcLowest
// ---------------------------------------------------------------------------
describe('calcLowest', () => {
  it('returns rolling min correctly', () => {
    // data=[3,1,4,1,5,9,2,6], period=3
    expectArrayClose(
      calcLowest([3, 1, 4, 1, 5, 9, 2, 6], 3),
      [null, null, 1, 1, 1, 1, 2, 2]
    )
  })

  it('period 1 returns every element', () => {
    expectArrayClose(calcLowest([7, 3, 5], 1), [7, 3, 5])
  })

  it('period equals data length returns global min', () => {
    const result = calcLowest([3, 1, 4, 2], 4)
    expect(result[3]).toBe(1)
    for (let i = 0; i < 3; i++) expect(result[i]).toBeNull()
  })

  it('period larger than data returns all nulls', () => {
    expect(calcLowest([1, 2], 5)).toEqual([null, null])
  })

  it('empty array returns empty array', () => {
    expect(calcLowest([], 3)).toEqual([])
  })
})
