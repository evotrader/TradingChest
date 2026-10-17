# Access data

Hosts provide a separate Datafeed per chart. SymbolInfo and Period come from a real valid catalog. No trading-system DTO, authentication scheme or endpoint is required by the library.

```typescript
import type {Datafeed,DatafeedRequestContext,HistoryResult,SymbolInfo,Period} from 'trading-chest/chart'
```

| Datafeed method | Contract |
| --- | --- |
| searchSymbols(search?) | `Promise<SymbolInfo[]>` containing valid symbols |
| getHistoryKLineData(symbol,period,from,to,context?) | `Promise<HistoryResult>` for this identity/window |
| subscribe(symbol,period,callback) | Real bar updates for this chart |
| unsubscribe(symbol,period) | Pause this instance's subscription |
| dispose?() | Finally release owned connections/resources |

Propagate context.signal to requests; reason is initial/load-more/resume. Do not share a single-callback provider across charts. HistoryResult is KLineData[] or `{bars,basis?}`. Bars use strictly increasing unique Unix milliseconds and valid OHLCV. Read basis with the same bars, never from global last-request state. Host periods use `{timespan,multiplier,text}`; the loader converts to v10 `{type,span}`.

## Authoritative snapshots and confirmation

`applySnapshot({symbol,period,bars,basis})` accepts a complete authoritative snapshot matching the current identity. Streaming and same-bar updates use the single loader. Earlier revisions/basis changes successfully reread the loaded range before commit; failures retain confirmed data, viewport and drawings. Missing rows do not imply deletion. Replay holds pending snapshots and resumes providers only after combined main/comparison recovery succeeds.

`onDataState` reports confirmed basis/timestamp/restoring/replay/error; a new HTTP basis does not mean a chart commit. Obtain getAnalysisContext after onDataReady and bind analytical snapshots to its token. Resend layers after symbol/period/confirmed-basis changes; same-basis continuation retains scope.

## Analytical snapshots

Layers accept explicit host snapshots without requests or a second cache. Hosts retain AbortSignal, request sequence and result ownership. replaceData validates complete batches and retains prior data on error. Series match exact real timestamps without nearest fill, interpolation or forward fill. Hosts declare availability/PIT; replay clips timestamp and availableAt, both in milliseconds.

YYYY-MM-DD and other ordered labels use label-series instead of guessed intraday timestamps. Preserve raw values and null ordinal positions. Without exact availableAt, replay hides the entire layer with an explanation. Units belong to sources: normal EvoBacktest values are normalized NAV starting at 1, not money; the generic API does not assume that business meaning. Percent uses percentage points (1 = 1%); absent currencies are not inferred.

Unaligned events retain their original times and explanations, with host-owned detail callbacks. Unknown/different dataBasis prices cannot overlay the main original-price axis; choose a separate pane instead.

## Workspace and storage

mountCell constructs an independent provider per cell; ready resolves after actual data application, dispose cancels only that cell. captureOptions supplies real local drawing IDs and backend annotation references. Runtime analysis, orders, trades and alerts are excluded from layouts. Restore never triggers annotation writes. Storage is enabled only by an explicit host adapter; business data/persistence remain host-owned.

DefaultDatafeed remains an optional Polygon implementation requiring valid upstream credentials; it is not credential-free market data. Distinguish empty, failed and unaligned states and never use demonstration inputs as a production fallback. See the [API](./api) and [standalone isolated example](./getting-started).
