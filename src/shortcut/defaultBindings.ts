/**
 * 默认快捷键映射
 * descriptionKey 对应 i18n key
 */
export interface ShortcutBinding {
  combo: string  // 例如 'alt+t', 'ctrl+z', 'escape'
  action: string
  descriptionKey: string
}

const defaultBindings: ShortcutBinding[] = [
  // 绘图工具快捷键
  { combo: 'alt+t', action: 'draw:straightLine', descriptionKey: 'shortcut_trend_line' },
  { combo: 'alt+h', action: 'draw:horizontalStraightLine', descriptionKey: 'shortcut_horizontal_line' },
  { combo: 'alt+v', action: 'draw:verticalStraightLine', descriptionKey: 'shortcut_vertical_line' },
  { combo: 'alt+f', action: 'draw:fibonacciLine', descriptionKey: 'shortcut_fibonacci' },
  { combo: 'alt+r', action: 'draw:rect', descriptionKey: 'shortcut_rectangle' },
  { combo: 'alt+b', action: 'draw:brush', descriptionKey: 'shortcut_brush' },
  { combo: 'alt+m', action: 'draw:dateAndPriceRange', descriptionKey: 'shortcut_measurement' },

  // 图表操作快捷键
  { combo: 'escape', action: 'chart:cancelDraw', descriptionKey: 'shortcut_cancel_draw' },
  { combo: 'delete', action: 'chart:deleteSelected', descriptionKey: 'shortcut_delete_selected' },
  { combo: 'alt+s', action: 'chart:screenshot', descriptionKey: 'shortcut_screenshot' },

  // 导航快捷键
  { combo: 'home', action: 'nav:scrollToStart', descriptionKey: 'shortcut_scroll_start' },
  { combo: 'end', action: 'nav:scrollToEnd', descriptionKey: 'shortcut_scroll_end' },
  { combo: 'ctrl+plus', action: 'nav:zoomIn', descriptionKey: 'shortcut_zoom_in' },
  { combo: 'ctrl+minus', action: 'nav:zoomOut', descriptionKey: 'shortcut_zoom_out' },

  // 显示切换快捷键
  { combo: 'alt+c', action: 'toggle:crosshair', descriptionKey: 'shortcut_crosshair' },
  { combo: 'alt+g', action: 'toggle:grid', descriptionKey: 'shortcut_grid' },
  { combo: 'alt+l', action: 'toggle:logScale', descriptionKey: 'shortcut_log_scale' }
]

export default defaultBindings
