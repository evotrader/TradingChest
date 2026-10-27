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

Target admission does not block rollback or retention of an existing snapshot after a rejected or unknown write. Unknown outcomes lock the logical ID before rendering the retained state; even a missing pane cannot authorize resubmission. Resolve the outcome through an authoritative read.

KLineChart remains pinned to 10.1.0. `getChart()` returns the v10 engine; use string actions, filtered getIndicators/getOverlays and independent axes. `reloadData({preserveViewport:true})` reads successfully before replacing bars; failures retain confirmed bars, viewport and drawings. `applySnapshot({symbol,period,bars,basis})` goes through the single loader, including history revision and basis prefetch. `onDataState` reports confirmed basis/timestamp/replay/restoring/error; onDataReady means data applied, not a new chart object.

Layouts use captureLayout/saveLayoutV4/loadLayoutV4/restoreLayout/deleteLayoutV4/listLayoutsV4. Reads distinguish ok/missing/error. v1/v2/v3 migrate in memory without deleting old keys; corrupt v4 does not silently fall back. Backend annotations retain host-provided references. Confirmed chart-local drawings are captured by default; localDrawingIds optionally selects a subset and cannot adopt raw overlays by ID. Orders/trades/positions/alerts do not persist. Storage adapters belong to hosts.

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

Without a store, management is disabled with an explanation. IndexedDB failure has no fallback. Saving is explicitly manual; save edits before switching. Import reads old workspace and supported single-chart v1/v2/v3 keys without auto-loading or modifying them. Content stays WorkspaceDocument v2 and chart v4, with names/IDs/revisions outside it and no market/runtime analytical data. Dispose the workspace before its owned store; borrowers must not close a shared store. Single-chart saveLayoutV4/listLayoutsV4 retain their original responsibilities.

## React component APIs (0.9.0)

```typescript
import {TradingChart, TradingWorkspace} from 'trading-chest/react'
import type {
  TradingChartProps, TradingChartInitialOptions, TradingChartEvents,
  TradingWorkspaceProps, TradingWorkspaceInitialOptions,
  ReactWorkspaceCellProps, ReactWorkspaceCellReady, OwnedWorkspaceStore
} from 'trading-chest/react'
```

New components are exported only from the `react` subpath. The root retains LiveSharpeChart/DrawdownAreaChart and their types; root/UMD do not gain TradingChart/TradingWorkspace. React and ReactDOM are optional peers. React consumers install paired versions; pure chart/testing consumers do not need them.

| TradingChart prop | Contract |
| --- | --- |
| initialOptions | ChartProOptions excluding container, datafeed, `on*` notifications and theme/locale/timezone/styles; mount snapshot, replace via key |
| createDatafeed(signal) | Required; a separate Datafeed or Promise for each real mount; receives initialization cancellation |
| height | Required; pixel number or `'100%'` with a definite parent height |
| theme/locale/timezone/styles | Dynamic presentation via existing setters; styles merge and omission retains values |
| events | Original ChartProOptions `on*` notification types; latest committed React callbacks |
| onReady(chart) | Instance created, ref already installed; does not confirm applied data |
| className/style/aria-label | Outer-container attributes; height prop determines its height |
| ref | Original ChartPro or null, cleared on unmount |

Use ref methods for runtime symbol/period changes. Initialization has loading/error/retry states; retries create a fresh feed. Initialization failures call `events.onError`. The wrapper owns feed disposal before handoff; the chart alone owns it afterward. Each StrictMode setup/cleanup is independent. Core `events.onDataReady` still follows actual history application.

| TradingWorkspace prop | Contract |
| --- | --- |
| initialOptions | ChartWorkspaceOptions excluding container/mountCell/store/height/locale/theme/`on*`; mount snapshot |
| renderCell(props) | ReactNode rendered through a Context-preserving portal, without a separate React root |
| height/locale/theme | Required height is a number or `'100%'`; presentation updates use original resize/setters |
| store | Borrowed WorkspaceStore, never closed by the component |
| createStore(signal) | Mutually exclusive with store; owned OwnedWorkspaceStore or Promise, with mandatory dispose() |
| onReady(workspace) | Original ChartWorkspace instance, ref already installed; does not confirm readiness of every cell |
| onActiveCell/onLayoutChange/onError | Original ChartWorkspaceOptions callback types, latest committed React callbacks |
| className/style/aria-label | Container attributes |
| ref | Original ChartWorkspace or null, cleared on unmount |

```typescript
interface ReactWorkspaceCellReady {
  chart: ChartPro
  captureOptions?: () => {localDrawingIds?:string[]; annotationRefs?:string[]}
}
interface ReactWorkspaceCellProps {
  cell: WorkspaceCell
  height: number
  signal: AbortSignal
  onReady(value: ReactWorkspaceCellReady): void
  onError(error: Error): void
}
type OwnedWorkspaceStore = WorkspaceStore & {dispose():void}
```

Cells hand off onReady after actual data application. Subsequent confirmations map to the existing subscribeReady contract. captureOptions retains real local drawing IDs/backend annotation references. Cancellation, removal and failed staging release that binding; obsolete readiness cannot revive it. Owned stores close after workspace/cell cleanup, including late results. External owners close borrowed stores last. Missing stores retain disabled management without fallback. Original staged replacement, old-view retention on failure and unknown-write reconciliation remain.

The React entry preserves `use client`. ESM/CJS can be imported and rendered through renderToString in Node without DOM; the server only renders a stable initial container. Canvas is created in client effects. This does not extend SSR support to root/chart/UMD. Define Next factories inside Client Components. See [framework integration](./frameworks).

## testing history validators (0.9.0)

```typescript
import {HistoryError, validateHistoryQuery, validateHistoryResult} from 'trading-chest/testing'
import type {
  HistoryQuery, HistoryResult, HistorySnapshot, HistoryMetadata,
  DatafeedRequestContext, Datafeed, SymbolInfo, Period
} from 'trading-chest/testing'

validateHistoryQuery(query: HistoryQuery): void
validateHistoryResult(result: HistoryResult, query: HistoryQuery): HistoryResult
// HistoryError extends Error, with readonly code: string.
```

ESM/CJS and declarations reuse production history validation without DOM/Solid/React. On success, validateHistoryResult returns the same object, without copying/freezing. It checks timestamps, OHLCV, request bounds and response structure; it cannot establish truthful market provenance, basis or hasMoreBefore declarations. Loader copy/handoff ownership remains unchanged. Use independent expectations for adapter semantics; see the [contract template](./data-access#independent-validation-and-contract-template).


## Drawing documents and sharing (0.10)

See [drawing documents and shared sessions](./drawings.md) for commands, v4/v2, templates/preferences, borrowed sessions, CAS and recovery of unknown transfers.

## Volume drawings and absolute reordering (0.11)

Optional `DrawingState.analytics: Record<string, DrawingAnalyticsState>` exposes copied summaries derived from confirmed OHLCV. Types are exported from root, chart and solid. Period may be absent before confirmation; status does not persist. See [volume drawings](./drawings.md#volume-drawings) for algorithms, replay and sampling limits.

`DrawingCommand` adds `{type:'reorder', ids:string[], targetId:string, position:'before'|'after'}` alongside the existing direction branch. Execution rechecks the current document/scope/pane/group and permissions through existing confirmation history.

## 0.12 drawing catalog and summary additions

```typescript
import type {
  DrawingStyleControl, DrawingToolDescriptor,
  VwapBandMode, VwapBandBoundary, VwapBandsSummary,
} from 'trading-chest/chart'
```

These types are exported from root, `chart` and `solid`. React forwards the original `onDrawingStateChange`; no framework-specific styling or datafeed API is added. Optional `DrawingToolDescriptor.styleControls` declares actual capabilities. Omission preserves legacy stroke/width/style, while an empty array disables quick styles. `DrawingParameter.kind` adds `color`, accepting six/eight-digit hex or transparent. Unknown/duplicate controls and undeclared/invalid parameters fail explicitly without discarding the original definition.

Style values follow the actual standard figure groups, including namespaced tools. Settings and floating properties share resolved defaults; cancelling a draft never persists those defaults. Common-style templates convert saved fields only, preserving distinct group values and leaving missing fields unchanged. Batch and history operations recheck the current host editing policy before each write; a policy change retains confirmed items and reports the remaining item outcomes.

Optional `DrawingAnalyticsState.bands` exposes the selected mode, fixed method, up to three finite boundaries and an optional reason. Old definitions disable bands; original VWAP centers and FRVP mathematics remain unchanged. See [drawing refinement](./drawings.md#drawing-refinement) for formulas, parameters, curve click order and peer registration. Documents remain v4/workspace v2/shared v1/preferences v1, persisting definitions rather than derived caches.

## 0.13 drawing alerts

ChartProOptions adds drawingAlertScope and onDrawingAlertStateChange/onDrawingAlertTrigger/onReplayDrawingAlertTrigger. executeDrawingAlertCommand accepts create/update/pause/resume/rearm/delete and returns a synchronous completed/rejected result with optional id/message. getDrawingAlertState returns isolated live/replay state copies. captureDrawingAlerts/restoreDrawingAlerts use a separate DrawingAlertDocumentV1; restore fully validates before replacement, throws and retains existing rules on failure, and always restores paused with deduplication markers. Layout-only saves do not save alerts.

Create accepts drawingLogicalId and optional id/condition/frequency/message, default crossing/once. Update changes only condition/frequency/message. Pause/resume retain hasTriggered/lastBarTimestamp; rearm clears markers, retaining records. A triggered once rule rejects resume. First observations after create/resume/rearm seed comparisons. Rule identity stores actual optional ticker/market/exchange/priceCurrency/basis and its creation period; confirmed backend sources retain opaque backendId and original authority.

The DOM-free trading-chest/alerts entry exports evaluateDrawingAlert, validateDrawingAlertDocument, validateDrawingAlertRule and portable types without chart/framework/storage runtime imports. Evaluation receives rule, confirmed geometry, real bars timestamps, previous/current observed closes, markers, optional axis and mode. Callers supporting replay seeks also supply a per-rule ephemeral `triggeredBarTimestamps?: ReadonlySet<number>` and add each returned event timestamp; preserve it across seeks and pause/resume, clearing it only on explicit rearm. The evaluator never mutates this set. Chart instances manage it internally; it is absent from documents and public state. It returns new markers/status/reason, optional comparison and at most one event. Retain the returned comparison as the next previous observation; clear it when absent. Events carry real barTimestamp, triggerPrice/referencePrice and live/replay mode, never a fabricated tick timestamp.

Existing fixed-price alerts and feedPrice keep their semantics; feedPrice does not bypass confirmed data for drawing alerts. See [0.13 migration](./upgrade/0.13.0.md) for supported tools, finite domains, snapshot identity migration, persistence and background limits. These APIs describe the local candidate, not a publication result.

Logarithmic references and crossing comparisons use the same returned Number price. Machine-rounding ambiguity is resolved with an independently configured decimal.js constructor before a single conversion to Number. There is no fixed price/tick tolerance or collapse of adjacent representable prices; host Decimal settings do not affect evaluation. Its MIT license is retained in the package's `THIRD_PARTY_NOTICES.md`.

## 0.14 drawing capabilities and numeric translation

These APIs describe the local 0.14 upgrade with acceptance completed, not a published release. `DrawingToolDescriptor` and `DrawingCommand` retain their root, `chart` and `solid` exports. React forwards existing commands and state.

| New optional `DrawingToolDescriptor` field | Contract |
| --- | --- |
| `textMode?: 'body' \| 'attached'` | Body tool or attached text; omission adds no text capability |
| `labelGeometry?: 'line' \| 'box'` | Required for attached mode and invalid for other modes; uses actual standard tool figures |
| `numericMove?: {bars:boolean;price:boolean}` | Explicit numeric capabilities; omission means false for both, without category inference |

Catalogs return full copies and validate capability combinations. Attached mode supplies text settings, text-color/font-size capabilities and `labelVisible`, `labelAlign`, `labelPosition` parameters, defaulting to `false`, `center`, `above`. See [drawing usage](./drawings.md#drawing-expressiveness) for the exact seven attached and four body built-ins. `styles.text` continues to style text, and `DrawingSnapshot.parameters` remains authoritative.

Body edits retain `{type:'update',ids,patch:{text:string}}`. The sole body is the `overlay.extendData` string or plain object's `text`, preserving other metadata. Attached editing cannot convert arrays or other primitive content to objects. `patch.text` does not implicitly enable visibility. To show it explicitly:

```typescript
const textResult = await chart.executeDrawingCommand({
  type: 'update', ids: ['drawing-id'],
  patch: {
    text: 'Area of interest\nAwait confirmation',
    parameters: { labelVisible: true, labelAlign: 'center', labelPosition: 'above' },
  },
})
```

`DrawingCommand` adds `{type:'translate';ids:string[];bars?:number;price?:{unit:'price'|'tick';amount:number}}`:

```typescript
const moveResult = await chart.executeDrawingCommand({
  type: 'translate', ids: ['drawing-id'],
  bars: -2,
  price: { unit: 'tick', amount: 3 },
})
```

`bars` and tick `amount` must be safe integers; price `amount` must be finite. Supply at least one displacement. All-zero requests write no content/history. Tick requires an explicit finite positive current-symbol `tickSize`. Price arithmetic uses an independent 50-digit Decimal configuration before one Number conversion, without changing global settings or rounding to display precision. Existing `move` dx/dy remain pixels.

Targets require resolvable market anchors, explicit tool capabilities and one writable document/scope, pane and effective price axis. Nonzero bars use confirmed real indices and preserve fractional positions. Unloaded targets or missing reference/neighbour bars reject the entire preflight without inventing future timestamps. Price-only moves preserve original time anchors. `anchoredText` disables both capabilities; `anchoredVwap`, `fixedRangeVolumeProfile`, `regressionTrend` and `regressionChannel` support bars only and reject nonzero price requests with zero batch writes. The remaining 51 built-ins support both. Nonpositive log values, nonfinite results and invalid geometry reject.

Whole-batch preparation/preflight feeds existing per-object guards, confirmation, sharing and undo/redo. Document and confirmed time structure are rechecked after queuing/yielding. `DrawingCommandResult` retains completed/cancelled/rejected/partial/uncertain and confirmed/rejected/uncertain/not-attempted item results. Confirmed prefixes remain; unknown writes are not retried automatically. A successful batch is one undo. Templates/defaults/recent styles exclude bodies, anchors, identities and scopes; object copying preserves bodies with new IDs. ChartLayoutV4, WorkspaceDocument v2, shared v1 and preferences v1 stay unchanged. See [0.14 migration](./upgrade/0.14.0.md) for UI, persistence and third-party boundaries.

## 0.15 generic level sets and pre-draw templates

Root, `chart` and `solid` export `DrawingLevel`, `DrawingLevelSet`, `DrawingLevelAppearance`, `DrawingLevelPresetSet` and pure helpers. React forwards the existing command/state API. A level has required `id:string`, `value:number`, `visible:boolean`, optional `color`, `width`, `style:'solid'|'dashed'|'dotted'` and single-line `text`. A set is `{version:1,items:[...]}` with 1–64 rows and unique nonempty opaque IDs. Ratios may be negative, external or duplicated, but finite. Color uses the existing hex6/hex8/transparent contract, width is finite 1–4 and text is at most 500 UTF-16 units. Omitted appearance inherits the object's actual style. Unknown fields, bad types and duplicate IDs are rejected.

A descriptor's arbitrary parameter key can declare `kind:'level-set'`, with an appearance-only `DrawingLevelPresetSet` (no IDs/text) or legacy numeric-array default. `validateDrawingLevelSet` and `validateDrawingLevelPresetSet` check closed runtime and appearance-only structures. `resolveDrawingLevels(value,defaults?)` returns an isolated runtime copy without mutating legacy arrays or missing input. `extractDrawingLevelPreset` strips IDs/text; `instantiateDrawingLevelPreset` allocates fresh IDs; `applyDrawingLevelPreset` preserves matching ratio occurrences and rejects removal of text-bearing rows. Descriptor-aware `extractDrawingStylePreset`, `instantiateDrawingPresetParameters`, `applyDrawingPresetParameters` and `validateDrawingPresetParameters` use the same contract; runtime sets must not be stored directly as templates.

The tool command accepts `templateId?:string`, validated against toolId before replacing a preview. The session captures a preset copy; the default priority remains recent style, tool default, then host/engine default. `DrawingState.snapping` derives from preferences and has no independent writer.

`DrawingPreferencesInput` accepts v1/v2, while `DrawingPreferences` and store writes use v2. `ui.snapping` has `ohlc:boolean`, `indicators:boolean`, `weakSensitivity:4|8|12|16`. Pure `migrateDrawingPreferences` preserves inputs; `DrawingPreferencesPatch` supports nested partial updates. Initial input, injected stores, native IDB and late merges share migration/catalog validation. Corrupt or unknown originals are retained with an explicit error. See [0.15 migration](./upgrade/0.15.0.md).
