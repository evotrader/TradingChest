# Drawing documents and shared sessions

The drawing API uses `getDrawingTools()`, `getDrawingState()` and `executeDrawingCommand(command)`. The instance catalog supplies tool IDs, names, categories, parameters and shortcuts. Registering an overlay does not grant editing permission.

## Confirmation and history

Cancelled previews do not submit. Local content is confirmed by the library; backend content keeps the existing drawingOwner/commitDrawing authority. Document names, groups, ordering and interval filters do not issue annotation CRUD. Global hide and drag prevention are view masks and do not overwrite individual visible/lock values.

UI and programmatic actions use the same commands: tool, select, cancel, update, move, translate, delete, duplicate, copy, paste, group, ungroup, reorder, presentation, view, undo and redo. Batches preflight every target and serialize backend writes. Check result status and per-object items; partial or uncertain is never full success. Reconcile unknown results by the original logical ID without automatically repeating creates.

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

Templates, defaults and recent styles hold only tool styles and parameters, excluding points, text body, identities, backend IDs and scopes. Template commands save, overwrite, rename, delete, apply or set a default. Applying across tool types requires explicit common-style mode. Catalog validation protects parameters, and snapshot.parameters remains authoritative; derived engine extendData parameters are not stored as a second content source.

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

## 0.12 styling and volume refinement {#drawing-refinement}

Single and multiselection share the drawing property bar. Only common declared capabilities appear; unequal values display Mixed. Text color is separate from stroke, and transparent fills can be set and cleared. Palette buttons, custom RGB input and native selectors support keyboard focus and Escape. Narrow charts dock the bar at the bottom with targets of at least 44px. Locks, migration, uncertain results, mixed documents and unconfirmed settings drafts show explicit write restrictions. One common style command is one confirmed undo transaction, retaining actual per-item failures.

`DrawingToolDescriptor.styleControls` supports `stroke`, `fill`, `lineWidth`, `lineStyle`, `textColor` and `fontSize`. Omitting it preserves legacy stroke/width/style controls; `[]` means none. Tools without style settings expose none. Templates consume standard `overlay.styles.line/polygon/rect/circle/arc/text` fields. Parameter templates require the same tool; common-style-only templates copy the capability intersection without copying text, anchors, axes or parameters.

Old AVWAP definitions default to `bandMode:'none'`. The source and public center remain `mu=sum(p*v)/sum(v)`. Standard deviation half-width is `multiplier*sqrt(sum(v*(p-mu)^2)/sum(v))`: the volume-weighted population deviation of source prices, without n-1. It is not the sample deviation of a VWAP sequence. Percentage half-width is `abs(mu)*multiplier/100`, including negative and zero centers.

| Parameter | Default and domain |
| --- | --- |
| `bandMode` | `none`, `standard-deviation` or `percentage` |
| `bandMultipliers` | `[1,2,3]`; 1–3 distinct finite positive values, ≤10 for deviation or ≤100 for percentage |
| `bandFill` / `bandOpacity` | `true` / `0.12`; finite opacity in [0,1] |
| `bandAlgorithm` | Fixed `ohlcv-vwap-bands-v1` |

Zero volume contributes nothing; invalid samples retain the original unavailable semantics. Disabled bands do not accumulate moments. Replacements, append, pagination and replay use the confirmed range. Unrepresentable bands retain a finite center and an explicit reason, never fabricated zero width. Log axes display only projectable continuous boundaries. Optional `analytics[id].bands` contains `{mode,method,values:[{multiplier,lower,upper}],reason?}`. Absence means disabled; selected but unavailable bands contain empty values and a reason. No moment arrays are public.

FRVP adds `profileSide:'left'|'right'` (left), finite `profileWidth` in (0,1] (0.3), and `levelExtent:'profile'|'range'|'pane-right'` (profile). Width is relative to the selected interval, at least 24px and bounded by the pane. `showPoc/showVah/showVal` default true; flat `poc/vah/valColor`, `Width` and `Style` fields accept #RRGGBB/#RRGGBBAA/transparent, finite [1,4], and solid/dashed/dotted. Display edits reuse the computed profile. Rightward level extension does not include bars beyond the second anchor. Coincident level labels combine without moving prices.

## Curves and arcs {#curves}

`curve` clicks start P0, end P1, then control P2 and evaluates quadratic P0/P2/P1. `doubleCurve` adds P3 and evaluates cubic P0/P2/P3/P1. `arc` clicks start, end and a third point on the arc, defining a circle in the current screen projection. Selection shows original controls and event-ignoring assist lines. Body/control dragging, keyboard editing, styles, templates, cloning, undo and saving use the original command chain.

Persistent anchors remain authoritative. Curvature is reprojected for axes, zoom, pane size and DPR; this is not a price-domain circle. Rendering and hit testing share bounded segments with ≤0.5 CSS px error and a maximum of 2048 segments. Degenerate, nonfinite or unresolved geometry retains definitions and editable controls with an explicit reason. Future logical anchors remain local; sharing retains the original main-pane market-anchor restrictions.

## Third-party drawing tools {#third-party-drawings}

Call the peer engine's public `registerOverlay` before constructing charts with the matching stable namespaced name and catalog descriptor. A missing template fails before DOM construction. Multiple charts reuse registration, and disposing one chart does not unregister it. Catalogs do not persist functions or account data, and global registration does not grant access to system overlays.

Copyable native JS/TS integration is in the [drawing-workbench example](https://github.com/evotrader/TradingChest/tree/main/examples/drawing-workbench). `EXAMPLE/AnalysisZone` uses only `trading-chest/chart`, the peer engine, ordinary OHLCV and native IndexedDB, with no EvoTrader DTOs, URLs or framework-specific API.

## 0.13 drawing alerts and curve appearance {#drawing-alerts}

Select a source in properties or Drawing manager, then Add alert; Drawing alerts also opens independently. Confirmed chart-local horizontal lines, extended lines, segments and rays may retain local or backend ownership. Conditions/frequencies are selectors, default once. Resume retains deduplication, while Reset and enable clears markers and keeps instance history. Runs only on the page, without historical catch-up. Entering a finite segment domain is not a crossing; use an extended line or correctly directed ray for continued monitoring.

Curve settings add none/arrow/circle start/end markers, a background switch and finite[0,1] opacity. Fill closes the curve with its endpoint chord, using standard polygon.color or the actual stroke by default. It ignores hits; markers add no control points. Old definitions remain off. Display changes do not alter curvature or original subdivision bounds. Full parameter templates remain same-tool; explicit cross-tool common styles keep the existing capability intersection.

See [0.13 migration](./upgrade/0.13.0.md) for separate documents, stable scopes, paused restoration, confirmed data, live/replay isolation and the native IndexedDB composition example.

## 0.14 attached text and dense editing {#drawing-expressiveness}

This section describes the local upgrade contract with local acceptance completed. See [0.14 migration](./upgrade/0.14.0.md) for migration boundaries. The catalog remains 56 tools and document versions stay unchanged. Local acceptance passed under the approved budgets; this version has not been published to npm.

### Attached text

`horizontalStraightLine`, `straightLine`, `segment`, `rayLine`, `parallelStraightLine` and `priceChannelLine` declare `textMode:'attached', labelGeometry:'line'`; `rect` declares `labelGeometry:'box'`. `textAnnotation`, `callout`, `note` and `anchoredText` retain `textMode:'body'`. Other built-ins do not gain attached text.

Select an eligible drawing and use Add / edit text in its context menu, double-click editing, or the Drawing manager text settings. Attached tools do not open a text prompt after every drawing. On the first body input, the UI confirms text and visibility together. An API `patch.text` changes only the body: include `parameters:{labelVisible:true}` explicitly to show it. Empty bodies draw no label. Cancelling drafts submits nothing; IME, Ctrl/Cmd+Enter confirmation and Escape use the original editor.

| Parameter | Default and options |
| --- | --- |
| `labelVisible` | `false`; attached text visibility |
| `labelAlign` | `center`; `left/center/right` |
| `labelPosition` | `above`; `above/on/below` |

The only body is the original `overlay.extendData` string or a plain object's `text` field. Editing preserves the object's other metadata. Arrays and other primitive content are rejected without converting or discarding the original. Text uses standard `overlay.styles.text`; label coordinates are not persisted. Lines use the complete visible path of the first valid reference line in original figure order, ordered by screen x or by y for vertical segments. Boxes use the first actual rectangle boundary. Above/below uses an 8 CSS px gap; on centers the text. Multiline rendering and hits share geometry. Long text clips to the pane and reprojects after movement, zoom and axis changes without enlarging the price range.

Visibility, alignment and position may enter same-tool templates, defaults and recent styles; bodies do not. Object copy/paste preserves text and creates new IDs. Text edits do not change anchors or drawing-alert comparison points; moving geometry still resets comparisons through the original alert path.

Third-party descriptors explicitly declare `textMode`. Attached mode also requires `labelGeometry` and corresponding standard line, rect or rectangular polygon figures. The library adds the same parameters and editing controls. Omission does not infer attached capabilities from a category or name. Ownership, confirmation and sharing restrictions still apply.

### Selecting overlapping drawings

Right-click or touch-and-hold at a hit location, then open Select objects here (N). Candidates follow native zLevel from high to low, with original event routing order for ties. Name, tool, scope and opaque logicalId distinguish identical names. Only confirmed, visible, period-eligible drawings with a current projection in that pane appear. Host-managed disabled entries explain why; locked objects retain the original select policy.

All candidate IDs remain available while only visible rows and overscan mount, at most 60 rows. ArrowUp/Down and Home/End reach the complete list; Enter selects and Escape closes while preserving the previous selection. Closing restores focus. Open lists recheck hiding, deletion, ordering and scope changes; context switches or chart disposal cancel them. Choosing or cancelling changes selection only, without drawing-content or backend annotation writes.

### Translation by bars, price or ticks

Select objects in Drawing manager, open Precise translation, enter signed bars or price displacement and select Price value or Tick. Empty input is not zero. Bars and tick counts must be safe integers; price values must be finite. Tick requires an explicit finite positive `SymbolInfo.tickSize`, never inferred from display precision or market names. Existing dragging and `move(dx,dy)` retain pixel units.

`anchoredText` does not support this entry. `anchoredVwap`, `fixedRangeVolumeProfile`, `regressionTrend` and `regressionChannel` support bars only; the other 51 built-ins declare both bars and price. Third-party tools must explicitly declare `numericMove:{bars:boolean,price:boolean}`; omission means false for both. Each object also needs currently resolvable market anchors in one writable document/scope, pane and effective price axis. Logical/viewport anchors retain existing move controls. Mixed targets are never split automatically.

Bars move through actual loaded bar indices while preserving fractional positions between bars, including lunch breaks, weekends and sparse data. Out-of-range targets, missing neighbours or unresolved references reject the entire preflight without fabricating future timestamps. Price-only movement preserves the original time anchor completely. Price multiplication/addition uses a separate 50-digit Decimal configuration followed by one Number conversion, without display-precision rounding. Nonfinite results, nonpositive log values and invalid geometry reject.

Translation follows existing whole-batch preflight, per-object permission/context guards, serial confirmation and history. A time-structure or binding change after queuing/yielding cancels the old operation. Confirmed prefixes remain; unattempted items are explicit. Check `status` and each `items` result. Partial/uncertain is not success, and unknown writes are not automatically retried. All-zero requests write no content/history; a successful batch is one undo/redo transaction.

## 0.15 levels and drawing entry points {#drawing-workflow}

Local validation is in progress; this version is not on npm. The two Fib tools support 1–64 editable rows with custom ratios, visibility, appearance, text and ordering. The complete draft confirms as one edit/undo; cancellation writes nothing. Calculation, reverse, extension, background and label options are explicit. Legacy numeric arrays remain unchanged on read. Text belongs to objects; presets strip row IDs and text.

The picker supports direct favorites and 12 recent tools. The toolbar exposes continuous drawing and matching pre-draw templates. Selecting a template does not edit selected objects, and continuous objects get fresh row IDs and empty text. Snap settings independently select OHLC/visible indicators and 4/8/12/16px weak distances; disabling both shows a clear message without changing existing anchors.

Third-party descriptors can declare `kind:'level-set'` under any key and use the same editor and public resolver. Omission does not infer capability. Preferences migrate purely from v1 to v2; layout/workspace/shared versions stay unchanged. The old 0.14 reader rejects new level objects while retaining storage. See [0.15 migration](./upgrade/0.15.0.md).
