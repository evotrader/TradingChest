/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { KLineData } from 'klinecharts'

import { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, DatafeedRequestContext } from './types'
import { ReconnectingWebSocket } from './datafeed/ReconnectingWebSocket'


export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'failed'

/** Demo datafeed for Polygon.io. Production should proxy API calls through a backend to avoid exposing API keys. */
export default class DefaultDatafeed implements Datafeed {
  constructor (apiKey: string, options?: {
    onConnectionStateChange?: (state: ConnectionState, detail?: { attempt?: number, error?: unknown }) => void
    fetchTimeout?: number
    /** Preserve historical split-adjusted default; raw one-minute streaming requires false. */
    adjusted?: boolean
  }) {
    this._apiKey = apiKey
    this._onConnectionStateChange = options?.onConnectionStateChange ?? null
    this._fetchTimeout = options?.fetchTimeout ?? 15000
    this._adjusted = options?.adjusted ?? true
  }

  private _apiKey: string
  private _onConnectionStateChange: ((state: ConnectionState, detail?: { attempt?: number, error?: unknown }) => void) | null
  private _fetchTimeout: number

  private _adjusted: boolean
  private _authenticated = false
  private _disposed = false

  private _prevSymbolMarket?: string
  private _prevTicker?: string

  private _ws?: ReconnectingWebSocket

  private _callback?: DatafeedSubscribeCallback

  async searchSymbols (search?: string): Promise<SymbolInfo[]> {
    try {
      const response = await fetch(
        `https://api.polygon.io/v3/reference/tickers?apiKey=${this._apiKey}&active=true&search=${encodeURIComponent(search ?? '')}`,
        { signal: AbortSignal.timeout(this._fetchTimeout) }
      )
      if (!response.ok) {
        console.warn(`searchSymbols failed: ${response.status} ${response.statusText}`)
        return []
      }
      const result = await response.json()
      return (result.results || []).map((data: Record<string, string>) => ({
        ticker: data.ticker,
        name: data.name,
        shortName: data.ticker,
        market: data.market,
        exchange: data.primary_exchange,
        priceCurrency: data.currency_name,
        type: data.type,
        logo: 'data:image/png;base64,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'
      }))
    } catch (e) {
      console.warn('searchSymbols error:', e)
      return []
    }
  }

  async getHistoryKLineData (symbol: SymbolInfo, period: Period, from: number, to: number, context?: DatafeedRequestContext): Promise<KLineData[]> {
    if (this._disposed) throw new Error('Datafeed disposed')
    context?.signal.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort(context?.signal.reason)
    if (context?.signal.aborted) abort()
    else context?.signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => controller.abort(new DOMException('History request timed out', 'TimeoutError')), this._fetchTimeout)
    try {
      const response = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol.ticker)}/range/${period.multiplier}/${period.timespan}/${from}/${to}?adjusted=${this._adjusted}&sort=asc&apiKey=${this._apiKey}`,
        { signal: controller.signal }
      )
      if (!response.ok) {
        throw new Error(`Historical data HTTP ${response.status}`)
      }
      const result = await response.json()
      if (!result || result.results === undefined && result.status !== 'OK' || result.status === 'ERROR' || result.status === 'NOT_AUTHORIZED' ||
          result.results !== undefined && !Array.isArray(result.results)) throw new Error('Invalid historical data response')
      if (result.next_url) throw new Error('History response is paginated; narrow the range or use a paginating provider')
      const bars = (result.results ?? []).map((data: Record<string, number>) => ({
        timestamp: data.t,
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c,
        volume: data.v,
        // Provider VWAP is a price, not turnover. Never mislabel it as traded amount.
        providerVwap: Number.isFinite(data.vw) ? data.vw : undefined
      }))
      if (bars.some((bar: KLineData) => ![bar.timestamp,bar.open,bar.high,bar.low,bar.close].every(Number.isFinite) ||
          bar.high < Math.max(bar.open,bar.close,bar.low) || bar.low > Math.min(bar.open,bar.close) ||
          bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0))) throw new Error('Invalid historical OHLCV')
      return [...new Map<number,KLineData>(bars.map((bar: KLineData) => [bar.timestamp,bar])).values()].sort((a,b)=>a.timestamp-b.timestamp)
    } catch (e) {
      throw e
    } finally {
      clearTimeout(timeout)
      context?.signal.removeEventListener('abort', abort)
    }
  }

  subscribe (symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    if (this._disposed) throw new Error('Datafeed disposed')
    // This demo has no multi-period/calendar aggregator. Refuse to mix raw minute bars into other series.
    if (symbol.market !== 'stocks' || period.timespan !== 'minute' || period.multiplier !== 1 || this._adjusted) {
      this._callback = undefined
      this._ws?.close()
      this._ws = undefined
      this._authenticated = false
      this._onConnectionStateChange?.('failed', {error:'Streaming supports only stocks / 1 minute / adjusted:false; other series remain history-only'})
      return
    }
    const oldTicker = this._prevTicker
    this._prevSymbolMarket = symbol.market
    this._prevTicker = symbol.ticker
    this._callback = callback
    if (this._ws) {
      if (this._authenticated) {
        if (oldTicker && oldTicker !== symbol.ticker) this._ws.send(JSON.stringify({action:'unsubscribe',params:`AM.${oldTicker}`}))
        this._ws.send(JSON.stringify({action:'subscribe',params:`AM.${symbol.ticker}`}))
      }
      return
    }
    const socket = new ReconnectingWebSocket('wss://delayed.polygon.io/stocks', {maxRetries:5,baseDelay:1000,maxDelay:30000})
    this._ws = socket
    socket.onopen = () => {
      if (this._ws !== socket || this._disposed) return
      this._authenticated = false
      socket.send(JSON.stringify({action:'auth',params:this._apiKey}))
    }
    socket.onerror = () => { if (this._ws === socket) this._onConnectionStateChange?.('disconnected',{error:'WebSocket error'}) }
    socket.onclose = () => {
      if (this._ws !== socket) return
      this._authenticated = false
      this._onConnectionStateChange?.('disconnected')
    }
    socket.onreconnect = attempt => { if (this._ws === socket) this._onConnectionStateChange?.('reconnecting',{attempt}) }
    socket.onmessage = event => {
      if (this._ws !== socket || this._disposed) return
      let messages: unknown
      try { messages = JSON.parse(event.data) } catch { this._onConnectionStateChange?.('failed',{error:'Invalid stream JSON'}); return }
      if (!Array.isArray(messages)) return
      for (const d of messages) {
        if (!d || typeof d !== 'object') continue
        if (d.ev === 'status') {
          if (d.status === 'auth_success') {
            this._authenticated = true
            this._onConnectionStateChange?.('connected')
            if (this._callback && this._prevTicker) socket.send(JSON.stringify({action:'subscribe',params:`AM.${this._prevTicker}`}))
          } else if (d.status === 'auth_failed' || d.status === 'error') {
            this._authenticated = false
            this._onConnectionStateChange?.('failed',{error:d.message ?? d.status})
          }
          continue
        }
        if (!this._authenticated || d.ev !== 'AM' || d.sym !== this._prevTicker) continue
        if (![d.s,d.o,d.h,d.l,d.c,d.v].every(Number.isFinite) || d.v < 0 ||
            d.h < Math.max(d.o,d.c,d.l) || d.l > Math.min(d.o,d.c)) {
          this._onConnectionStateChange?.('failed',{error:'Invalid stream OHLCV'})
          continue
        }
        this._callback?.({timestamp:d.s,open:d.o,high:d.h,low:d.l,close:d.c,volume:d.v,
          providerVwap:Number.isFinite(d.vw)?d.vw:undefined})
      }
    }
  }

  unsubscribe(symbol: SymbolInfo, _period: Period): void {
    if (symbol.ticker !== this._prevTicker || symbol.market !== this._prevSymbolMarket) return
    this._callback = undefined
    if (this._authenticated) this._ws?.send(JSON.stringify({action:'unsubscribe',params:`AM.${symbol.ticker}`}))
  }

  dispose(): void {
    this._disposed = true
    this._callback = undefined
    this._authenticated = false
    const socket = this._ws
    this._ws = undefined
    socket?.close()
  }
}
