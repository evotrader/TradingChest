# 主题定制
图表内置了`dark`和`light`两种主题，默认是`light`。如果需要定制其它主题，需要完成核心图表的样式定制和css的定制。

## 核心图表的定制
通过api `setStyles(styles)`设置。

## css相关样式
css样式采用css变量控制颜色，具体如下，
```css
.klinecharts-pro {
  /* 亮色主题颜色 */
  --klinecharts-pro-primary-color: #1677ff;
  --klinecharts-pro-hover-background-color: rgba(22, 119, 255, 0.15);
  --klinecharts-pro-background-color: #FFFFFF;
  --klinecharts-pro-popover-background-color: #FFFFFF;
  --klinecharts-pro-text-color: #051441;
  --klinecharts-pro-text-second-color: #76808F;
  --klinecharts-pro-border-color: #ebedf1;
  --klinecharts-pro-selected-color: rgba(22, 119, 255, 0.15);
}

/* 暗色主题颜色 */
.klinecharts-pro[data-theme="dark"] {
  --klinecharts-pro-hover-background-color: rgba(22, 119, 255, 0.15);
  --klinecharts-pro-background-color: #151517;;
  --klinecharts-pro-popover-background-color: #1c1c1f;;
  --klinecharts-pro-text-color: #F8F8F8;
  --klinecharts-pro-text-second-color: #929AA5;
  --klinecharts-pro-border-color: #292929;
}
```


## 0.6.0 引擎迁移

本版固定 `klinecharts@10.1.0`，`getChart()` 返回 v10 Chart。宿主使用库自有 Period，加载器统一转换为 `{type, span}`；直接调用引擎时使用 v10 的字符串 action、`getIndicators(filter)`、`getOverlays(filter)` 和独立价格轴。旧 `applyNewData`／`updateData` 不再可用。

`reloadData({preserveViewport:true})` 先成功读取，再替换数据。失败保留最后确认的行情、视窗与绘图；回放中须先用退出／重试入口恢复实时模式。币种等元数据缺失时显示未知，不从标的名称推断。

当前布局只通过 `captureLayout`、`saveLayoutV3`、`loadLayoutV3`、`restoreLayout`、`deleteLayoutV3`、`listLayoutsV3` 写读 v3。读取结果为 `ok`／`missing`／`error`；错误携带 code 和 message。旧 v1／v2 只在内存迁移，原键保留；新版损坏不会回落旧记录。恢复前先准备同身份、同周期的数据。后端标注只保存引用，本地绘图须显式提供 IDs，订单、成交、持仓及报警状态不写入布局。

设置面板和快捷键使用 `getYAxes`／`overrideYAxis` 修改真实价格轴，名称为 `normal`／`percentage`／`logarithm`；价格轴类型不再写入 `styles.yAxis.type`。

图表支持浏览器打包及 UMD，React 分析入口保持独立。原始 Node 图表导入不属于 SSR 支持范围。CJS 浏览器子入口为规避上游 CJS→ESM 型 UMD 入口缺陷，打包同一发布版的真实 ESM 引擎；ESM 和 UMD 仍消费固定 peer。
