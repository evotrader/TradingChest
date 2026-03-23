# TradingChest Deep Audit Fix — Design Spec

**Date**: 2026-03-23
**Scope**: Full fix of 25 audit findings + test coverage gaps
**Strategy**: 3 sequential feature branches by severity dimension

---

## Branch 1: `fix/critical-bugs` — Core Defect Fixes

**Scope**: C1-C5 + H1-H5 (10 issues)
**Goal**: Eliminate all memory leaks, XSS vectors, calculation bugs, dead code connections, and async error handling gaps.

### 1.1 KLineChartPro.dispose() + Resource Cleanup (C1, C2)

**KLineChartPro.tsx**:
- Store `render()` return value: `this._solidDispose = render(...)`
- Store click listener reference + bound element for later `removeEventListener`
- Store `MutationObserver` reference
- Add `dispose()` method that cleans up in order:
  1. Stop and dispose replay engine
  2. Clear alert manager
  3. Unbind shortcut manager
  4. Remove click event listener from widget element
  5. Disconnect MutationObserver
  6. Call `this._solidDispose()`
  7. Remove container CSS class

**shortcut/index.ts**:
- `bindTo()`: save `this._element` reference
- `unbind()`: call `this._element.removeEventListener('keydown', this.handler)` then null both references

**Cleanup path**: `KLineChartPro.dispose()` is the sole cleanup entry point. The `ChartProComponent`'s `onCleanup` handles internal klinecharts disposal (`dispose(widgetRef!)`), while the outer `KLineChartPro.dispose()` handles everything it owns (shortcuts, click listener, observer, Solid unmount). Consumers must call `chartPro.dispose()` when destroying the chart. This will be documented in the `dispose()` JSDoc.

### 1.2 adjustFromTo Calculation Fix (C3)

**core/adjustFromTo.ts** — all three broken cases need distinct fixes:

- **`week`** (lines 47-55):
  - Line 51: `to - dif * 60 * 60 * 24` → `to - dif * 60 * 60 * 24 * 1000` (missing ms conversion)
  - Line 54: `from = count * ...` is an absolute value, not an offset. Fix: `from = to - count * period.multiplier * 7 * 24 * 60 * 60 * 1000`

- **`month`** (lines 57-65): Complete rewrite needed. The current code computes `from` as an absolute ms value then treats it as a Date — fundamentally broken. Fix: use `Date` arithmetic from `to`:
  ```
  const d = new Date(to); d.setMonth(d.getMonth() - count * period.multiplier); from = d.getTime()
  ```
  Calendar-aware subtraction handles variable month lengths and leap years correctly.

- **`year`** (lines 67-74): Same structural bug. Fix with `Date` arithmetic:
  ```
  const d = new Date(to); d.setFullYear(d.getFullYear() - count * period.multiplier); from = d.getTime()
  ```
  Not a fixed 365-day multiplier (leap year safe).

- Add unit tests for all week/month/year branches with known expected values

### 1.3 Async Error Handling + Loading Signal (C4, C5)

**ChartProComponent.tsx**:
- `let loading = false` → `const [loading, setLoading] = createSignal(false)`
- All reads of `loading` → `loading()`
- `onMount` async IIFE: add `.catch(e => console.error('[TradingChest] indicator init failed:', e))`
- `loadMore` `get()`: add `.catch()` + `finally { setLoading(false) }`
- `createEffect` data fetch: wrap in try/catch + finally

**indicator/registry.ts**:
- `ensureRegistered`: if loader rejects, remove from `_pending` map so retry is possible

### 1.4 XSS Fix (H1, H2)

**ChartProComponent.tsx**:
- Line 207: `watermark.innerHTML = str` → `watermark.textContent = str`
- Line 297: `priceUnitDom.innerHTML = ...` → `priceUnitDom.textContent = ...`

### 1.5 WebSocket Message Validation (H3)

**DefaultDatafeed.ts**:
- Wrap `JSON.parse(event.data)` in try/catch (log warning on parse failure, return)
- Validate `result` is Array and `result.length > 0`
- Validate numeric fields (`result.s`, `result.o`, `result.h`, `result.l`, `result.c`, `result.v`) are typeof number

### 1.6 Connect AlertManager (H4)

**KLineChartPro.tsx**:
- In `startReplay` `onBarUpdate` callback: call `this._alertManager.checkPrice(bar.close)`
- Add `feedPrice(price: number): void` public method that calls `this._alertManager.checkPrice(price)`
- Add `feedPrice` to `ChartPro` interface in `types.ts`
- **Live path**: Document in JSDoc that consumers using a custom `Datafeed` should call `chartPro.feedPrice(latestClose)` from their `subscribe` callback to enable alert checking during live trading. The `DefaultDatafeed` will be updated to call `feedPrice` internally from its `onmessage` handler if a reference to the chart is available (via a `setChart(chart)` setter or constructor option).

### 1.7 Connect IndicatorClickDetector (H5)

**indicator/trade/tradeVisualization.ts**:
- Remove `globalThis.__tradeVisHitTargets` usage
- `extendData` shape changes from `TradeRecord[]` to `{ trades: TradeRecord[], clickDetector: IndicatorClickDetector }` — **breaking change** to the indicator's data contract
- In `calc`: read trades from `indicator.extendData?.trades` (was `indicator.extendData as TradeRecord[]`)
- In `draw` callback: read detector from `indicator.extendData?.clickDetector` (note: this is an **indicator**, not overlay — uses `indicator.extendData`, not `overlay.extendData`)

**KLineChartPro.tsx**:
- When creating tradeVisualization indicator, pass `extendData: { trades: [...], clickDetector: this._clickDetector }`
- Update any existing callers that pass `TradeRecord[]` directly to use the new shape

---

## Branch 2: `fix/quality-perf` — Quality & Performance

**Scope**: H6-H8 + M1-M8, M10, M12 (13 issues)
**Goal**: Improve type safety, eliminate dead code, optimize rendering, reduce bundle size.

**Not addressed in this branch**:
- M9 (TradeVisualization O(n*m)): Partially mitigated by Branch 1's click detector refactor (1.7). Full optimization (binary search index) deferred — low urgency given typical trade count < 100.
- M11 (ChartProComponent 500+ lines): Already partially addressed in Phase 1 (adjustFromTo, buildStyles extraction). Further decomposition deferred — diminishing returns without a larger architectural refactor.

### 2.1 Type Safety (H6, H7)

- Audit and fix 29 `@ts-expect-error` — most fixable via correct type assertions or klinecharts type augmentation
- Narrow key `any` types:
  - `IndicatorClickEvent.data: any` → `TradeHitData` interface
  - `buildStyles` return → `DeepPartial<OverlayStyle>`
  - `DefaultDatafeed` API responses → `PolygonTickerResult` / `PolygonAggResult` interfaces
  - `CalcFn` → generic `CalcFn<T>`
- Leave indicator-internal `any` alone (klinecharts type system limitation)

### 2.2 API Key Security + URL Encoding (H8)

**DefaultDatafeed.ts**:
- Apply `encodeURIComponent()` to `search`, `symbol.ticker`
- Add JSDoc: "Demo implementation. Production should proxy API calls through a backend."

### 2.3 Dead Code Cleanup (M1)

- **DataCache**: Add LRU eviction (maxEntries default 30), integrate into `DefaultDatafeed.getHistoryKLineData` as cache layer
- **UndoRedoManager**: Delete the dead code (`src/shortcut/undoRedo.ts`). Undo/redo for overlay operations is a non-trivial feature requiring mutation interception and inverse-operation design — this belongs in a dedicated feature branch, not a cleanup task. Remove the `chart:undo` / `chart:redo` entries from `defaultBindings.ts` to avoid dead shortcut bindings.

### 2.4 Comparison Fixes (M2, M3, M4)

**KLineChartPro.tsx**:
- Timestamp matching: ±60000ms tolerance (1 minute)
- `removeComparison`: add comment documenting klinecharts global registry limitation
- Mark incremental update as known limitation in JSDoc (requires second symbol subscription)

### 2.5 Rendering Performance (M5, M6)

**ChartProComponent.tsx**:
- Merge theme effect's two `setStyles()` calls into one: build icon config first, merge into theme styles, single `setStyles()` call
- Move `lodashClone(widget!.getStyles())` to initialization only (not inside `createEffect`)

### 2.6 MutationObserver Timeout (M7)

**KLineChartPro.tsx**:
- Add 3-second `setTimeout` → `observer.disconnect()` as safety net
- Store the timeout ID as `this._observerTimeoutId`
- In `dispose()`: call `clearTimeout(this._observerTimeoutId)` before disconnecting the observer (avoid dangling timer)

### 2.7 lodash Replacement (M8)

- `lodash/cloneDeep` → `structuredClone()` (all target browsers support it). **Prerequisite**: audit all `lodashClone` call sites to confirm no function-valued or class-instance properties exist in the cloned objects. KLineChart's `Styles` object is plain data (colors, sizes), so `structuredClone` should work. If any call site clones objects with functions, keep `lodash/cloneDeep` for that specific site.
- `lodash/set` → custom `deepSet(obj, path, value)` in `src/core/deepSet.ts` (~15 lines)
- Remove `lodash` from `package.json` dependencies

### 2.8 incrementalCalc Optimization (M10)

- `[...cached.slice(0, startIdx), ...tailResult]` → `cached.length = startIdx; cached.push(...tailResult)` (in-place mutation)

### 2.9 Dependency Updates (M12)

- Patch/minor updates only: `vitest`, `@solidjs/testing-library`
- Add `"engines"` field to package.json
- Major upgrades (Vite 4→6, TS 4→5) deferred to separate branch

---

## Branch 3: `fix/test-coverage` — Test Coverage

**Scope**: Zero-coverage modules + weak coverage edge cases + integration tests
**Goal**: Bring all critical code paths under test.
**Dependency**: Branch 3 depends on artifacts from Branch 1 (adjustFromTo fix, registry error handling) and Branch 2 (deepSet utility, DataCache LRU). Must be executed after both merge to main.

### 3.1 New Test Files — Zero Coverage Core Modules

| Test File | Target | Key Cases |
|-----------|--------|-----------|
| `indicator/utils/__tests__/utils.test.ts` | 12 math functions | Empty array, single element, known results, NaN input |
| `datafeed/__tests__/ReconnectingWebSocket.test.ts` | **Rewrite** to test the real class | Connect success resets retry, exponential backoff on disconnect, maxRetries stops, disposed no reconnect, send on non-OPEN silent |
| `datafeed/__tests__/DataCache.test.ts` | get/set/append/delete/clear + LRU | Append dedup, append sort, LRU eviction, empty append |
| ~~`shortcut/__tests__/undoRedo.test.ts`~~ | ~~UndoRedoManager~~ | Removed: UndoRedoManager deleted in Branch 2 |
| `export/__tests__/export.test.ts` | exportToCSV, exportAllToCSV, exportScreenshot | Mock Chart + DOM, CSV content format, Blob creation, empty data |

### 3.2 Edge Case Additions — Weak Coverage Modules

| Test File | Added Cases |
|-----------|-------------|
| `core/__tests__/adjustFromTo.test.ts` | week/month/year all branches, multiplier > 1, verify corrected results |
| `alert/__tests__/alert.test.ts` | `below` condition, `resetAll()`, already-triggered idempotency, exact equality boundary, multiple alerts same price |
| `replay/__tests__/ReplayEngine.test.ts` | `goToPosition(0/-1/overflow)`, `stepForward` at end, `play()` twice, `dispose()` while playing |
| `compare/__tests__/compare.test.ts` | `basePrice === 0`, single-element array |
| `indicator/__tests__/registry.test.ts` | Loader rejection clears `_pending` cache |
| `indicator/__tests__/superTrend.test.ts` | Trend reversal dataset, extreme multiplier |

### 3.3 New Module Tests

| Test File | Target |
|-----------|--------|
| `core/__tests__/deepSet.test.ts` | deepSet utility from Branch 2 |
| `i18n/__tests__/i18n.test.ts` | Missing key fallback, `load()` override, unknown locale |
| `widget/timezone-modal/__tests__/data.test.ts` | `translateTimezone` all 18 switch branches |

### 3.4 Integration Tests

| Test File | Scenario |
|-----------|----------|
| `__tests__/integration/replay-data-flow.test.ts` | ReplayEngine onDataChange + onBarUpdate callback sequence matches fullData |
| `__tests__/integration/alert-price-stream.test.ts` | Simulated tick stream through checkPrice, crossing/above/below each fires once only |

### 3.5 Fix Test Anti-Patterns

- `ReconnectingWebSocket.test.ts`: Complete rewrite (current tests only test the interface, not the class)
- `shortcut.test.ts`: Replace `toBeGreaterThanOrEqual(1)` with exact assertion; add unbind-then-dispatch test
- `superTrend.test.ts`: Add reversal dataset

---

## Execution Order

```
main ← fix/critical-bugs ← fix/quality-perf ← fix/test-coverage
```

Each branch merges to main before the next starts. This ensures:
- Critical fixes land first and are independently rollbackable
- Quality/perf changes build on stable foundation
- Tests validate both the original code and the fixes from branches 1-2

## Out of Scope

- Major dependency upgrades (Vite 4→6, TypeScript 4→5) — separate branch
- Multi-chart layout feature (P1 from original roadmap)
- Scripting engine (P3 from original roadmap)
- `solid-js` → peerDependency migration (breaking change for consumers)
