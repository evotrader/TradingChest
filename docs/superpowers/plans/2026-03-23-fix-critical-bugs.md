# fix/critical-bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical and High severity audit findings — memory leaks, XSS, calculation bugs, async errors, dead code connections.

**Architecture:** 7 fix tasks targeting specific files. Tasks 1-3 fix resource lifecycle bugs, Task 4 fixes calculation correctness, Task 5 fixes async/reactivity, Tasks 6-7 fix security and dead code connections. **Dependency: Task 1 must complete before Task 2** (dispose() relies on fixed unbind()).

**Tech Stack:** TypeScript, Solid.js 1.6, KLineChart 9.x, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/shortcut/index.ts` | Fix unbind() to actually remove event listener |
| Modify | `src/shortcut/__tests__/shortcut.test.ts` | Add unbind verification tests |
| Modify | `src/KLineChartPro.tsx` | Add dispose(), store cleanup refs, connect AlertManager + ClickDetector |
| Modify | `src/types.ts` | Add dispose() + feedPrice() to ChartPro interface |
| Modify | `src/core/adjustFromTo.ts` | Fix week/month/year calculation bugs |
| Modify | `src/core/__tests__/adjustFromTo.test.ts` | Add week/month/year tests |
| Modify | `src/ChartProComponent.tsx` | Fix loading signal, async errors, XSS |
| Modify | `src/indicator/registry.ts` | Clear _pending on loader rejection |
| Modify | `src/indicator/__tests__/registry.test.ts` | Test rejection cleanup |
| Modify | `src/DefaultDatafeed.ts` | WebSocket message validation |
| Modify | `src/indicator/trade/tradeVisualization.ts` | Replace globalThis with extendData injection |
| Modify | `src/alert/index.ts` | Add checkPrice timestamp default |

---

### Task 1: Fix KeyboardShortcutManager.unbind() — Actually Remove Event Listener

**Files:**
- Modify: `src/shortcut/index.ts:7-121`
- Test: `src/shortcut/__tests__/shortcut.test.ts`

- [ ] **Step 1: Write failing test — unbind removes listener**

Add to `src/shortcut/__tests__/shortcut.test.ts` inside the `unbind` describe block:

```typescript
it('unbind 后 dispatch 事件不触发 handler', () => {
  const mgr = new KeyboardShortcutManager()
  const handler = vi.fn()
  mgr.registerAction('chart:cancelDraw', handler)

  const el = document.createElement('div')
  mgr.bindTo(el)

  // Before unbind: handler fires
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(handler).toHaveBeenCalledTimes(1)

  mgr.unbind()

  // After unbind: handler should NOT fire
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(handler).toHaveBeenCalledTimes(1) // still 1, not 2
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shortcut/__tests__/shortcut.test.ts -t "unbind 后 dispatch 事件不触发 handler"`
Expected: FAIL — handler called 2 times because `unbind()` doesn't remove the listener

- [ ] **Step 3: Implement the fix**

In `src/shortcut/index.ts`, add a private field to store the element, and fix `unbind()`:

Replace lines 8-11:
```typescript
  private bindings: ShortcutBinding[]
  private handler: ((e: KeyboardEvent) => void) | null = null
  private actionHandlers: Map<string, () => void> = new Map()
  private enabled: boolean = true
```
with:
```typescript
  private bindings: ShortcutBinding[]
  private handler: ((e: KeyboardEvent) => void) | null = null
  private element: HTMLElement | Window | null = null
  private actionHandlers: Map<string, () => void> = new Map()
  private enabled: boolean = true
```

Replace the `bindTo` method (lines 89-112):
```typescript
  bindTo(element: HTMLElement | Window): void {
    this.unbind()
    this.element = element
    this.handler = (e: KeyboardEvent) => {
      if (!this.enabled) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const combo = this.eventToCombo(e)
      if (!combo) return
      const binding = this.bindings.find(b => b.combo === combo)
      if (binding) {
        const handler = this.actionHandlers.get(binding.action)
        if (handler) {
          e.preventDefault()
          e.stopPropagation()
          handler()
        }
      }
    }
    element.addEventListener('keydown', this.handler as EventListener)
  }
```

Replace the `unbind` method (lines 117-121):
```typescript
  unbind(): void {
    if (this.handler && this.element) {
      this.element.removeEventListener('keydown', this.handler as EventListener)
    }
    this.handler = null
    this.element = null
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shortcut/__tests__/shortcut.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/shortcut/index.ts src/shortcut/__tests__/shortcut.test.ts
git commit -m "fix: KeyboardShortcutManager.unbind() now removes event listener

Store element reference in bindTo(), call removeEventListener in unbind().
Fixes memory leak where keydown listeners accumulated on rebind."
```

---

### Task 2: Add KLineChartPro.dispose() — Full Resource Cleanup

**Files:**
- Modify: `src/KLineChartPro.tsx:39-337`
- Modify: `src/types.ts:77-116`

- [ ] **Step 1: Add `dispose()` and `feedPrice()` to ChartPro interface**

In `src/types.ts`, add before the closing `}` of the `ChartPro` interface (before line 116):

```typescript
  /** 向报警系统传入最新价格（实时数据到达时调用） */
  feedPrice(price: number): void
  /** 销毁图表实例，释放所有资源。调用后实例不可再使用。 */
  dispose(): void
```

- [ ] **Step 2: Implement dispose() in KLineChartPro**

In `src/KLineChartPro.tsx`, add new private fields after line 171:

```typescript
  private _solidDispose: (() => void) | null = null
  private _clickHandler: ((e: Event) => void) | null = null
  private _clickTarget: Element | null = null
  private _observer: MutationObserver | null = null
  private _observerTimeoutId: ReturnType<typeof setTimeout> | null = null
```

Modify the constructor to capture the render() return value. Replace lines 52-84:
```typescript
    this._solidDispose = render(
      () => (
        <ChartProComponent
          ref={(chart: ChartPro) => { this._chartApi = chart }}
          styles={options.styles ?? {}}
          watermark={options.watermark ?? (Logo as Node)}
          theme={options.theme ?? 'light'}
          locale={options.locale ?? 'zh-CN'}
          drawingBarVisible={options.drawingBarVisible ?? true}
          symbol={options.symbol}
          period={options.period}
          periods={
            options.periods ?? [
              { multiplier: 1, timespan: 'minute', text: '1m' },
              { multiplier: 5, timespan: 'minute', text: '5m' },
              { multiplier: 15, timespan: 'minute', text: '15m' },
              { multiplier: 1, timespan: 'hour', text: '1H' },
              { multiplier: 2, timespan: 'hour', text: '2H' },
              { multiplier: 4, timespan: 'hour', text: '4H' },
              { multiplier: 1, timespan: 'day', text: 'D' },
              { multiplier: 1, timespan: 'week', text: 'W' },
              { multiplier: 1, timespan: 'month', text: 'M' },
              { multiplier: 1, timespan: 'year', text: 'Y' }
            ]
          }
          timezone={options.timezone ?? 'Asia/Shanghai'}
          mainIndicators={options.mainIndicators ?? ['MA']}
          subIndicators={options.subIndicators ?? ['VOL']}
          datafeed={options.datafeed}
          onIndicatorClick={options.onIndicatorClick ?? (() => {})}/>
      ),
      this._container
    ) as unknown as (() => void)
```

Modify `attachClickListener` (line 94-110) to store references:
```typescript
      const attachClickListener = (widgetEl: Element) => {
        this._clickTarget = widgetEl
        this._clickHandler = (e: Event) => {
          const me = e as MouseEvent
          const rect = (widgetEl as HTMLElement).getBoundingClientRect()
          const clickX = me.clientX - rect.left
          const clickY = me.clientY - rect.top
          const closest = detector.findClosest(clickX, clickY, 40)
          if (closest) {
            onIndClick({
              indicatorName: 'TradeVis',
              data: { ...closest.trade, type: closest.type },
              x: clickX,
              y: clickY,
            })
          }
        }
        widgetEl.addEventListener('click', this._clickHandler, true)
      }
```

Modify the MutationObserver block (lines 117-124) to store reference + timeout:
```typescript
        this._observer = new MutationObserver(() => {
          const widgetEl = container.querySelector('.klinecharts-pro-widget')
          if (widgetEl) {
            this._observer!.disconnect()
            if (this._observerTimeoutId) {
              clearTimeout(this._observerTimeoutId)
              this._observerTimeoutId = null
            }
            attachClickListener(widgetEl)
          }
        })
        this._observer.observe(container, { childList: true, subtree: true })
        // Safety timeout: disconnect observer after 3s if element never found
        this._observerTimeoutId = setTimeout(() => {
          this._observer?.disconnect()
          this._observerTimeoutId = null
        }, 3000)
```

Add the new methods after `getReplayEngine()`:

```typescript
  feedPrice (price: number): void {
    this._alertManager.checkPrice(price, Date.now())
  }

  dispose (): void {
    // 1. Stop replay
    this.stopReplay()
    // 2. Clear alerts
    this._alertManager.clearAll()
    this._alertManager.onTrigger = null
    // 3. Unbind shortcuts
    this._shortcutManager.unbind()
    // 4. Remove click listener
    if (this._clickHandler && this._clickTarget) {
      this._clickTarget.removeEventListener('click', this._clickHandler, true)
      this._clickHandler = null
      this._clickTarget = null
    }
    // 5. Disconnect observer
    if (this._observerTimeoutId) {
      clearTimeout(this._observerTimeoutId)
      this._observerTimeoutId = null
    }
    if (this._observer) {
      this._observer.disconnect()
      this._observer = null
    }
    // 6. Unmount Solid.js render tree
    if (this._solidDispose) {
      this._solidDispose()
      this._solidDispose = null
    }
    // 7. Clean container
    this._container?.classList.remove('klinecharts-pro')
    this._container?.removeAttribute('data-theme')
    this._chartApi = null
  }
```

Also modify `startReplay` to wire alertManager (replace lines 317-321):
```typescript
    this._replayEngine = new ReplayEngine({
      onDataChange: (data) => { chart.applyNewData(data, data.length > 0) },
      onBarUpdate: (bar) => {
        chart.updateData(bar)
        this._alertManager.checkPrice(bar.close, bar.timestamp)
      },
      onStateChange: () => {}
    })
```

Also add `feedPrice` stub to `ChartProComponent.tsx` ref (inside `props.ref({...})` around line 138):
```typescript
    feedPrice: () => {},
    dispose: () => {},
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL 104 PASS (no existing tests break)

- [ ] **Step 4: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/KLineChartPro.tsx src/types.ts src/ChartProComponent.tsx
git commit -m "fix: add KLineChartPro.dispose() for full resource cleanup

Captures Solid render dispose, click listener refs, MutationObserver,
and observer timeout ID. dispose() cleans up in order: replay → alerts
→ shortcuts → click listener → observer → Solid → container.
Also wires AlertManager.checkPrice into replay onBarUpdate callback
and adds feedPrice() public method for live alert checking."
```

---

### Task 3: Fix adjustFromTo week/month/year Calculations

**Files:**
- Modify: `src/core/adjustFromTo.ts:47-75`
- Test: `src/core/__tests__/adjustFromTo.test.ts`

- [ ] **Step 1: Write failing tests for week/month/year**

Add to `src/core/__tests__/adjustFromTo.test.ts`:

```typescript
it('week 周期：to 对齐到周一，from 正确偏移', () => {
  const period = { multiplier: 1, timespan: 'week', text: 'W' }
  // 2024-01-17 Wednesday 12:00 UTC
  const to = new Date('2024-01-17T12:00:00Z').getTime()
  const [from, alignedTo] = adjustFromTo(period, to, 10)

  // to should be aligned to Monday 2024-01-15
  const alignedDate = new Date(alignedTo)
  expect(alignedDate.getUTCDay()).toBe(1) // Monday
  // from should be 10 weeks before alignedTo
  expect(from).toBeLessThan(alignedTo)
  expect(alignedTo - from).toBe(10 * 7 * 24 * 60 * 60 * 1000)
})

it('month 周期：to 对齐到月初，from 用日历减法', () => {
  const period = { multiplier: 1, timespan: 'month', text: 'M' }
  // 2024-03-15 UTC
  const to = new Date('2024-03-15T12:00:00Z').getTime()
  const [from, alignedTo] = adjustFromTo(period, to, 6)

  // to should be 2024-03-01
  const alignedDate = new Date(alignedTo)
  expect(alignedDate.getUTCDate()).toBe(1)
  expect(alignedDate.getUTCMonth()).toBe(2) // March (0-indexed)

  // from should be 6 months before: 2023-09-01
  const fromDate = new Date(from)
  expect(fromDate.getUTCFullYear()).toBe(2023)
  expect(fromDate.getUTCMonth()).toBe(8) // September
  expect(fromDate.getUTCDate()).toBe(1)
})

it('year 周期：to 对齐到年初，from 用日历减法', () => {
  const period = { multiplier: 1, timespan: 'year', text: 'Y' }
  // 2024-06-15 UTC
  const to = new Date('2024-06-15T12:00:00Z').getTime()
  const [from, alignedTo] = adjustFromTo(period, to, 5)

  // to should be 2024-01-01
  const alignedDate = new Date(alignedTo)
  expect(alignedDate.getUTCFullYear()).toBe(2024)
  expect(alignedDate.getUTCMonth()).toBe(0)
  expect(alignedDate.getUTCDate()).toBe(1)

  // from should be 5 years before: 2019-01-01
  const fromDate = new Date(from)
  expect(fromDate.getUTCFullYear()).toBe(2019)
  expect(fromDate.getUTCMonth()).toBe(0)
  expect(fromDate.getUTCDate()).toBe(1)
})

it('week 周期 multiplier > 1', () => {
  const period = { multiplier: 2, timespan: 'week', text: '2W' }
  const to = new Date('2024-01-17T12:00:00Z').getTime()
  const [from, alignedTo] = adjustFromTo(period, to, 5)
  // 5 bars * 2 weeks = 10 weeks
  expect(alignedTo - from).toBe(10 * 7 * 24 * 60 * 60 * 1000)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/__tests__/adjustFromTo.test.ts`
Expected: 4 new tests FAIL

- [ ] **Step 3: Fix the adjustFromTo implementation**

Replace the `week`, `month`, and `year` cases in `src/core/adjustFromTo.ts` (lines 47-75):

```typescript
    case 'week': {
      const date = new Date(to)
      const day = date.getUTCDay()
      const dif = day === 0 ? 6 : day - 1 // days since Monday
      to = to - dif * 24 * 60 * 60 * 1000
      const d = new Date(to)
      to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      from = to - count * period.multiplier * 7 * 24 * 60 * 60 * 1000
      break
    }
    case 'month': {
      const date = new Date(to)
      to = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
      const fromDate = new Date(to)
      fromDate.setUTCMonth(fromDate.getUTCMonth() - count * period.multiplier)
      from = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1)
      break
    }
    case 'year': {
      const date = new Date(to)
      to = Date.UTC(date.getUTCFullYear(), 0, 1)
      const fromDate = new Date(to)
      fromDate.setUTCFullYear(fromDate.getUTCFullYear() - count * period.multiplier)
      from = Date.UTC(fromDate.getUTCFullYear(), 0, 1)
      break
    }
```

Also update the existing `minute`/`hour`/`day` cases to use UTC-based `to` snapping for consistency. The `day` case line 43 should also snap to UTC midnight:

Replace lines 42-45:
```typescript
    case 'day': {
      const d = new Date(to)
      to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      from = to - count * period.multiplier * 24 * 60 * 60 * 1000
      break
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/__tests__/adjustFromTo.test.ts`
Expected: ALL PASS (old + new tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/adjustFromTo.ts src/core/__tests__/adjustFromTo.test.ts
git commit -m "fix: adjustFromTo week/month/year calculation bugs

Week: add missing *1000 ms conversion, compute from as offset not absolute.
Month: use Date.setUTCMonth for calendar-aware subtraction (handles variable month lengths).
Year: use Date.setUTCFullYear for leap-year-safe subtraction.
Day: snap to UTC midnight instead of hour boundary."
```

---

### Task 4: Fix Async Error Handling + Loading Signal

**Files:**
- Modify: `src/ChartProComponent.tsx:77,207,220-232,233-243,297,305-328`
- Modify: `src/indicator/registry.ts:47-56`
- Test: `src/indicator/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing test for registry loader rejection**

Add to `src/indicator/__tests__/registry.test.ts`:

```typescript
it('loader rejection 后清除 _pending 允许重试', async () => {
  const registry = new IndicatorRegistry()
  registry.setRegisterFn(() => {})
  let callCount = 0
  registry.setLoader('FAIL_THEN_OK', async () => {
    callCount++
    if (callCount === 1) throw new Error('network error')
    return { name: 'FAIL_THEN_OK', calc: () => [] } as any
  })

  // First call fails
  await expect(registry.ensureRegistered('FAIL_THEN_OK')).rejects.toThrow('network error')
  expect(registry.isRegistered('FAIL_THEN_OK')).toBe(false)

  // Second call should retry (not return cached rejected promise)
  await registry.ensureRegistered('FAIL_THEN_OK')
  expect(registry.isRegistered('FAIL_THEN_OK')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/indicator/__tests__/registry.test.ts -t "loader rejection"`
Expected: FAIL — second call returns the cached rejected promise

- [ ] **Step 3: Fix registry.ts — clear _pending on rejection**

In `src/indicator/registry.ts`, replace lines 47-55:

```typescript
    const promise = (async () => {
      try {
        const template = await loader()
        this._registerFn(template)
        this._registered.add(name)
      } catch (e) {
        throw e
      } finally {
        this._pending.delete(name)
      }
    })()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/indicator/__tests__/registry.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Fix ChartProComponent — loading signal + async errors + XSS**

In `src/ChartProComponent.tsx`:

**5a. Loading signal (line 77):**
Replace `let loading = false` with:
```typescript
  const [loading, setLoading] = createSignal(false)
```

**5b. All `loading` reads → `loading()`, all `loading = x` → `setLoading(x)`:**
- Line 234: `loading = true` → `setLoading(true)`
- Line 241: `loading = false` → `setLoading(false)`
- Line 306: `if (!loading)` → `if (!loading())`
- Line 312: `loading = true` → `setLoading(true)`
- Line 321: `loading = false` → `setLoading(false)`

**5c. Async error handling in onMount IIFE (lines 220-232):**
Replace with:
```typescript
    ;(async () => {
      for (const indicator of mainIndicators()) {
        await createIndicator(widget, indicator, true, { id: 'candle_pane' })
      }
      const subIndicatorMap: Record<string, string> = {}
      for (const indicator of props.subIndicators!) {
        const paneId = await createIndicator(widget, indicator, true)
        if (paneId) {
          subIndicatorMap[indicator] = paneId
        }
      }
      setSubIndicators(subIndicatorMap)
    })().catch(e => { console.error('[TradingChest] indicator init failed:', e) })
```

**5d. loadMore error handling (lines 233-244):**
Replace with:
```typescript
    widget?.loadMore(timestamp => {
      setLoading(true)
      const get = async () => {
        const p = period()
        const [to] = adjustFromTo(p, timestamp!, 1)
        const [from] = adjustFromTo(p, to, 500)
        const kLineDataList = await props.datafeed.getHistoryKLineData(symbol(), p, from, to)
        widget?.applyMoreData(kLineDataList, kLineDataList.length > 0)
      }
      get().catch(e => { console.warn('[TradingChest] loadMore failed:', e) }).finally(() => { setLoading(false) })
    })
```

**5e. Data fetch effect error handling (lines 305-328):**

**IMPORTANT**: `loading()` must NOT be called inside createEffect — it would create a reactive dependency causing infinite re-triggering. Use `untrack()` to read the signal without tracking.

Add `untrack` to the import on line 15:
```typescript
import { createSignal, createEffect, onMount, Show, onCleanup, startTransition, Component, untrack } from 'solid-js'
```

Replace the effect:
```typescript
  createEffect((prev?: PrevSymbolPeriod) => {
    if (!untrack(loading)) {
      if (prev) {
        props.datafeed.unsubscribe(prev.symbol, prev.period)
      }
      const s = symbol()
      const p = period()
      setLoading(true)
      setLoadingVisible(true)
      const get = async () => {
        const [from, to] = adjustFromTo(p, new Date().getTime(), 500)
        const kLineDataList = await props.datafeed.getHistoryKLineData(s, p, from, to)
        widget?.applyNewData(kLineDataList, kLineDataList.length > 0)
        props.datafeed.subscribe(s, p, data => {
          widget?.updateData(data)
        })
      }
      get()
        .catch(e => { console.warn('[TradingChest] data fetch failed:', e) })
        .finally(() => { setLoading(false); setLoadingVisible(false) })
      return { symbol: s, period: p }
    }
    return prev
  })
```

**5f. XSS fix (line 207):**
Replace `watermark.innerHTML = str` with `watermark.textContent = str`

**5g. XSS fix (line 297):**
Replace `priceUnitDom.innerHTML = s?.priceCurrency.toLocaleUpperCase()` with `priceUnitDom.textContent = s?.priceCurrency.toLocaleUpperCase()`

- [ ] **Step 6: Run all tests + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: ALL PASS, no type errors

- [ ] **Step 7: Commit**

```bash
git add src/ChartProComponent.tsx src/indicator/registry.ts src/indicator/__tests__/registry.test.ts
git commit -m "fix: async error handling, loading signal, XSS, registry retry

- Convert loading to createSignal for proper Solid.js reactivity
- Add .catch() to all fire-and-forget async calls
- Add .finally() to reset loading state on failure
- Replace innerHTML with textContent (2 XSS vectors)
- Clear _pending on loader rejection so retry is possible"
```

---

### Task 5: WebSocket Message Validation

**Files:**
- Modify: `src/DefaultDatafeed.ts:89-108`

- [ ] **Step 1: Add validation to onmessage handler**

In `src/DefaultDatafeed.ts`, replace the `this._ws.onmessage` block (lines 89-108):

```typescript
      this._ws.onmessage = event => {
        let result: any
        try {
          result = JSON.parse(event.data)
        } catch {
          console.warn('[TradingChest] WebSocket: invalid JSON received')
          return
        }
        if (!Array.isArray(result) || result.length === 0) return
        if (result[0].ev === 'status') {
          if (result[0].status === 'auth_success') {
            this._ws?.send(JSON.stringify({ action: 'subscribe', params: `T.${symbol.ticker}`}))
          }
        } else {
          if ('sym' in result[0]) {
            const d = result[0]
            if (typeof d.s === 'number' && typeof d.o === 'number' &&
                typeof d.h === 'number' && typeof d.l === 'number' &&
                typeof d.c === 'number') {
              callback({
                timestamp: d.s,
                open: d.o,
                high: d.h,
                low: d.l,
                close: d.c,
                volume: typeof d.v === 'number' ? d.v : 0,
                turnover: d.vw
              })
            }
          }
        }
      }
```

Note: also fix the existing bug on line 96 — the original code checks `'sym' in result` instead of `'sym' in result[0]`. The data field access was also on `result` instead of `result[0]`.

- [ ] **Step 2: Run all tests + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/DefaultDatafeed.ts
git commit -m "fix: validate WebSocket messages before processing

Wrap JSON.parse in try/catch, validate result is array,
check numeric field types before creating KLineData callback."
```

---

### Task 6: Connect IndicatorClickDetector via extendData

**Files:**
- Modify: `src/indicator/trade/tradeVisualization.ts:30-31,80-85,167-169`

- [ ] **Step 1: Update extendData contract**

In `src/indicator/trade/tradeVisualization.ts`:

Add a new interface after `BarTradeInfo` (after line 23):
```typescript
/** extendData shape for TradeVis indicator */
export interface TradeVisExtendData {
  trades: TradeRecord[]
  clickDetector?: import('../core/indicatorClickDetector').IndicatorClickDetector
}
```

Replace line 31:
```typescript
    const trades = indicator.extendData as TradeRecord[] | undefined
```
with:
```typescript
    const ext = indicator.extendData as TradeVisExtendData | TradeRecord[] | undefined
    const trades = Array.isArray(ext) ? ext : ext?.trades
```

Replace lines 84-85:
```typescript
    const trades = indicator.extendData as TradeRecord[] | undefined
    if (!trades || trades.length === 0) return false
```
with:
```typescript
    const ext = indicator.extendData as TradeVisExtendData | TradeRecord[] | undefined
    const trades = Array.isArray(ext) ? ext : ext?.trades
    const clickDetector = !Array.isArray(ext) ? ext?.clickDetector : undefined
    if (!trades || trades.length === 0) return false
```

Replace line 169 (`(globalThis as any).__tradeVisHitTargets = hitTargets`):
```typescript
    if (clickDetector) {
      clickDetector.clearTargets()
      for (const ht of hitTargets) {
        clickDetector.addTarget(ht.x, ht.y, ht.type, ht.trade)
      }
    }
```

- [ ] **Step 2: Update KLineChartPro.tsx to pass clickDetector via extendData**

Currently `KLineChartPro` does not directly create the TradeVis indicator — it is created by consumers via the klinecharts API with `extendData`. However, we need to document the new contract. In `src/KLineChartPro.tsx`, add a helper method after `getClickDetector()` (line 244):

```typescript
  /**
   * Create TradeVis indicator with click detection support.
   * Consumers should use this instead of chart.createIndicator('TradeVis', ...)
   * to get click detection wired automatically.
   */
  createTradeVisualization (trades: import('./indicator/trade/tradeVisualization').TradeRecord[], paneOptions?: any): void {
    const chart = this.getChart()
    if (!chart) return
    chart.createIndicator({
      name: 'TradeVis',
      extendData: { trades, clickDetector: this._clickDetector }
    }, true, paneOptions ?? { id: 'candle_pane' })
  }
```

Also add it to `ChartPro` interface in `src/types.ts`:
```typescript
  /** 创建交易可视化指标（自动连接点击检测） */
  createTradeVisualization(trades: any[], paneOptions?: any): void
```

And add the stub in `ChartProComponent.tsx` ref block:
```typescript
    createTradeVisualization: () => {},
```

- [ ] **Step 3: Run all tests + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/indicator/trade/tradeVisualization.ts src/KLineChartPro.tsx src/types.ts src/ChartProComponent.tsx
git commit -m "fix: replace globalThis.__tradeVisHitTargets with extendData injection

TradeVis indicator now reads clickDetector from extendData.
Supports both old TradeRecord[] and new TradeVisExtendData shape
for backwards compatibility."
```

---

### Task 7: Final Verification + Build

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build**

Run: `npx vite build`
Expected: Build succeeds, bundle size similar to previous (~311KB ES)

- [ ] **Step 4: Verify no regressions in existing exports**

Run: `grep -n 'export' src/index.ts` and verify all public API exports are intact.

- [ ] **Step 5: Commit any remaining changes if needed, then tag**

```bash
git log --oneline -10
```

Verify 5-6 commits from this branch are present.
