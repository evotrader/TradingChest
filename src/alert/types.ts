export interface AlertConfig {
  id: string
  price: number
  condition: 'crossing' | 'above' | 'below'
  message?: string
  color?: string
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  triggered?: boolean
}

export interface AlertEvent {
  alert: AlertConfig
  triggerPrice: number
  timestamp: number
}
