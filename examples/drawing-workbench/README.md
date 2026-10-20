# 独立绘图工作台示例 / Drawing workbench example

根目录先 `npm run build && npm run prepare:examples`，然后本目录 `npm ci && npm run dev`。示例实际安装同版 tarball，不通过源码 alias。`npm test` 启动独立 loopback HTTP 服务并验证 CAS、明确拒绝、冲突和已提交但响应丢失后的固定 ID 核对。

A/B 借用同一个宿主 registry；C 使用独立 registry，点“刷新独立实例 C”读取已保存文档。图内“绘图管理”可以选择本图、工作台或宿主共享，操作模板、分组、过滤及批量样式。先点“保存共享绘图”，再保存工作台；刷新页面后点恢复。模板与偏好经首方 IndexedDB 跨重开保存。示例所有者在三个工作台退订后释放 registry 和 store。

共享存储选择器的 HTTP 选项仅在 Vite 开发服务可用；静态网站禁用该选项。HTTP 服务只绑定 loopback，记录仅存在本进程，不是生产持久化实现，不向真实账户或行情 API 请求。生产消费者应将 `http-store.mjs` 接到自己的已持久化 CAS 服务，并保留 `null expectedRevision` 的只创建语义；未知响应必须核对固定 ID，不自动重发。

The three workspaces consume the installed public package. A and B borrow one host session registry; C refreshes explicitly through an independent registry. IndexedDB survives page reloads. The optional loopback HTTP example demonstrates revision CAS and uncertain-write reconciliation; its records last only for the local dev-server process. Static builds disable that option. All market inputs are synthetic and isolated.

0.11 的“添加量价估算示例”直接使用已安装包的 `commitDrawing`，只依赖该图已确认的普通 OHLCV。按钮添加独立分组的 AVWAP 与 FRVP，图内工具栏仍可交互创建、编辑、共享和保存。结果明确是当前周期估算，不接 EvoTrader 私有接口。
