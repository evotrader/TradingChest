import { KLineData } from 'klinecharts'
import { ReplayState, ReplaySpeed, ReplayCallbacks } from './types'

const BASE_INTERVAL = 1000

export class ReplayEngine {
  private _fullData: KLineData[] = []
  private _position = 0
  private _playing = false
  private _speed: ReplaySpeed = 1
  private _active = false
  private _timer: ReturnType<typeof setInterval> | null = null
  private _callbacks: ReplayCallbacks

  constructor(callbacks: ReplayCallbacks) {
    this._callbacks = callbacks
  }

  start(data: KLineData[], startPosition: number): void {
    this._fullData = data
    this._position = Math.max(1, Math.min(startPosition, data.length))
    this._active = true
    this._playing = false
    this._speed = 1
    this._stopTimer()
    this._callbacks.onDataChange(this._fullData.slice(0, this._position))
    this._emitState()
  }

  stop(): void {
    this._stopTimer()
    this._active = false
    this._playing = false
    this._emitState()
  }

  stepForward(): void {
    if (!this._active || this._position >= this._fullData.length) return
    this._position++
    this._callbacks.onBarUpdate(this._fullData[this._position - 1])
    this._emitState()
  }

  stepBackward(): void {
    if (!this._active || this._position <= 1) return
    this._position--
    this._callbacks.onDataChange(this._fullData.slice(0, this._position))
    this._emitState()
  }

  play(): void {
    if (!this._active || this._playing) return
    this._playing = true
    this._startTimer()
    this._emitState()
  }

  pause(): void {
    this._playing = false
    this._stopTimer()
    this._emitState()
  }

  setSpeed(speed: ReplaySpeed): void {
    this._speed = speed
    if (this._playing) {
      this._stopTimer()
      this._startTimer()
    }
    this._emitState()
  }

  goToPosition(position: number): void {
    if (!this._active) return
    this._position = Math.max(1, Math.min(position, this._fullData.length))
    this._callbacks.onDataChange(this._fullData.slice(0, this._position))
    this._emitState()
  }

  getState(): ReplayState {
    return {
      active: this._active,
      playing: this._playing,
      speed: this._speed,
      position: this._position,
      totalBars: this._fullData.length,
    }
  }

  dispose(): void {
    this._stopTimer()
    this._fullData = []
  }

  private _startTimer(): void {
    const interval = BASE_INTERVAL / this._speed
    this._timer = setInterval(() => {
      if (this._position >= this._fullData.length) {
        this.pause()
        return
      }
      this.stepForward()
    }, interval)
  }

  private _stopTimer(): void {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  private _emitState(): void {
    this._callbacks.onStateChange(this.getState())
  }
}
