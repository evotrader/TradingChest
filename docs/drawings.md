# 绘图文档与共享会话

0.10 实施中的绘图入口为 `getDrawingTools()`、`getDrawingState()` 和 `executeDrawingCommand(command)`。目录包含内置工具的稳定 ID、分类、名称、参数与快捷键；实例可通过 drawingCatalog 指定目录。注册 overlay 不会自动取得用户编辑权限。

## 确认、呈现与撤销

交互草稿取消不提交。local 内容由库确认；backend 内容仍由 drawingOwner／commitDrawing 的原宿主 authority 确认。名称、分组、排序、周期过滤属于文档呈现，不发送后端标注 CRUD。全局隐藏与防拖动是视图状态，不覆盖对象的 visible／lock。

程序操作和界面使用同一命令入口：tool、select、cancel、update、delete、duplicate、copy、paste、group、ungroup、reorder、presentation、view、undo、redo。多对象内容修改先全批预检，后端串行提交；检查结果 status 及逐对象 items，partial／uncertain 不能当完成。未知写入按原 logicalId 刷新 authority，禁止自动重发创建。

状态中的 scope 是新工具作用域，historyScope 是当前撤销目标；选中对象决定操作会话。跨会话批量内容操作明确拒绝。通知 origin 为 user、history 或 projection；投影不提交业务写。输入框继续使用浏览器原生撤销。

## 坐标与布局

DrawingSnapshot.anchors 是坐标权威：market 保存真实时标／值（连续笔迹可带相邻真实时标比例）；logical 保存已存在参考 bar 和原周期根数偏移；viewport 保存内容区百分比。engine points 只是投影，不用数组下标或伪造未来开市时间替代市场锚点。缺少参考历史、周期不兼容或不可定位时保留对象，并显示原因。

captureLayout／restoreLayout 使用 ChartLayoutV4：drawings 仅保存本图 local 内容，drawingPresentation 保存后端引用的呈现，sharedDrawingRefs 保存 host 文档引用。WorkspaceDocument v2 单份保存 workspace 共享内容。旧图表 v1／v2／v3 和工作台 v1 纯读取迁移；未解析坐标或未知工具失败保留原存储。恢复先预检，失败回滚图表配置、文档、历史和共享绑定。

## 共享与所有者

共享限主价格窗格、market 锚点、owner=local 的用户绘图；backend、指标副图、未来逻辑锚点和视口锚点保留本图。`resolveDrawingShareKey(confirmedContext)` 必须由宿主给出 `{identity, documentId?}` 或 `{reason}`：identity 含不透明 namespace、完整 market/exchange/ticker/priceCurrency 和明确 priceBasisKey。库不解析 provider 的私有 basis，也不补猜币种、tick 或复权方式。

ChartWorkspace 自有 workspace DrawingSessionRegistry，图表通过 bindDrawingWorkspace 借用；工作台释放所有投影后关闭自有 registry。宿主共享需要显式自有 DrawingDocumentStore 与 host registry，通过 drawingHostSessions 借给图表；图表销毁只退订，最终所有者调用 registry.dispose，再关闭 store。store 不拥有行情；SSR 不打开 IndexedDB。

```ts
const store = createIndexedDBDrawingDocumentStore()
const sessions = new DrawingSessionRegistry({ scope: 'host', store })
// 仅在客户端，将 sessions 和宿主实现的 resolveDrawingShareKey 传入 ChartProOptions。
// resolveDrawingShareKey 须给出稳定 documentId，不能在每次重试生成新 ID。
// 所有借用图表释放后：
sessions.dispose()
store.dispose()
```

DocumentStore 的 read/write 使用 namespace 和固定 documentId；write.expectedRevision=null 表示仅创建，更新携原 revision。dirty／saving／saved／error／uncertain 区分本地确认与持久确认。冲突保草稿；显式丢弃后刷新，或用宿主 createDrawingDocumentId 提供的新目标另存。不同实例用显式刷新取得存储更新，本版不自动合并或实时协作。

scope 命令选择新工具作用域，transfer 移动既有对象，shared 命令保存／刷新／另存。迁移保原 logicalIds，核对权限和两端文档。未知迁移锁住原目标，不能改道。离开 host 时，同次写入包含只读 transfers 恢复记录；它不作为可写对象投影。刷新核对后使用 recover-transfer 按记录作用域恢复原 IDs，确认目标及撤销历史后清理记录；清理等待或未知期间阻止丢责任的切换。原图关闭时只使无法恢复到该图的迁移历史失效，不销毁共享内容或阻塞其余历史。

## 模板与偏好

DrawingPreferencesStore.read/write 携 AbortSignal；drawingPreferencesScope 是宿主不透明 scope。默认仅实例内存，显式传入 createIndexedDBDrawingPreferencesStore 后跨刷新保存。加载迟到时保留原模板及本次字段修改；读取失败不覆盖未读原件，界面保留会话修改并允许重试。

模板包含本工具样式与参数，不含点、正文、身份、后端 ID 或共享作用域。template 命令支持保存、覆盖、改名、删除、应用和默认；异类工具只能显式选择共同样式。参数通过目录校验，snapshot.parameters 是唯一权威，engine extendData 中的派生参数不作为第二份内容保存。
