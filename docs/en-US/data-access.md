# Access data

Hosts provide a separate Datafeed per chart. SymbolInfo and Period come from a real valid catalog. No trading-system DTO, authentication scheme or endpoint is required by the library.

```typescript
import type {Datafeed,DatafeedRequestContext,HistoryResult,SymbolInfo,Period} from 'trading-chest/chart'
```

| Datafeed method | Contract |
| --- | --- |
| searchSymbols(search?) | `Promise<SymbolInfo[]>` containing valid symbols |
| getHistoryKLineData(symbol,period,query,context?) | `Promise<HistoryResult>` for this identity/query |
| subscribe(symbol,period,callback) | Real bar updates for this chart |
| unsubscribe(symbol,period) | Pause this instance's subscription |
| subscribeStatus?(symbol,period,accept) | Return an unsubscribe function; notify connection, revision or error without a second data stream |
| dispose?() | Finally release owned connections/resources |

Propagate context.signal to requests; reason is initial/load-more/resume. Do not share a single-callback provider across charts. HistoryResult is always an object `{bars,basis?,metadata?,hasMoreBefore?}`. Bars use Date-representable, strictly increasing unique Unix milliseconds and valid OHLCV. Read basis with the same bars, never from global last-request state. Host periods use `{timespan,multiplier,text}`; the loader converts to v10 `{type,span}`.

## History requests and boundaries

```typescript
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
```

`before` excludes its upper bound. `countBack` is a positive integer **target number of bars**, not a duration in calendar periods or a guaranteed page size. `range` reads the complete `[from,to)` interval without trimming to countBack. Do not invent closed-market bars; results must match the requested identity and interval.

A before response must include boolean `hasMoreBefore`. false requires confirmed exhaustion of that provider's permitted history. Short pages, empty windows, timeouts and permission errors do not prove exhaustion. Nonempty short pages can return true; empty plus true is rejected as no progress. Report a retryable error for unresolved boundaries. Date-window adapters share one cancellation/timeout and issue at most 24 interval requests; without committable data or a confirmed end, report `HISTORY_BOUNDARY_UNRESOLVED`.

A range may omit hasMoreBefore, meaning unknown. A partial range cannot confirm complete reload, adjustment or recovery snapshots. Basis belongs to this response; do not infer it from source names or metadata, or mix bases.

## Confirmed state and retry

`onDataState.dataStatus` (unconfirmed/empty/ready) describes the entire confirmed dataset; an empty prepend does not mark existing graphics empty. `lastRead` describes the successfully committed `query/metadata?/hasMoreBefore?`, not completeness of the series. `connection` defaults to unknown; optional subscribeStatus reports connected/disconnected/reconnecting/failed. Subscription installation does not establish connectivity. revisionRequired asks for reload; error/errorCode/operation identify failures.

Metadata is optional. sourceTimestamp is the provider-declared observation time and delayMs its declared delay. Show **unknown** when absent. HTTP completion, the latest bar's opening timestamp and local clock differences must not impersonate freshness. ready means this response is usable, empty means this successful read is empty, and partial is an explicit provider declaration. None implies tradable freshness or complete market history.

`chart.retryData()` retries the original failed request. Prepend retries retain the before anchor and merge earlier bars before reopening pagination. With no failed request it completes idempotently. `reloadData({preserveViewport:true})` reads the full loaded interval before commit. Failures retain bars, basis, analysis token, viewport and drawings. Identity changes and disposal cancel obsolete requests/listeners.

## Authoritative snapshots and confirmation

`applySnapshot({symbol,period,bars,basis?,metadata?})` accepts a complete authoritative snapshot matching the current identity. Bars, basis and metadata commit together; preparation/failed results never publish lastRead early. Streaming and same-bar updates use the single loader. Earlier revisions/basis changes successfully reread the loaded range before commit; failures retain confirmed data, viewport and drawings. Missing rows do not imply deletion. Replay holds pending snapshots and resumes providers only after combined main/comparison recovery succeeds.

`onDataState` reports confirmed basis/timestamp/restoring/replay/error; a new HTTP basis does not mean a chart commit. Obtain getAnalysisContext after onDataReady and bind analytical snapshots to its token. Resend layers after symbol/period/confirmed-basis changes; same-basis continuation retains scope.

## Analytical snapshots

Layers accept explicit host snapshots without requests or a second cache. Hosts retain AbortSignal, request sequence and result ownership. replaceData validates complete batches and retains prior data on error. Series match exact real timestamps without nearest fill, interpolation or forward fill. Hosts declare availability/PIT; replay clips timestamp and availableAt, both in milliseconds.

YYYY-MM-DD and other ordered labels use label-series instead of guessed intraday timestamps. Preserve raw values and null ordinal positions. Without exact availableAt, replay hides the entire layer with an explanation. Units belong to sources; the generic API does not assume business meaning. Percent uses percentage points (1 = 1%); absent currencies are not inferred.

Unaligned events retain their original times and explanations, with host-owned detail callbacks. Unknown/different dataBasis prices cannot overlay the main original-price axis; choose a separate pane instead.

## Workspace and storage

mountCell constructs an independent provider per cell; ready resolves after actual data application, dispose cancels only that cell. captureOptions supplies real local drawing IDs and backend annotation references. Market data, runtime analysis, orders, trades and alerts are excluded from layouts. Restore never triggers annotation writes.

Inject asynchronous `ChartWorkspaceOptions.store:WorkspaceStore` to enable named management. Old storage/storageKey constructor options are removed. `createIndexedDBWorkspaceStore({databaseName?})` is supplied; hosts may inject an actual service. Each operation uses opaque scope (the original context), ID and revision. Updates/deletes compare the expected revision and report WORKSPACE_CONFLICT instead of overwriting. Without a store, management is disabled with an explanation. IndexedDB failure never silently falls back to memory or localStorage.

Saving is manual. Load validates/stages all cells before replacing the workspace and selected record; failures retain the old view. Cancellation/timeout cannot prove a write did not occur. Unknown outcomes require reading the same scope/ID before further storage mutations. `importLegacy(name)` explicitly creates an optional record requiring selection/load afterward; it does not auto-load, delete or overwrite legacy keys. WorkspaceDocument stays v1 and chart layout stays v3; IDs/names/revisions live outside the document. See [storage APIs](./api#workspace-storage-api).

DefaultDatafeed still uses the Polygon protocol with valid upstream credentials. Its documented stock coverage floor is **2003-09-10**, used only for `market:'stocks'`. It is neither a floor for other markets nor evidence that each stock existed then. Unknown boundaries for other markets do not invent exhaustion. Streaming remains limited to `stocks / 1 minute / adjusted:false`; other combinations are history-only. Undeclared observation times/delays remain unknown.

Distinguish empty, failed and unaligned states; demonstration inputs never serve as production fallbacks. See the [API](./api), [standalone isolated example](./getting-started) and [0.8.0 migration guide](./upgrade/0.8.0).
