import { KLineData } from 'klinecharts'

export type ReplaySpeed = 1 | 2 | 4 | 8 | 16

export interface ReplayState {
  active: boolean
  playing: boolean
  speed: ReplaySpeed
  position: number
  totalBars: number
}

export interface ReplayCallbacks {
  onDataChange: (data: KLineData[]) => void
  onBarUpdate: (bar: KLineData) => void
  onStateChange: (state: ReplayState) => void
}
