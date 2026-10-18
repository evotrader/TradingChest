# next-app 独立示例

使用隔离合成输入，不连接 EvoTrader 或市场服务。

从库目录先运行 `npm run build && npm run prepare:examples`，脚本生成同版 tarball 并更新各示例本地包的完整性，再进入本目录 `npm ci`。修改库后重复准备命令即可，无需手改锁文件。发布后也可 `npm install trading-chest@0.9.0`，再保留项目自己的锁文件。

运行 `npm run build`；`npm start` 必须有 Node 服务，不能部署为静态 Pages。服务端只组合客户端组件，函数工厂在客户端声明。
