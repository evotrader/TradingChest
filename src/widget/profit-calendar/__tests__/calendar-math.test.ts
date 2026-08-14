import { describe, expect, it } from 'vitest'
import {
  columnIndexForDate,
  layoutCalendarGrid,
  moveFocus,
} from '../calendar-math'
import type { ProfitCalendarCell } from '../types'

function cell (id: string, sessionDate: string): ProfitCalendarCell {
  return {
    id,
    sessionDate,
    sessionStatus: 'final',
    calculationStatus: 'ready',
    value: 1,
    displayValue: '+1.00',
    intensity: 1,
  }
}

describe('calendar-math layout only', () => {
  it('maps weekdays for 5-column grids without inventing weekend cells', () => {
    // 2026-01-05 is Monday
    expect(columnIndexForDate('2026-01-05', 5)).toBe(0)
    expect(columnIndexForDate('2026-01-09', 5)).toBe(4)
    expect(columnIndexForDate('2026-01-10', 5)).toBeNull()
  })

  it('places only supplied cells and leaves holes null', () => {
    const rows = layoutCalendarGrid([
      cell('a', '2026-01-05'),
      cell('c', '2026-01-07'),
    ], 5)
    expect(rows).toHaveLength(1)
    expect(rows[0].cells[0]?.id).toBe('a')
    expect(rows[0].cells[1]).toBeNull()
    expect(rows[0].cells[2]?.id).toBe('c')
    expect(rows[0].cells.filter(Boolean)).toHaveLength(2)
  })

  it('moves focus with arrows without inventing cells', () => {
    const rows = layoutCalendarGrid([
      cell('a', '2026-01-05'),
      cell('b', '2026-01-06'),
      cell('c', '2026-01-07'),
    ], 5)
    expect(moveFocus(rows, 'a', 'ArrowRight', 5)?.id).toBe('b')
    expect(moveFocus(rows, 'b', 'ArrowLeft', 5)?.id).toBe('a')
    expect(moveFocus(rows, 'a', 'ArrowLeft', 5)?.id).toBe('a')
  })
})
