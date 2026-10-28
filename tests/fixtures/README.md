# 历史读取兼容性夹具

`trading-chest-0.14.0.tgz` 来自本地已验收的 0.14 构建产物和对应包元数据，在首次编译 0.15 之前通过 `npm pack --ignore-scripts --pack-destination tests/fixtures` 封装。

它只用于隔离运行上一版的真实公开读取接口，验证新版文档会被明确拒绝且原件保留。测试应先用旧格式正控证明已到达读取与校验路径；不能仅以任意异常代替拒绝证据。该夹具不表示 0.14 已发布到 npm。

发布包的 `files` 列表不包含 `tests/`，因此新版 npm 包不携带旧包。夹具包含自己的 Apache-2.0 许可证。

`trading-chest-0.15.0.tgz` 来自 npm 官方已发布版本，通过 `npm pack trading-chest@0.15.0 --ignore-scripts --pack-destination tests/fixtures` 获取。新版级别提醒测试先创建旧版 V1 规则，再验证旧版实际 `restoreDrawingAlerts` 拒绝 V2 且保留原规则。
