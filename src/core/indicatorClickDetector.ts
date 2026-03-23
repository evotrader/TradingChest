export interface HitTarget {
  x: number
  y: number
  trade: import('../indicator/trade/tradeVisualization').TradeRecord
  type: string
}

export class IndicatorClickDetector {
  private _targets: HitTarget[] = []

  addTarget(target: HitTarget): void {
    this._targets.push(target)
  }

  clearTargets(): void {
    this._targets = []
  }

  getTargets(): readonly HitTarget[] {
    return this._targets
  }

  findClosest(clickX: number, clickY: number, maxRadius: number): HitTarget | null {
    let closest: HitTarget | null = null
    let minDist = Infinity
    for (const ht of this._targets) {
      const dx = clickX - ht.x
      const dy = clickY - ht.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < maxRadius && dist < minDist) {
        minDist = dist
        closest = ht
      }
    }
    return closest
  }
}
