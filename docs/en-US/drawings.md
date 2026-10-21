# Drawing documents and shared sessions

The drawing API uses `getDrawingTools()`, `getDrawingState()` and `executeDrawingCommand(command)`. The instance catalog supplies tool IDs, names, categories, parameters and shortcuts. Registering an overlay does not grant editing permission.

## Confirmation and history

Cancelled previews do not submit. Local content is confirmed by the library; backend content keeps the existing drawingOwner/commitDrawing authority. Document names, groups, ordering and interval filters do not issue annotation CRUD. Global hide and drag prevention are view masks and do not overwrite individual visible/lock values.

UI and programmatic actions use the same commands: tool, select, cancel, update, delete, duplicate, copy, paste, group, ungroup, reorder, presentation, view, undo and redo. Batches preflight every target and serialize backend writes. Check result status and per-object items; partial or uncertain is never full success. Reconcile unknown results by the original logical ID without automatically repeating creates.

State scope selects the scope for new tools; historyScope identifies the current history target. Selection determines the writer, and cross-session content batches are rejected. Notifications distinguish user/history/projection origin; projection does not submit business writes. Text inputs retain native undo.

Document-bound commands capture their context when queued. Changing the symbol, period or shared binding cancels pending commands for the old context, preventing a paste or edit from reaching the new document. Consecutive operations on the same document remain serialized. Global view and preference operations survive document changes.

## Coordinates and persistence

DrawingSnapshot.anchors owns coordinates. Market anchors retain actual timestamps and values, including optional interpolation between two actual timestamps. Logical anchors retain an existing reference bar plus a period-bound bar offset. Viewport anchors store normalized content coordinates. Engine points are projections. Missing history or incompatible periods retain the document and report the reason instead of inventing future market timestamps.

captureLayout/restoreLayout use ChartLayoutV4. drawings contains chart-local content only, drawingPresentation holds backend-reference presentation, and sharedDrawingRefs holds host document references. WorkspaceDocument v2 stores one copy of workspace drawings. Chart v1/v2/v3 and workspace v1 migrate in memory without overwriting originals. Import preflight failures preserve the original; failed restoration rolls back configuration, content, history and shared bindings.

A restored local logicalId must not already belong to a current or prospective shared document, including objects that cannot currently project or are absent from the reference array. Such conflicts reject restoration; use transfer to change scopes. Failed adoption retains the original transfer history without overwriting shared content confirmed by another chart.

## Shared ownership

Sharing accepts local user drawings on the main price pane with market anchors. Backend objects, indicator panes, future logical anchors and viewport anchors remain chart-local. The host implements resolveDrawingShareKey(confirmedContext), returning `{identity, documentId?}` or `{reason}`. Identity requires an opaque namespace, full market/exchange/ticker/priceCurrency and an established priceBasisKey. The library does not parse provider-specific basis, infer currency/ticks or assume raw prices.

ChartWorkspace owns its workspace DrawingSessionRegistry, while charts borrow it through bindDrawingWorkspace. Host sharing requires an explicitly owned DrawingDocumentStore and host registry supplied through drawingHostSessions. Borrowers unsubscribe on disposal; the final owner disposes the registry and then the store. No store owns a feed or opens IndexedDB during SSR.

bindDrawingWorkspace waits for the original feed loader to confirm the context and for the actual session binding; read failures reject. Context changes and disposal cancel only that chart's wait, leaving other borrowers' storage reads intact. Workspaces bind every accepted successor chart to the existing registry before exposing it as ready.

```ts
const store = createIndexedDBDrawingDocumentStore()
const sessions = new DrawingSessionRegistry({ scope: 'host', store })
// On the client, supply sessions and a host resolveDrawingShareKey implementation.
// Return a stable documentId; never generate a new ID for a retry.
// After every borrowing chart has been disposed:
sessions.dispose()
store.dispose()
```

DocumentStore read/write use namespace and a fixed documentId. expectedRevision=null means create only; updates require the original revision. dirty/saving/saved/error/uncertain distinguish local confirmation from persistence confirmation. Conflicts retain the draft. Explicitly discard and refresh, or save as a new target provided by the host createDrawingDocumentId callback. Separate instances use explicit refresh; automatic merging and live collaboration are outside this version.

Use scope for new tools, transfer for existing objects, and shared to save/refresh/save as. Transfers preserve logical IDs and preflight both authorities. Unknown transfers retain a fixed destination and cannot be redirected. Leaving host storage atomically writes a read-only transfers recovery record alongside removal. Recovery records are never writable projections. Refresh the fixed document and use recover-transfer to adopt the original IDs into the recorded scope. The target and undo operation are confirmed before cleanup; cleanup waits and unknown results block transitions that would lose responsibility. Closing an origin chart invalidates only transfers that cannot return to that chart, while retaining shared content and other history.

## Templates and preferences

DrawingPreferencesStore read/write accept AbortSignal and an opaque drawingPreferencesScope. Defaults are session memory; explicitly provide createIndexedDBDrawingPreferencesStore for persistence. Late reads merge session changes without erasing unseen templates. Read failures retain session changes and never overwrite an unread record.

Templates hold tool styles and parameters, excluding points, text body, identities, backend IDs and scopes. Template commands save, overwrite, rename, delete, apply or set a default. Applying across tool types requires explicit common-style mode. Catalog validation protects parameters, and snapshot.parameters remains authoritative; derived engine extendData parameters are not stored as a second content source.

## Drawing and precision editing

Finish variable-point tools with Enter or the visible Finish button; Escape cancels. Shift constrains the screen angle. Hold Space to pan without confirming an unfinished drawing. Focused control points move by 1px with arrow keys, or 10px with Shift. A completed drag submits once; Alt-drag creates a new object under the target ownership policy. Canvas selection excludes hidden and interval-filtered objects.

Settings use each object's own price axis and authoritative anchors. Handles and price/time labels use the same projection. Future logical anchors show subsequent bars without invented trading dates; fractional anchors describe a proportion of the reference interval. Layout restoration maps stored axes to actual axes in the new chart instance.

Regression uses loaded OHLC OLS and population residual deviation. Range tools distinguish bar counts from elapsed time. Fibonacci prices are calculated before axis projection. Position tools report price, explicit ticks and reward/risk only. Invalid log-domain values, zero risk and invalid stop directions have explicit unavailable states.

Document IDs, logical drawing IDs and revisions are opaque strings; consumers must not depend on UUID formatting. First-party generation uses `crypto.getRandomValues` without requiring `randomUUID`. Existing persisted IDs and revisions are retained.

## Volume drawings (0.11) {#volume-drawings}

Search the tool picker for Anchored VWAP or Fixed Range Volume Profile and click real historical bars. Handles and coordinate settings edit time only; left/right moves one real bar, Shift moves ten. Endpoint prices do not enter calculations. Both tools require market anchors on the main price pane. Selected summaries appear in the chart and object manager.

| Tool | Parameters and defaults | Estimate |
| --- | --- | --- |
| `anchoredVwap` | `source:'hlc3'` (close/hl2/hlc3/ohlc4); `algorithm:'bar-price-volume-v1'` | Cumulative `sum(source × volume) / sum(volume)` from the anchor, without session resets |
| `fixedRangeVolumeProfile` | `rows:48`, `valueArea:0.7`, `mode:'total'`, `algorithm:'bar-range-uniform-v1'` | Inclusive timestamp interval; distribute each bar’s volume uniformly over its high-low price range according to bin overlap; flat bars enter one bin |

The profile UI offers 24/48/96/192 rows and 50/60/68/70/80/90/95% value area. API rows accept integers 1–256 and valueArea finite `(0,1]`. Up/down means close>=open versus close<open allocation, not aggressor buying/selling. A flat-price interval remains a single real-price bin.

POC is the highest-volume bin, ties nearest the full price-range center, then lower price. Value area expands from POC toward the larger adjacent bin, ties downward. VAH/VAL are bin boundaries. Whole-bin inclusion may exceed the target; the summary reports the actual share. This documented OHLCV estimate does not claim TradingView’s private distribution algorithm.

Missing, negative or nonfinite volume and invalid OHLC make the affected calculation unavailable. Zero volume contributes nothing; zero cumulative/interval volume has no VWAP/POC. Invalid VWAP segments do not forward-fill. Nonfinite results or failed volume conservation report an error. Unprojectable log-axis prices show an on-chart linear-axis instruction.

Only confirmed bars from this chart participate. Same-bar volume replacement, pagination, revision reload and context/basis changes recalculate. Unloaded anchors remain intact with a load-history instruction. Failed/revised reads mark previous results stale and use the original history retry path. Current-period timestamps determine sampling; boundaries are never split or gaps filled. Actual range/count and unknown coverage remain explicit. Replay may calculate an incomplete right interval, but never consumes unseen future bars.

`getDrawingState().analytics?.[logicalId]` provides status (calculating/ready/unavailable/stale), method, optional period, requestedRange, optional actualRange, count, coverage, boundarySampled, replayPartial, reason and summary. Summaries contain VWAP/volume/source or volume/POC/VAH/VAL/actual value area/rows, without curve/bin arrays. Definitions alone persist and share; every chart independently recalculates at its own period.

## Object tree and reordering

Named groups collapse for the session; searching temporarily expands matches. Only viewport plus overscan rows mount. Offscreen selection remains intact. Arrow/Home/End navigation mounts before focusing, parks focus on the tree when rows unmount, and focuses a neighbour after deletion without stealing external input focus.

Drag a handle before/after an eligible object, or use target/position selectors. Touch handles use the same command. Edge scrolling is automatic; Escape, cancellation and context changes cancel uncommitted drags.

```ts
await chart.executeDrawingCommand({
  type: 'reorder', ids: ['first'], targetId: 'second', position: 'before'
})
```

Position follows displayed order. Objects must share document, scope, pane and group; there is no implicit regrouping. Locked, migration and uncertain objects are rejected. Multiselection preserves relative order. Confirmation and undo/redo use the existing history, including older direction commands.

The canvas and control-point keyboard paths both move volume drawings by one actual bar, or ten with Shift. Time handles follow the current bar display without writing a display price into the saved definition. A failed read remains stale during a pending retry or a failed subscription restore; the visible retry also handles source-status errors, while public retryData remains idempotent when no query has failed.

Reorder keeps integer order values in the existing schema. When an insertion needs renumbering, all affected objects pass the existing write checks before the single history operation. Long names remain accessible while fixed rows keep actions aligned with their own object.
