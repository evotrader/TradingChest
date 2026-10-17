# API

## Creating chart
```typescript
new KLineChartPro(
  options: {
    container: string | HTMLElement;
    styles?: DeepPartial<Styles>;
    watermark?: string | Node;
    theme?: string;
    locale?: string;
    drawingBarVisible?: boolean;
    symbol: SymbolInfo;
    period: Period;
    periods?: Period[];
    timezone?: string;
    mainIndicators?: string[];
    subIndicators?: string[];
    datafeed: Datafeed;
  }
) => KLineChartPro
```
+ `container` Container id or container
+ `styles` Core chart styles
+ `watermark` Watermark
+ `theme` Theme
+ `locale` Language
+ `drawingBarVisible` Whether to display the drawing toolbar
+ `symbol` Symbol
+ `period` Period
+ `periods` All periods
+ `timezone` Timezone
+ `mainIndicators` Main indicators
+ `subIndicators` Sub indicators
+ `datafeed` Data access API implementation

## Chart API
### setTheme(theme)
```typescript
(theme: string) => void
```
Set theme.

### getTheme()
```typescript
() => string
```
Get theme.

### setStyles(styles)
```typescript
(styles: DeepPartial<Styles>) => void
```
Set core chart styles.

### getStyles()
```typescript
() => Styles
```
Get core chart styles.

### setLocale(locale)
```typescript
(locale: string) => void
```
Set language.

### getLocale()
```typescript
() => string
```
Get language.

### setTimezone(timezone)
```typescript
(timezone: string) => void
```
Set timezone.

### getTimezone()
```typescript
() => string
```
Get timezone.

### setSymbol(symbol)
```typescript
(symbol: SymbolInfo) => void
```
Set symbol

### getSymbol()
```typescript
() => SymbolInfo
```
Get symbol.

### setPeriod(period)
```typescript
(period: Period) => void
```
Set period.

### getPeriod()
```typescript
() => Period
```
Get period.

## Generic indicator catalog and instances

`ChartProOptions.indicatorCatalog?: IndicatorDescriptor[]` defaults to the complete built-in catalog; supplying it uses this host's explicit per-chart catalog. Global definitions contain KLineChart templates/loaders only. Parameters, results and business data belong to chart instances; avoid business data closures in templates.

```typescript
import {registerIndicatorDefinition,builtinIndicatorCatalog} from 'trading-chest/chart'
import type {IndicatorDescriptor,IndicatorParameterSchema} from 'trading-chest/chart'
import type {IndicatorTemplate} from 'klinecharts'
```

Call `registerIndicatorDefinition(name,templateOrLoader)` before creating charts. External names need a stable namespace such as `YOUR_APP/Signal`; the template name must match. Loaders return `Promise<IndicatorTemplate>`. Conflicts with built-ins or another definition fail. Multiple catalogs may reference the same registered definition; no new calculation DSL is introduced.

Descriptors contain `name/label/labels?/category/placements/parameters?`. `labels` maps locales to overrides; placements are `main`/`sub`. Parameter schemas use `{items,repeat?:{parameter,minItems,maxItems}}`. Items support number (finite/min/max/step), select (finite option set) and boolean; optional items must be trailing. Repeat counts appended parameters. The UI uses number fields, selectors and switches; parameters without a schema are read-only. Defaults come from the real template: MA has four, RSI three, and unused optional tails are not padded.

| API | Behavior |
| --- | --- |
| `getIndicatorCatalog()` | A copy of this chart's catalog |
| `addIndicator({name,placement,calcParams?})` | Promise of real `{id,name,paneId,yAxisId}`; rejects validation or lifecycle cancellation. Validates an actual parameter array, then owns placement and parameter copies throughout lazy loading |
| `getIndicators()` | Actual instances with calcParams/visible |
| `updateIndicator(id,{calcParams?,visible?})` | Updates this ID only; absent targets/invalid values fail |
| `removeIndicator(id)` | Removes this ID only |

Repeated names have independent settings, visibility and removal. Layout v3 stores names, IDs, parameters and pane/axis bindings, never descriptors/functions. Restore preflights catalog, definitions and parameters. Workspace restore stages every cell before replacement; direct restoreLayout does not promise transaction rollback.

## External analysis layers

`getAnalysisContext():AnalysisContext|null` exposes `{token,symbol,period,basis?}` only for confirmed market data. `addAnalysisLayer(context,spec)` synchronously returns a handle with `id/replaceData/setVisible/dispose`; dispose is idempotent. Duplicate IDs, stale tokens and invalid batches fail. Replacement validates/copies the complete input first; errors retain the last accepted data and emit an error state.

| spec.type | data | Alignment/gaps |
| --- | --- | --- |
| `line` / `histogram` | `{timestamp,value:number|null,availableAt?}[]` | Strictly increasing unique Unix milliseconds; exact real bar timestamps only; null/absent rows break lines; signed histograms |
| `band` | `{timestamp,lower:number|null,upper:number|null,availableAt?}[]` | Both bounds null, or finite with lower≤upper |
| `events` | `{id,timestamp,endTimestamp?,availableAt?,label,data?}[]` | Unique IDs; multiple events per timestamp; exact point/start/end anchors; unaligned events remain in the list |
| `label-series` | `{id,label,value:number|null,availableAt?}[]` | Independent ordered-label panel; preserve raw labels/values and null ordinal positions; never guess intraday times |

Every spec has `id/label` and optional `visible/color/unit`. Numeric timestamp layers require `placement:'main'|'sub'` and `valueType:'price'|'scalar'|'percent'|'amount'`. Price layers declare their own `dataBasis:string|null`; main requires two known, equal basis identifiers. Unknown values are not equal. Other quantities and unknown-basis prices use independent panes/axes. Percent means percentage points (1 = 1%); absent currencies are not inferred. Label-series is not synchronized to candle crosshairs/viewports and its horizontal spacing does not represent duration.

`analysisLayerListVisible` controls the library list. `onAnalysisLayerChange` reports id/label/type/visible/status (ready/hidden/empty/unaligned/error), unalignedCount and reason. `onAnalysisEventClick({layerId,event,timestamp})` preserves the original event time; `onAnalysisPointSelect({layerId,point})` preserves the original label point. The host opens business details. Events are read-only and do not enter drawing confirmation, Delete or Undo.

Symbol/period switches (including switching away/back) and confirmed basis changes invalidate scope. Same-identity/basis updates, prepends, revisions and successful reloads retain it. Basis prefetch retains the old context until commit. Replay exit releases the cutoff only after both main and comparison recovery succeed; failure retains bars, basis, token, layers and replay state for retry.

Replay filters timestamp and availableAt against the actual visible-prefix cutoff; absent availableAt defaults to timestamp. Ranges clip at the cutoff without future-end labels/metadata. Label-series requires real availableAt on every point; otherwise the entire layer is hidden with an explanation, including canvas/list/tooltips/clicks/counts. A source date is not a precise availability time. Hosts remain responsible for PIT and truthful availability of retrospective results.

Analysis data/visibility are excluded from v3 layouts by actual runtime indicator/pane/axis IDs. Same-scope restore retains valid layers; hosts resend data after scope changes. HTTP/WS, AbortSignal, response ordering, persistence and business calculations remain host responsibilities.

## Workspace presentation

`ChartWorkspaceOptions` adds `locale/theme/height?:number|'100%'` (default 100%; parent must supply height) and `toolbar?:{layout?,sync?,storage?,size?}`. Hiding a group only hides controls; APIs remain usable. `setLocale(locale)`, `setTheme(theme)` and `resize()` update presentation; ResizeObserver follows actual container geometry. Per-cell v3 theme/locale restore retains its existing meaning; host options own workspace chrome.

Library chrome covers Chinese/English; missing ja/ko entries fall back to English. User labels and backend errors retain their original text. Named storage is enabled only by an explicitly injected asynchronous WorkspaceStore; see the storage API below.

## Retained 0.6.0 contracts

Panes owned exclusively by transient analysis layers do not accept persistent drawings. Completing a tool gesture removes its unconfirmed preview and reports the reason before text prompts or backend writes. `commitDrawing` (including queued execution and undo/redo) and `restoreDrawings` validate targets before changes; restore preflights the whole batch. The main chart and regular indicator panes retain full drawing history and layout roundtrips. Explicit deletion of legacy objects remains available. If legacy or low-level engine drawings still target a transient pane, `captureLayout` fails explicitly and retains them; manually delete them before retrying. Backend annotations are never moved or deleted automatically.

KLineChart remains pinned to 10.1.0. `getChart()` returns the v10 engine; use string actions, filtered getIndicators/getOverlays and independent axes. `reloadData({preserveViewport:true})` reads successfully before replacing bars; failures retain confirmed bars, viewport and drawings. `applySnapshot({symbol,period,bars,basis})` goes through the single loader, including history revision and basis prefetch. `onDataState` reports confirmed basis/timestamp/replay/restoring/error; onDataReady means data applied, not a new chart object.

Layouts use captureLayout/saveLayoutV3/loadLayoutV3/restoreLayout/deleteLayoutV3/listLayoutsV3. Reads distinguish ok/missing/error. v1/v2 migrate in memory without deleting old keys; corrupt v3 does not silently fall back. Backend annotations are references, local drawings use explicit IDs; orders/trades/positions/alerts do not persist. Storage adapters belong to hosts.

`ChartWorkspace` retains 1/2/4 cells, stable cell IDs, independent providers and abortable symbol/period catalogs. All sync starts disabled, matches exact timestamps and actual time intersections, and never syncs original prices across symbols. Restore stages all cells before replacement; failure retains the current workspace and saved document.

`commitDrawing`, undoDrawing and redoDrawing share confirmed/rejected/uncertain outcomes; backend mutations require the host callback. Timeouts do not imply rejection or authorize duplicate creates. restoreDrawings is authoritative read restoration without CRUD/history. Backend IDs may change on undo-delete recreation. Only the active cell handles shortcuts; input fields retain native undo.

Comparisons use independent datafeeds/handles and a fixed first shared real timestamp, with no nearest fill or FX conversion. All return lines share a separate normal percentage axis. Revisions notify/recalculate; pan/prepend do not rebase. Replay pauses providers and clips to the main cutoff, then restores atomically with main data; failures stay paused. Disposing or changing identity invalidates old callbacks. Full TradeVis paired-trade behavior remains distinct from new read-only events.

Reload completion includes engine application and subscription preparation. A subscription that attaches and then throws rejects the Promise, retains original bars/basis/scope and releases partial subscriptions. Synchronous main bars and comparison bars/snapshots received during preparation are copied into the owning subscription's temporary queue, consumed after success and discarded on failure, identity change or disposal. Public applySnapshot retains its latest input throughout the composite checkpoint and processes it after commit.

Asynchronous layout preflight captures the owning loader's identity epoch before awaiting work. Switching away and back, including empty charts, cancels the old restore with AbortError before deletion/recreation. Direct restoreLayout still does not promise full transaction rollback. Comparison resume copies source data when read and applies it only after all subscriptions prepare successfully. Removing a real member during preparation cancels that attempt and allows retry with remaining members; an unknown ID does not affect it. Event endpoints must fit the displayable Unix millisecond date range. Intervals intersecting the viewport retain their visible segment and clicks return the original event timestamp.


Workspace `onLayoutChange(layout)` lets the host adjust outer height without changing the persisted document. Hosts choose container sizes appropriate to their own cells. External template tooltip names, units and legends are retained; add/restore share instance controls and omit settings without a schema. Failed analysis replacements show an error while retaining confirmed graphics. Unknown price bases are labelled on separate panes. Successful composite replay exit also drains queued history snapshots.


## 0.8.0 data API

```typescript
import type {HistoryQuery,HistoryMetadata,HistorySnapshot,HistoryResult,
  DatafeedStatus,ChartDataState} from 'trading-chest/chart'

type HistoryQuery =
  | {kind:'before'; before:number; countBack:number}
  | {kind:'range'; from:number; to:number}
interface HistoryMetadata {
  state:'ready'|'empty'|'partial'
  sourceTimestamp?:number
  delayMs?:number
}
interface HistorySnapshot {bars:KLineData[]; basis?:string; metadata?:HistoryMetadata}
interface HistoryResult extends HistorySnapshot {hasMoreBefore?:boolean}
type DatafeedStatus =
  | {type:'connection';state:'connected'|'disconnected'|'reconnecting'|'failed'}
  | {type:'revision-required';message?:string}
  | {type:'error';code?:string;message:string}

// Datafeed
getHistoryKLineData(symbol:SymbolInfo,period:Period,query:HistoryQuery,
  context?:DatafeedRequestContext):Promise<HistoryResult>
subscribeStatus?(symbol:SymbolInfo,period:Period,
  accept:(status:DatafeedStatus)=>void):()=>void

// ChartPro
retryData():Promise<void>
```

Timestamps are Unix milliseconds. before excludes its upper bound; countBack targets a number of bars. range reads the complete `[from,to)` interval. Before requires boolean hasMoreBefore at runtime even though the shared type makes it optional for ranges. Short pages/empty windows do not prove exhaustion; empty plus true is rejected. Ranges may omit it; partial ranges cannot confirm complete recovery. Array returns and positional from/to arguments are removed.

`ChartDataState` retains symbol, period, basis?, timestamp?, restoring, replay and error?, and adds:

| Field | Type/meaning |
| --- | --- |
| dataStatus | unconfirmed / empty / ready, for the complete confirmed dataset |
| lastRead? | `{query:HistoryQuery;metadata?:HistoryMetadata;hasMoreBefore?:boolean}`, the committed read |
| connection | unknown / connected / disconnected / reconnecting / failed |
| revisionRequired | boolean; a reload request, not a live bar |
| errorCode? | string |
| operation? | initial / load-more / reload |

Undeclared sourceTimestamp/delayMs remain unknown, never inferred from HTTP or bar timestamps. retryData preserves the failed request and prepend anchor; it completes idempotently without a failure. Failures retain confirmed graphics; identity changes/disposal invalidate obsolete work. See [data access](./data-access).

## Workspace storage API

```typescript
import {ChartWorkspace,createIndexedDBWorkspaceStore,WorkspaceStoreError,
  readLegacyWorkspace} from 'trading-chest/chart'
import type {WorkspaceStore,WorkspaceSummary,StoredWorkspace,WorkspaceWrite}
  from 'trading-chest/chart'

interface WorkspaceSummary {id:string;name:string;updatedAt:number;revision:string}
interface StoredWorkspace extends WorkspaceSummary {document:WorkspaceDocument}
type WorkspaceWrite =
  | {kind:'create';id:string;name:string;document:WorkspaceDocument}
  | {kind:'update';id:string;expectedRevision:string;name:string;document:WorkspaceDocument}
interface WorkspaceStore {
  list(scope:string,signal:AbortSignal):Promise<WorkspaceSummary[]>
  read(scope:string,id:string,signal:AbortSignal):Promise<StoredWorkspace|null>
  write(scope:string,input:WorkspaceWrite,signal:AbortSignal):Promise<StoredWorkspace>
  remove(scope:string,id:string,expectedRevision:string,signal:AbortSignal):Promise<void>
}
createIndexedDBWorkspaceStore(options?:{databaseName?:string}):WorkspaceStore & {dispose():void}
readLegacyWorkspace(scope:string,options:{symbols:SymbolInfo[];
  fallback:{symbol:SymbolInfo;period:Period};storage?:Pick<Storage,'getItem'>}):WorkspaceDocument|null
```

`ChartWorkspaceOptions.store?:WorkspaceStore` replaces storage/storageKey without a runtime shim. Scope is the original context, never parsed or trimmed. IDs/revisions are opaque; the workspace generates IDs. Names are trimmed to 1–80 characters; duplicate names are allowed and IDs determine identity. read returns null for missing records. Update/delete compare expectedRevision atomically; IndexedDB resolves only after readwrite transaction completion. Adapters validate/copy scope and documents; remote adapters must implement the same durable comparison semantics.

| ChartWorkspace method | Result/behavior |
| --- | --- |
| listSaved() | `Promise<WorkspaceSummary[]>`; refresh the list |
| saveAs(name) | `Promise<WorkspaceSummary>`; create/select the current view |
| save() | `Promise<WorkspaceSummary>`; update the confirmed selected ID/revision |
| load(id) | `Promise<void>`; replace/select only after every cell is ready |
| renameSaved(id,name) | `Promise<WorkspaceSummary>`; retain the stored document, without saving current edits |
| deleteSaved(id) | `Promise<void>`; remove that record; library UI confirms the target first |
| importLegacy(name) | `Promise<WorkspaceSummary>`; create an optional record requiring selection/load |

`WorkspaceStoreError.code` is WORKSPACE_NOT_FOUND, WORKSPACE_STORE_UNAVAILABLE, WORKSPACE_INVALID_DOCUMENT or WORKSPACE_CONFLICT. Conflicts never overwrite automatically; refresh/reselect or save as another record. Cancellation/timeouts can leave a committed write. The UI reads the same scope/ID to resolve unknown outcomes before allowing another storage mutation. Only one mutation runs per instance; charts remain interactive.

Without a store, management is disabled with an explanation. IndexedDB failure has no fallback. Saving is explicitly manual; save edits before switching. Import reads old workspace and supported single-chart v1/v2/v3 keys without auto-loading or modifying them. Content stays WorkspaceDocument v1 and chart v3, with names/IDs/revisions outside it and no market/runtime analytical data. Dispose the workspace before its owned store; borrowers must not close a shared store. Single-chart saveLayoutV3/listLayoutsV3 retain their original responsibilities.
