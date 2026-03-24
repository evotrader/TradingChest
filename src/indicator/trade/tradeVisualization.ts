/**
 * 交易可视化指标
 * calc 中将交易数据映射到每根 K 线，draw 中直接用数据索引绘制
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

export interface TradeRecord {
  entryTs: number
  exitTs: number
  entryPrice: number
  exitPrice: number
  pnl: number
  direction: 'long' | 'short'
}

interface BarTradeInfo {
  // 该 K 线是入场点
  entry?: { price: number; direction: 'long' | 'short'; pnl: number; trade: TradeRecord }
  // 该 K 线是出场点
  exit?: { price: number; direction: 'long' | 'short'; pnl: number; trade: TradeRecord }
  // 该 K 线所在的交易区间列表（用于画矩形）
  ranges?: Array<{ entryPrice: number; exitPrice: number; pnl: number; isStart: boolean; isEnd: boolean }>
}

/** extendData shape for TradeVis indicator */
export interface TradeVisExtendData {
  trades: TradeRecord[]
  /** 实例 ID，用于多图表隔离点击检测数据 */
  _instanceId?: string
}

type HitTarget = { x: number; y: number; trade: TradeRecord; type: 'entry' | 'exit' }
type BarIndex = { trade: TradeRecord; entryIdx: number; exitIdx: number }

/** Per-instance hit targets and bar indices, keyed by _instanceId (default: '_default') */
const _hitTargetsMap = new Map<string, HitTarget[]>()
const _tradeBarIndicesMap = new Map<string, BarIndex[]>()

/** Get the latest visible trade marker positions for a specific instance. */
export function getTradeVisHitTargets(instanceId?: string): ReadonlyArray<{ x: number; y: number; trade: TradeRecord; type: string }> {
  return _hitTargetsMap.get(instanceId ?? '_default') ?? []
}

/** Clean up per-instance data when a chart instance is disposed. */
export function cleanupTradeVisInstance(instanceId: string): void {
  _hitTargetsMap.delete(instanceId)
  _tradeBarIndicesMap.delete(instanceId)
}

/**
 * Binary search: find index of bar with timestamp closest to target.
 * Assumes dataList is sorted by timestamp ascending.
 * Exported for testing.
 */
export function findClosestBar(dataList: Pick<KLineData, 'timestamp'>[], targetTs: number): number {
  const n = dataList.length
  if (n === 0) return -1

  let lo = 0, hi = n - 1
  // Find first bar where timestamp >= targetTs
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (dataList[mid].timestamp < targetTs) lo = mid + 1
    else hi = mid
  }
  // Compare lo and lo-1 to find closest
  if (lo > 0 && Math.abs(dataList[lo - 1].timestamp - targetTs) <= Math.abs(dataList[lo].timestamp - targetTs)) {
    return lo - 1
  }
  return lo
}

const tradeVisualization: IndicatorTemplate = {
  name: 'TradeVis',
  shortName: 'Trades',
  calcParams: [],
  figures: [],
  calc: (dataList: KLineData[], indicator) => {
    const ext = indicator.extendData as TradeVisExtendData | TradeRecord[] | undefined
    const trades = Array.isArray(ext) ? ext : ext?.trades
    const instanceId = (!Array.isArray(ext) && ext?._instanceId) || '_default'
    if (!trades || trades.length === 0) {
      _tradeBarIndicesMap.set(instanceId, [])
      return dataList.map(() => ({}))
    }

    const entryMap = new Map<number, { price: number; direction: 'long' | 'short'; pnl: number; trade: TradeRecord }>()
    const exitMap = new Map<number, { price: number; direction: 'long' | 'short'; pnl: number; trade: TradeRecord }>()
    const rangeSet = new Map<number, Array<{ entryPrice: number; exitPrice: number; pnl: number }>>()
    const barIndices: Array<{ trade: TradeRecord; entryIdx: number; exitIdx: number }> = []

    for (const t of trades) {
      // O(log n) binary search instead of O(n) linear scan
      const entryIdx = findClosestBar(dataList, t.entryTs)
      const exitIdx = findClosestBar(dataList, t.exitTs)

      if (entryIdx >= 0) {
        entryMap.set(entryIdx, { price: t.entryPrice, direction: t.direction, pnl: t.pnl, trade: t })
      }
      if (exitIdx >= 0) {
        exitMap.set(exitIdx, { price: t.exitPrice, direction: t.direction, pnl: t.pnl, trade: t })
      }
      // 区间：标记 entryIdx 到 exitIdx 之间的所有 K 线
      if (entryIdx >= 0 && exitIdx >= 0) {
        barIndices.push({ trade: t, entryIdx, exitIdx })
        const lo = Math.min(entryIdx, exitIdx)
        const hi = Math.max(entryIdx, exitIdx)
        for (let i = lo; i <= hi; i++) {
          if (!rangeSet.has(i)) rangeSet.set(i, [])
          rangeSet.get(i)!.push({ entryPrice: t.entryPrice, exitPrice: t.exitPrice, pnl: t.pnl })
        }
      }
    }

    // Store for draw to use directly (avoids O(n*m) re-scan in draw)
    _tradeBarIndicesMap.set(instanceId, barIndices)

    return dataList.map((_, i) => {
      const info: BarTradeInfo = {}
      if (entryMap.has(i)) info.entry = entryMap.get(i)!
      if (exitMap.has(i)) info.exit = exitMap.get(i)!
      if (rangeSet.has(i)) {
        info.ranges = rangeSet.get(i)!.map(r => ({
          ...r, isStart: entryMap.has(i), isEnd: exitMap.has(i)
        }))
      }
      return info
    })
  },
  draw: ({ ctx, indicator, bounding, barSpace, xAxis, yAxis, visibleRange }) => {
    const result = indicator.result as BarTradeInfo[]
    if (!result || result.length === 0) return false

    const ext = indicator.extendData as TradeVisExtendData | TradeRecord[] | undefined
    const instanceId = (!Array.isArray(ext) && ext?._instanceId) || '_default'

    ctx.save()

    // ── 第一遍：画持仓区间矩形（使用 calc 阶段预计算的 barIndices，O(trades) 而非 O(trades*bars)） ──
    const tradeBarIndices = _tradeBarIndicesMap.get(instanceId) ?? []
    for (const { trade: t, entryIdx, exitIdx } of tradeBarIndices) {
      const isProfit = t.pnl >= 0
      const bgColor = isProfit ? 'rgba(38, 166, 154, 0.12)' : 'rgba(239, 83, 80, 0.12)'
      const borderColor = isProfit ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)'

      const x1 = xAxis.convertToPixel(entryIdx)
      const x2 = xAxis.convertToPixel(exitIdx)
      const y1 = yAxis.convertToPixel(t.entryPrice)
      const y2 = yAxis.convertToPixel(t.exitPrice)

      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const top = Math.min(y1, y2)
      const bottom = Math.max(y1, y2)

      if (right >= 0 && left <= bounding.width && bottom >= 0 && top <= bounding.height) {
        ctx.fillStyle = bgColor
        ctx.fillRect(left, top, right - left, bottom - top)
        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.strokeRect(left, top, right - left, bottom - top)
        ctx.setLineDash([])
      }
    }

    // ── 第二遍：画入场/出场标记 + 收集可见标记像素坐标用于点击检测 ──
    const hitTargets: Array<{ x: number; y: number; trade: TradeRecord; type: 'entry' | 'exit' }> = []

    for (let i = visibleRange.from; i < visibleRange.to; i++) {
      const info = result[i]
      if (!info) continue

      const barX = xAxis.convertToPixel(i)

      if (info.entry) {
        const y = yAxis.convertToPixel(info.entry.price)
        const isLong = info.entry.direction === 'long'
        const color = isLong ? 'rgba(38, 166, 154, 0.9)' : 'rgba(239, 83, 80, 0.9)'
        const label = isLong ? 'B' : 'S'
        drawLabel(ctx, barX, y, label, color)
        // trade reference is pre-stored in calc phase — no trades.find() needed
        hitTargets.push({ x: barX, y: y - 35 - 9, trade: info.entry.trade, type: 'entry' })
      }

      if (info.exit) {
        const y = yAxis.convertToPixel(info.exit.price)
        const isLong = info.exit.direction === 'long'
        const color = isLong ? 'rgba(239, 83, 80, 0.9)' : 'rgba(38, 166, 154, 0.9)'
        const label = isLong ? 'S' : 'B'
        const pnlStr = `${label} ${info.exit.pnl >= 0 ? '+' : ''}${info.exit.pnl.toFixed(0)}`
        drawLabel(ctx, barX, y, pnlStr, color)
        hitTargets.push({ x: barX, y: y - 35 - 9, trade: info.exit.trade, type: 'exit' })
      }
    }

    // Update per-instance targets (for KLineChartPro click detection)
    _hitTargetsMap.set(instanceId, hitTargets)

    ctx.restore()
    return false
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  const offset = 35

  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([2, 2])
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y - offset + 5)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.font = '11px sans-serif'
  const tw = ctx.measureText(text).width
  const w = tw + 10
  const h = 18
  const lx = x - w / 2
  const ly = y - offset - h
  const r = 3

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(lx + r, ly)
  ctx.lineTo(lx + w - r, ly)
  ctx.quadraticCurveTo(lx + w, ly, lx + w, ly + r)
  ctx.lineTo(lx + w, ly + h - r)
  ctx.quadraticCurveTo(lx + w, ly + h, lx + w - r, ly + h)
  ctx.lineTo(lx + r, ly + h)
  ctx.quadraticCurveTo(lx, ly + h, lx, ly + h - r)
  ctx.lineTo(lx, ly + r)
  ctx.quadraticCurveTo(lx, ly, lx + r, ly)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, ly + h / 2)
}

export default tradeVisualization
