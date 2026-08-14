/**
 * Pure layout helpers for ProfitCalendar.
 * No domain return stitching, era linking, or missing-day fill.
 */

import type { ProfitCalendarCell } from './types'

const WEEKDAY_CN_7 = ['一', '二', '三', '四', '五', '六', '日'] as const
const WEEKDAY_CN_5 = ['一', '二', '三', '四', '五'] as const

export function defaultWeekdayLabels (columns: 5 | 7): readonly string[] {
  return columns === 5 ? WEEKDAY_CN_5 : WEEKDAY_CN_7
}

/** Parse YYYY-MM-DD into UTC noon parts (layout only). */
export function parseSessionDate (sessionDate: string): { y: number, m: number, d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

/**
 * Column index for a session date given grid width.
 * columns=5 → Mon=0 … Fri=4 (Sat/Sun map to null — caller should not supply weekend trade cells).
 * columns=7 → Mon=0 … Sun=6.
 */
export function columnIndexForDate (sessionDate: string, columns: 5 | 7): number | null {
  const parts = parseSessionDate(sessionDate)
  if (!parts) return null
  // JS: 0=Sun … 6=Sat → Mon-first index
  const jsDay = new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay()
  const monFirst = jsDay === 0 ? 6 : jsDay - 1
  if (columns === 5) {
    return monFirst <= 4 ? monFirst : null
  }
  return monFirst
}

export interface CalendarGridRow {
  /** Row key for React/Solid for each. */
  key: string
  cells: Array<ProfitCalendarCell | null>
}

/**
 * Place supplied cells into week rows without inventing missing domain days.
 * Empty slots remain null placeholders for grid alignment only.
 */
export function layoutCalendarGrid (
  cells: ReadonlyArray<ProfitCalendarCell>,
  columns: 5 | 7
): CalendarGridRow[] {
  if (cells.length === 0) return []

  const placed = cells.map((cell) => {
    const col = columnIndexForDate(cell.sessionDate, columns)
    const parts = parseSessionDate(cell.sessionDate)
    return { cell, col, parts }
  }).filter((p): p is { cell: ProfitCalendarCell, col: number, parts: { y: number, m: number, d: number } } =>
    p.col !== null && p.parts !== null
  )

  if (placed.length === 0) return []

  // Group by ISO week of year-ish using Monday epoch days
  type Bucket = { order: number, slots: Array<ProfitCalendarCell | null> }
  const buckets = new Map<number, Bucket>()

  for (const item of placed) {
    const utc = Date.UTC(item.parts.y, item.parts.m - 1, item.parts.d)
    const monFirst = item.col
    const weekStart = utc - monFirst * 86_400_000
    let bucket = buckets.get(weekStart)
    if (!bucket) {
      bucket = { order: weekStart, slots: Array.from({ length: columns }, () => null) }
      buckets.set(weekStart, bucket)
    }
    // First wins; never overwrite a supplied cell with another (caller owns uniqueness).
    if (bucket.slots[item.col] === null) {
      bucket.slots[item.col] = item.cell
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.order - b.order)
    .map((b) => ({
      key: String(b.order),
      cells: b.slots,
    }))
}

export function flattenNavigableCells (rows: CalendarGridRow[]): ProfitCalendarCell[] {
  const out: ProfitCalendarCell[] = []
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell) out.push(cell)
    }
  }
  return out
}

/**
 * Arrow-key neighbor among navigable (non-null) cells.
 * Uses visual grid position so Up/Down move by column.
 */
export function moveFocus (
  rows: CalendarGridRow[],
  currentId: string | null | undefined,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
  columns: 5 | 7
): ProfitCalendarCell | null {
  const coords: Array<{ cell: ProfitCalendarCell, r: number, c: number }> = []
  rows.forEach((row, r) => {
    row.cells.forEach((cell, c) => {
      if (cell) coords.push({ cell, r, c })
    })
  })
  if (coords.length === 0) return null

  let idx = currentId ? coords.findIndex(x => x.cell.id === currentId) : 0
  if (idx < 0) idx = 0
  const cur = coords[idx]

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const next = key === 'ArrowLeft' ? idx - 1 : idx + 1
    if (next < 0 || next >= coords.length) return coords[idx].cell
    return coords[next].cell
  }

  const targetR = key === 'ArrowUp' ? cur.r - 1 : cur.r + 1
  if (targetR < 0 || targetR >= rows.length) return cur.cell

  // Prefer same column; else nearest in that row.
  const sameCol = coords.find(x => x.r === targetR && x.c === cur.c)
  if (sameCol) return sameCol.cell
  const inRow = coords.filter(x => x.r === targetR)
  if (inRow.length === 0) return cur.cell
  inRow.sort((a, b) => Math.abs(a.c - cur.c) - Math.abs(b.c - cur.c))
  return inRow[0].cell
}

export function intensityOpacity (level: number | null | undefined): number {
  if (level === null || level === undefined) return 0.15
  const clamped = Math.max(0, Math.min(4, Math.floor(level)))
  return [0.08, 0.2, 0.35, 0.55, 0.75][clamped]
}

export function dayOfMonthLabel (sessionDate: string): string {
  const parts = parseSessionDate(sessionDate)
  return parts ? String(parts.d) : sessionDate
}
