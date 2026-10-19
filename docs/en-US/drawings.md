# Drawing documents and shared sessions

The 0.10 drawing API uses `getDrawingTools()`, `getDrawingState()` and `executeDrawingCommand(command)`. The instance catalog supplies tool IDs, names, categories, parameters and shortcuts. Registering an overlay does not grant editing permission.

## Confirmation and history

Cancelled previews do not submit. Local content is confirmed by the library; backend content keeps the existing drawingOwner/commitDrawing authority. Document names, groups, ordering and interval filters do not issue annotation CRUD. Global hide and drag prevention are view masks and do not overwrite individual visible/lock values.

UI and programmatic actions use the same commands: tool, select, cancel, update, delete, duplicate, copy, paste, group, ungroup, reorder, presentation, view, undo and redo. Batches preflight every target and serialize backend writes. Check result status and per-object items; partial or uncertain is never full success. Reconcile unknown results by the original logical ID without automatically repeating creates.

State scope selects the scope for new tools; historyScope identifies the current history target. Selection determines the writer, and cross-session content batches are rejected. Notifications distinguish user/history/projection origin; projection does not submit business writes. Text inputs retain native undo.

## Coordinates and persistence

DrawingSnapshot.anchors owns coordinates. Market anchors retain actual timestamps and values, including optional interpolation between two actual timestamps. Logical anchors retain an existing reference bar plus a period-bound bar offset. Viewport anchors store normalized content coordinates. Engine points are projections. Missing history or incompatible periods retain the document and report the reason instead of inventing future market timestamps.

captureLayout/restoreLayout use ChartLayoutV4. drawings contains chart-local content only, drawingPresentation holds backend-reference presentation, and sharedDrawingRefs holds host document references. WorkspaceDocument v2 stores one copy of workspace drawings. Chart v1/v2/v3 and workspace v1 migrate in memory without overwriting originals. Import preflight failures preserve the original; failed restoration rolls back configuration, content, history and shared bindings.

## Shared ownership

Sharing accepts local user drawings on the main price pane with market anchors. Backend objects, indicator panes, future logical anchors and viewport anchors remain chart-local. The host implements resolveDrawingShareKey(confirmedContext), returning `{identity, documentId?}` or `{reason}`. Identity requires an opaque namespace, full market/exchange/ticker/priceCurrency and an established priceBasisKey. The library does not parse provider-specific basis, infer currency/ticks or assume raw prices.

ChartWorkspace owns its workspace DrawingSessionRegistry, while charts borrow it through bindDrawingWorkspace. Host sharing requires an explicitly owned DrawingDocumentStore and host registry supplied through drawingHostSessions. Borrowers unsubscribe on disposal; the final owner disposes the registry and then the store. No store owns a feed or opens IndexedDB during SSR.

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
