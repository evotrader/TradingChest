# 接入数据
可以使用默认的数据，和自定义数据完成数据接入。

## 使用默认数据
默认数据来源于 https://polygon.io/ ，在使用前需要去申请API key。申请完成后，通过内置`DefaultDatafeed`这个类完成数据接入。
示例：
```typescript
import { KLineChartPro, DefaultDatafeed } from '@klinecharts/pro'
const chart = new KLineChartPro({
  container: document.getElementById('container'),
  datafeed: new DefaultDatafeed(`${polygonIoApiKey}`)
})
```

## 使用自定义数据
需要使用自定义数据，只需要按如下步骤即可。

### 第一步，实现数据接入API
```typescript
class CustomDatafeed {
  /**
   * 模糊搜索标的
   * 在搜索框输入的时候触发
   * 返回标的信息数组
   */
  searchSymbols (search?: string): Promise<SymbolInfo[]> {
    // 根据模糊字段远程拉取标的数据
  }

  /**
   * 获取历史k线数据
   * 当标的和周期发生变化的时候触发
   * 
   * 返回标的k线数据数组
   */
  getHistoryKLineData (symbol: SymbolInfo, period: Period, from: number, to: number): Promise<KLineData[]> {
    // 完成数据请求
  }

  /**
   * 订阅标的在某个周期的实时数据
   * 当标的和周期发生变化的时候触发
   * 
   * 通过callback告知图表接收数据
   */
  subscribe (symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    // 完成ws订阅或者http轮询
  }

  /**
   * 取消订阅标的在某个周期的实时数据
   * 当标的和周期发生变化的时候触发
   * 
   */ 
  unsubscribe (symbol: SymbolInfo, period: Period): void {
    // 完成ws订阅取消或者http轮询取消
  }
}
```

### 第二步，接入自定义数据
```typescript
import { KLineChartPro, DefaultDatafeed } from '@klinecharts/pro'
const chart = new KLineChartPro({
  container: document.getElementById('container'),
  datafeed: new CustomDatafeed()
})
```

## 0.6.0 引擎迁移

本版固定 `klinecharts@10.1.0`，`getChart()` 返回 v10 Chart。宿主使用库自有 Period，加载器统一转换为 `{type, span}`；直接调用引擎时使用 v10 的字符串 action、`getIndicators(filter)`、`getOverlays(filter)` 和独立价格轴。旧 `applyNewData`／`updateData` 不再可用。

`reloadData({preserveViewport:true})` 先成功读取，再替换数据。失败保留最后确认的行情、视窗与绘图；回放中须先用退出／重试入口恢复实时模式。币种等元数据缺失时显示未知，不从标的名称推断。

当前布局只通过 `captureLayout`、`saveLayoutV3`、`loadLayoutV3`、`restoreLayout`、`deleteLayoutV3`、`listLayoutsV3` 写读 v3。读取结果为 `ok`／`missing`／`error`；错误携带 code 和 message。旧 v1／v2 只在内存迁移，原键保留；新版损坏不会回落旧记录。恢复前先准备同身份、同周期的数据。后端标注只保存引用，本地绘图须显式提供 IDs，订单、成交、持仓及报警状态不写入布局。

设置面板和快捷键使用 `getYAxes`／`overrideYAxis` 修改真实价格轴，名称为 `normal`／`percentage`／`logarithm`；价格轴类型不再写入 `styles.yAxis.type`。

图表支持浏览器打包及 UMD，React 分析入口保持独立。原始 Node 图表导入不属于 SSR 支持范围。CJS 浏览器子入口为规避上游 CJS→ESM 型 UMD 入口缺陷，打包同一发布版的真实 ESM 引擎；ESM 和 UMD 仍消费固定 peer。
