import { AlertConfig, AlertEvent } from './types'

export type { AlertConfig, AlertEvent } from './types'

export class AlertManager {
  private _alerts = new Map<string, AlertConfig>()
  private _prevPrice: number | null = null

  onTrigger: ((event: AlertEvent) => void) | null = null

  addAlert(config: AlertConfig): void {
    this._alerts.set(config.id, { ...config, triggered: false })
  }

  /** 更新报警配置，保留触发状态 */
  updateAlert(id: string, updates: Partial<Omit<AlertConfig, 'id'>>): boolean {
    const existing = this._alerts.get(id)
    if (!existing) return false
    this._alerts.set(id, { ...existing, ...updates, id })
    return true
  }

  removeAlert(id: string): void {
    this._alerts.delete(id)
  }

  getAlert(id: string): AlertConfig | undefined {
    return this._alerts.get(id)
  }

  getAlerts(): AlertConfig[] {
    return Array.from(this._alerts.values())
  }

  clearAll(): void {
    this._alerts.clear()
  }

  checkPrice(currentPrice: number, timestamp: number): void {
    if (this._prevPrice === null) {
      this._prevPrice = currentPrice
      return
    }

    for (const alert of this._alerts.values()) {
      if (alert.triggered) continue

      let triggered = false
      switch (alert.condition) {
        case 'crossing':
          triggered = (this._prevPrice < alert.price && currentPrice >= alert.price) ||
                      (this._prevPrice > alert.price && currentPrice <= alert.price)
          break
        case 'above':
          triggered = this._prevPrice <= alert.price && currentPrice > alert.price
          break
        case 'below':
          triggered = this._prevPrice >= alert.price && currentPrice < alert.price
          break
      }

      if (triggered) {
        alert.triggered = true
        this.onTrigger?.({
          alert,
          triggerPrice: currentPrice,
          timestamp
        })
      }
    }

    this._prevPrice = currentPrice
  }

  /** 重置前价格记录（品种切换时调用，防止跨品种误触发） */
  resetPrevPrice(): void {
    this._prevPrice = null
  }

  resetAll(): void {
    for (const alert of this._alerts.values()) {
      alert.triggered = false
    }
  }
}
