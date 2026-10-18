# 介绍

TradingChest 是基于 KLineChart 的开源金融图表库，提供图表 UI、分析图层、比较、已加载历史回放与命名多图工作台。0.9.0 增加 React 图表／工作台组件、无 DOM 的历史校验入口，以及 React、Next.js、Vue 和数据适配独立示例。

宿主决定有效标的与周期、行情来源与单位、指标／分析计算、存储实现和业务回调。组件不依赖 EvoTrader API、账户或鉴权，也不把演示数据作为生产回退。数据缺失、读取失败与未对齐结果分别展示。

纯浏览器项目从 `trading-chest/chart` 接入；React 使用 `trading-chest/react`；无 DOM 的数据适配检查使用 `trading-chest/testing`。Solid 分析组件仍从 `trading-chest/solid` 引入。见[快速开始](./getting-started)、[框架接入](./frameworks)与[数据契约](./data-access)。

项目衍生自 [KLineChart Pro](https://github.com/klinecharts/pro)，使用 [KLineChart](https://github.com/klinecharts/KLineChart) 10.1.0 引擎，遵守 Apache License 2.0，保留上游许可与署名。[TradingChest 源码和贡献入口](https://github.com/evotrader/TradingChest)。
