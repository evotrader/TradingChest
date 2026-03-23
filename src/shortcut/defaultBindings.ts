/**
 * 默认快捷键映射
 * 格式：{ combo: string, action: string, description_zh: string, description_en: string }
 */
export interface ShortcutBinding {
  combo: string  // 例如 'alt+t', 'ctrl+z', 'escape'
  action: string
  description_zh: string
  description_en: string
}

const defaultBindings: ShortcutBinding[] = [
  // 绘图工具快捷键
  { combo: 'alt+t', action: 'draw:straightLine', description_zh: '趋势线', description_en: 'Trend Line' },
  { combo: 'alt+h', action: 'draw:horizontalStraightLine', description_zh: '水平线', description_en: 'Horizontal Line' },
  { combo: 'alt+v', action: 'draw:verticalStraightLine', description_zh: '垂直线', description_en: 'Vertical Line' },
  { combo: 'alt+f', action: 'draw:fibonacciLine', description_zh: '斐波那契回调', description_en: 'Fibonacci Retracement' },
  { combo: 'alt+r', action: 'draw:rect', description_zh: '矩形', description_en: 'Rectangle' },
  { combo: 'alt+b', action: 'draw:brush', description_zh: '画笔', description_en: 'Brush' },
  { combo: 'alt+m', action: 'draw:dateAndPriceRange', description_zh: '综合测量', description_en: 'Measurement' },

  // 图表操作快捷键
  { combo: 'escape', action: 'chart:cancelDraw', description_zh: '取消绘制', description_en: 'Cancel Drawing' },
  { combo: 'delete', action: 'chart:deleteSelected', description_zh: '删除选中', description_en: 'Delete Selected' },
  { combo: 'alt+s', action: 'chart:screenshot', description_zh: '截图', description_en: 'Screenshot' },

  // 导航快捷键
  { combo: 'home', action: 'nav:scrollToStart', description_zh: '跳到起始', description_en: 'Scroll to Start' },
  { combo: 'end', action: 'nav:scrollToEnd', description_zh: '跳到最新', description_en: 'Scroll to Latest' },
  { combo: 'ctrl+plus', action: 'nav:zoomIn', description_zh: '放大', description_en: 'Zoom In' },
  { combo: 'ctrl+minus', action: 'nav:zoomOut', description_zh: '缩小', description_en: 'Zoom Out' },

  // 显示切换快捷键
  { combo: 'alt+c', action: 'toggle:crosshair', description_zh: '十字光标', description_en: 'Crosshair' },
  { combo: 'alt+g', action: 'toggle:grid', description_zh: '网格线', description_en: 'Grid' },
  { combo: 'alt+l', action: 'toggle:logScale', description_zh: '对数坐标', description_en: 'Log Scale' }
]

export default defaultBindings
