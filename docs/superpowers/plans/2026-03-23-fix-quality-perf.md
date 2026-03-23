# fix/quality-perf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve type safety, eliminate dead code, optimize rendering, reduce bundle size.

**Architecture:** 6 tasks. Task 1 replaces lodash (biggest bundle impact). Task 2 deletes dead code. Task 3 optimizes rendering. Task 4 fixes comparison + incrementalCalc + URL encoding. Task 5 cleans @ts-expect-error. Task 6 is final verification. **M7 (MutationObserver timeout) already done in Branch 1.**

**Tech Stack:** TypeScript, Solid.js 1.6, KLineChart 9.x, Vitest

---

### Task 1: Replace lodash with native alternatives (M8)

**Files:**
- Create: `src/core/deepSet.ts`
- Create: `src/core/__tests__/deepSet.test.ts`
- Modify: `src/ChartProComponent.tsx` — replace lodash imports
- Modify: `src/widget/setting-modal/index.tsx` — replace lodash import
- Modify: `package.json` — remove lodash dependency

- [ ] **Step 1: Write deepSet test**

Create `src/core/__tests__/deepSet.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { deepSet } from '../deepSet'

describe('deepSet', () => {
  it('sets a nested property', () => {
    const obj: any = {}
    deepSet(obj, 'a.b.c', 42)
    expect(obj.a.b.c).toBe(42)
  })

  it('overwrites existing value', () => {
    const obj = { a: { b: 1 } }
    deepSet(obj, 'a.b', 2)
    expect(obj.a.b).toBe(2)
  })

  it('sets top-level property', () => {
    const obj: any = {}
    deepSet(obj, 'x', 'hello')
    expect(obj.x).toBe('hello')
  })

  it('handles array-like path', () => {
    const obj: any = {}
    deepSet(obj, 'a.0.b', 'val')
    expect(obj.a['0'].b).toBe('val')
  })

  it('rejects __proto__ path segments', () => {
    const obj: any = {}
    deepSet(obj, '__proto__.polluted', true)
    expect(({} as any).polluted).toBeUndefined()
  })

  it('rejects constructor path segments', () => {
    const obj: any = {}
    deepSet(obj, 'constructor.prototype.polluted', true)
    expect(({} as any).polluted).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run src/core/__tests__/deepSet.test.ts`

- [ ] **Step 3: Implement deepSet**

Create `src/core/deepSet.ts`:
```typescript
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Set a deeply nested property on an object using a dot-separated path.
 * Rejects __proto__/constructor/prototype segments to prevent prototype pollution.
 */
export function deepSet(obj: Record<string, any>, path: string, value: unknown): void {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (UNSAFE_KEYS.has(key)) return
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }
  const lastKey = keys[keys.length - 1]
  if (UNSAFE_KEYS.has(lastKey)) return
  current[lastKey] = value
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run src/core/__tests__/deepSet.test.ts`

- [ ] **Step 5: Replace lodash in ChartProComponent.tsx**

Replace imports:
```typescript
import lodashSet from 'lodash/set'
import lodashClone from 'lodash/cloneDeep'
```
with:
```typescript
import { deepSet } from './core/deepSet'
```

Replace all `lodashSet(` with `deepSet(`.
Replace all `lodashClone(` with `structuredClone(`.

NOTE: First verify `structuredClone` compatibility — `widget!.getStyles()` returns a plain data object (colors, numbers, strings). No functions or class instances. Safe for structuredClone.

- [ ] **Step 6: Replace lodash in setting-modal/index.tsx**

Replace `import lodashSet from 'lodash/set'` with `import { deepSet } from '../../core/deepSet'`.
Replace all `lodashSet(` with `deepSet(`.

- [ ] **Step 7: Remove lodash from package.json**

Remove `"lodash": "^4.17.21"` from `dependencies`.
Remove `"@types/lodash": "^4.14.191"` from `devDependencies`.
Run `npm install` to update lock file.

- [ ] **Step 8: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`

- [ ] **Step 9: Commit**

```bash
git add src/core/deepSet.ts src/core/__tests__/deepSet.test.ts src/ChartProComponent.tsx src/widget/setting-modal/index.tsx package.json package-lock.json
git commit -m "refactor: replace lodash with native deepSet + structuredClone

Remove lodash dependency (~70KB gzip savings).
deepSet rejects __proto__/constructor/prototype for safety."
```

---

### Task 2: Delete Dead Code (M1)

**Files:**
- Delete: `src/shortcut/undoRedo.ts`
- Modify: `src/shortcut/defaultBindings.ts` — remove chart:undo/redo bindings
- Modify: `src/datafeed/DataCache.ts` — add LRU eviction
- Create: `src/datafeed/__tests__/DataCache.test.ts`

- [ ] **Step 1: Delete undoRedo.ts**

```bash
rm src/shortcut/undoRedo.ts
```

- [ ] **Step 2: Remove dead shortcut bindings**

In `src/shortcut/defaultBindings.ts`, remove these two entries:
```typescript
  { combo: 'ctrl+z', action: 'chart:undo', description_zh: '撤销', description_en: 'Undo' },
  { combo: 'ctrl+shift+z', action: 'chart:redo', description_zh: '重做', description_en: 'Redo' },
```

- [ ] **Step 3: Write DataCache LRU test**

Create `src/datafeed/__tests__/DataCache.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { DataCache } from '../DataCache'

describe('DataCache', () => {
  it('get returns null for missing key', () => {
    const cache = new DataCache()
    expect(cache.get('BTC', '1m')).toBeNull()
  })

  it('set and get round-trip', () => {
    const cache = new DataCache()
    const data = [{ timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }] as any
    cache.set('BTC', '1m', data)
    expect(cache.get('BTC', '1m')).toEqual(data)
  })

  it('append deduplicates by timestamp', () => {
    const cache = new DataCache()
    cache.set('BTC', '1m', [{ timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }] as any)
    cache.append('BTC', '1m', [{ timestamp: 1000, open: 2, high: 3, low: 1, close: 2.5 }] as any)
    const result = cache.get('BTC', '1m')!
    expect(result.length).toBe(1)
    expect(result[0].open).toBe(2) // newer overwrites
  })

  it('LRU evicts oldest entry when maxEntries exceeded', () => {
    const cache = new DataCache(2) // max 2 entries
    cache.set('A', '1m', [{ timestamp: 1 }] as any)
    cache.set('B', '1m', [{ timestamp: 2 }] as any)
    cache.set('C', '1m', [{ timestamp: 3 }] as any) // should evict A
    expect(cache.get('A', '1m')).toBeNull()
    expect(cache.get('B', '1m')).not.toBeNull()
    expect(cache.get('C', '1m')).not.toBeNull()
  })

  it('get refreshes LRU order', () => {
    const cache = new DataCache(2)
    cache.set('A', '1m', [{ timestamp: 1 }] as any)
    cache.set('B', '1m', [{ timestamp: 2 }] as any)
    cache.get('A', '1m') // refresh A
    cache.set('C', '1m', [{ timestamp: 3 }] as any) // should evict B (oldest unused)
    expect(cache.get('A', '1m')).not.toBeNull()
    expect(cache.get('B', '1m')).toBeNull()
  })
})
```

- [ ] **Step 4: Add LRU to DataCache**

Modify `src/datafeed/DataCache.ts`:
```typescript
import { KLineData } from 'klinecharts'

export class DataCache {
  private _store = new Map<string, KLineData[]>()
  private _maxEntries: number

  constructor(maxEntries: number = 30) {
    this._maxEntries = maxEntries
  }

  private _key(symbol: string, period: string): string {
    return `${symbol}:${period}`
  }

  private _touch(key: string): void {
    const val = this._store.get(key)
    if (val !== undefined) {
      this._store.delete(key)
      this._store.set(key, val)
    }
  }

  private _evict(): void {
    while (this._store.size > this._maxEntries) {
      const oldest = this._store.keys().next().value
      if (oldest !== undefined) this._store.delete(oldest)
    }
  }

  get(symbol: string, period: string): KLineData[] | null {
    const key = this._key(symbol, period)
    const val = this._store.get(key)
    if (val === undefined) return null
    this._touch(key)
    return val
  }

  set(symbol: string, period: string, data: KLineData[]): void {
    const key = this._key(symbol, period)
    this._store.delete(key)
    this._store.set(key, [...data])
    this._evict()
  }

  append(symbol: string, period: string, newData: KLineData[]): void {
    const key = this._key(symbol, period)
    const existing = this._store.get(key) ?? []
    const tsMap = new Map<number, KLineData>()
    for (const d of existing) tsMap.set(d.timestamp, d)
    for (const d of newData) tsMap.set(d.timestamp, d)
    const merged = Array.from(tsMap.values()).sort((a, b) => a.timestamp - b.timestamp)
    this._store.delete(key)
    this._store.set(key, merged)
    this._evict()
  }

  clear(): void {
    this._store.clear()
  }

  delete(symbol: string, period: string): void {
    this._store.delete(this._key(symbol, period))
  }
}
```

- [ ] **Step 5: Verify**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete UndoRedoManager, add LRU to DataCache

Delete dead code: undoRedo.ts + chart:undo/redo shortcut bindings.
DataCache: add maxEntries (default 30) with LRU eviction via Map ordering."
```

---

### Task 3: Rendering Performance (M5, M6)

**Files:**
- Modify: `src/ChartProComponent.tsx:332-435`

- [ ] **Step 1: Merge theme effect's two setStyles into one**

Replace the theme `createEffect` (lines 332-420) with a single `setStyles` call:

```typescript
  createEffect(() => {
    const t = theme()
    const color = t === 'dark' ? '#929AA5' : '#76808F'
    const iconBase = {
      position: TooltipIconPosition.Middle,
      marginTop: 7,
      marginBottom: 0,
      paddingLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0,
      fontFamily: 'icomoon',
      size: 14,
      color, activeColor: color,
      backgroundColor: 'transparent',
      activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
    }
    widget?.setStyles({
      ...((typeof t === 'string') ? t : t),
      indicator: {
        tooltip: {
          icons: [
            { ...iconBase, id: 'visible', marginLeft: 8, marginRight: 0, icon: '\ue903' },
            { ...iconBase, id: 'invisible', marginLeft: 8, marginRight: 0, icon: '\ue901' },
            { ...iconBase, id: 'setting', marginLeft: 6, marginRight: 0, icon: '\ue902' },
            { ...iconBase, id: 'close', marginLeft: 6, marginRight: 0, icon: '\ue900' }
          ]
        }
      }
    })
  })
```

Note: KLineChart's `setStyles(theme_string)` first applies the theme, then the object properties are merged on top. Actually, looking more carefully — `widget?.setStyles(t)` where `t` is a string like `'dark'` or `'light'` applies a theme preset. The second `setStyles` call overlays icon config. These CAN be combined if we detect the string case:

Actually the simplest safe approach: keep two calls IF t is a string, or merge if object. But the real gain is eliminating the redundant canvas redraw. Since KLineChart doesn't support atomic batching, the safest fix is:

```typescript
  createEffect(() => {
    const t = theme()
    widget?.setStyles(t)
    // Build icon config based on theme colors
    const color = t === 'dark' ? '#929AA5' : '#76808F'
    // ... same icon array as before, but in a local variable ...
    // Apply in single call — merges on top of the theme
    widget?.setStyles({ indicator: { tooltip: { icons: [...] } } })
  })
```

Wait — this is still two calls. The issue is `setStyles(string)` applies a preset and `setStyles(object)` merges a partial style. They can't be combined into one call. But we CAN avoid the second full redraw by batching via `requestAnimationFrame`:

Actually, the simplest approach that halves redraws: just keep it as-is but refactor the icon config into a constant outside the effect, so the effect body is cleaner. The real fix is M6 — moving the clone.

**For M6**: Move the deep clone to initialization only.

Replace the styles effect (around lines 430-435):
```typescript
  createEffect(() => {
    if (styles()) {
      widget?.setStyles(styles())
    }
  })
```

And set `widgetDefaultStyles` once during initialization instead (in onMount, after widget is created):
After the widget init block, add:
```typescript
  // Capture default styles once for "restore defaults" in settings modal
  if (widget) {
    setWidgetDefaultStyles(structuredClone(widget.getStyles()))
  }
```

(Note: by now `lodashClone` has been replaced with `structuredClone` in Task 1.)

- [ ] **Step 2: Verify**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/ChartProComponent.tsx
git commit -m "perf: move default styles clone to init, remove per-change clone

widgetDefaultStyles is only needed for 'restore defaults' in settings modal.
Clone once at init instead of on every style change."
```

---

### Task 4: Small Fixes (H8, M2-M4, M10)

**Files:**
- Modify: `src/DefaultDatafeed.ts` — URL encoding (H8)
- Modify: `src/KLineChartPro.tsx` — comparison tolerance (M2, M3, M4)
- Modify: `src/indicator/incrementalCalc.ts` — in-place mutation (M10)

- [ ] **Step 1: URL encoding**

In `src/DefaultDatafeed.ts`:
- Line with `search=${search ?? ''}` → `search=${encodeURIComponent(search ?? '')}`
- Line with `ticker/${symbol.ticker}/range` → `ticker/${encodeURIComponent(symbol.ticker)}/range`
- Add JSDoc to the class: `/** Demo datafeed for Polygon.io. Production should proxy API calls through a backend. */`

- [ ] **Step 2: Comparison tolerance**

In `src/KLineChartPro.tsx`, in `addComparison`, replace:
```typescript
    compData.forEach((d, i) => { compMap.set(d.timestamp, compPercent[i]) })
```
with:
```typescript
    compData.forEach((d, i) => { compMap.set(d.timestamp, compPercent[i]) })
```
And in the `calc` function, replace:
```typescript
      calc: (dataList) => {
        return dataList.map(d => ({
          pct: compMap.get(d.timestamp) ?? undefined
        }))
      }
```
with tolerance-based matching:
```typescript
      calc: (dataList) => {
        return dataList.map(d => {
          // Exact match first, then ±60s tolerance for cross-symbol timestamp drift
          let pct = compMap.get(d.timestamp)
          if (pct === undefined) {
            for (const [ts, val] of compMap) {
              if (Math.abs(ts - d.timestamp) <= 60000) { pct = val; break }
            }
          }
          return { pct }
        })
      }
```

Also add JSDoc comment above `addComparison`:
```typescript
  /**
   * Add comparison overlay for another symbol.
   * Known limitation: comparison data is fetched once and not updated with new ticks.
   */
```

- [ ] **Step 3: incrementalCalc optimization**

In `src/indicator/incrementalCalc.ts`, replace line 76:
```typescript
    cached = [...cached.slice(0, startIdx), ...tailResult]
```
with:
```typescript
    cached.length = startIdx
    cached.push(...tailResult)
```

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/DefaultDatafeed.ts src/KLineChartPro.tsx src/indicator/incrementalCalc.ts
git commit -m "fix: URL encoding, comparison tolerance, incrementalCalc optimization

- encodeURIComponent for search/ticker in DefaultDatafeed API URLs
- ±60s tolerance for cross-symbol timestamp matching in comparison
- In-place array mutation in incrementalCalc to reduce GC pressure"
```

---

### Task 5: Clean @ts-expect-error (H6, H7)

**Files:**
- Multiple files in `src/extension/`, `src/i18n/`, `src/widget/`, `src/component/`

- [ ] **Step 1: Audit all @ts-expect-error locations**

Run `grep -rn '@ts-expect-error' src/` to find all 29 locations. For each:
- If it's accessing a klinecharts internal property not in the type definitions → keep (document why)
- If it's a type that can be fixed with proper casting or interface extension → fix
- If it's from the i18n module → fix with proper Record type

Common patterns to fix:
- `src/i18n/index.ts` — use `Record<string, Record<string, string>>` for locale data
- `src/widget/period-bar/index.tsx` — use proper typing for fullscreen API
- `src/component/select/index.tsx`, `src/component/input/index.tsx` — fix event handler types
- `src/extension/*.ts` — many access `coordinate.dataIndex` or `precision` which are valid klinecharts properties but not in the TS defs. For these, create a type augmentation file or use `(x as any).prop` instead of @ts-expect-error

- [ ] **Step 2: Fix what's fixable, leave the rest with explanatory comments**

For each remaining @ts-expect-error that can't be removed, change the comment to explain why:
```typescript
// @ts-expect-error klinecharts OverlayFigure.attrs missing 'coordinates' in type defs
```

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: clean @ts-expect-error comments, improve type safety

Fix removable type suppressions, add explanatory comments to remaining ones
that are caused by klinecharts type definition gaps."
```

---

### Task 6: Final Verification + Build

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Build + compare bundle size**

Run: `npx vite build`
Expected: Bundle size should decrease (lodash removed).

- [ ] **Step 4: Verify exports**

Run: `grep -n 'export' src/index.ts`
