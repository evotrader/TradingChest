import defaultBindings, { ShortcutBinding } from './defaultBindings'

/**
 * 快捷键管理器
 * 管理图表的键盘快捷键绑定和执行
 */
export class KeyboardShortcutManager {
  private bindings: ShortcutBinding[]
  private handler: ((e: KeyboardEvent) => void) | null = null
  private actionHandlers: Map<string, () => void> = new Map()
  private enabled: boolean = true

  constructor(customBindings?: ShortcutBinding[]) {
    this.bindings = customBindings ?? [...defaultBindings]
  }

  /**
   * 注册操作处理函数
   */
  registerAction(action: string, handler: () => void): void {
    this.actionHandlers.set(action, handler)
  }

  /**
   * 批量注册操作处理函数
   */
  registerActions(handlers: Record<string, () => void>): void {
    Object.entries(handlers).forEach(([action, handler]) => {
      this.actionHandlers.set(action, handler)
    })
  }

  /**
   * 添加自定义快捷键
   */
  addBinding(binding: ShortcutBinding): void {
    // 移除同一 combo 的旧绑定
    this.bindings = this.bindings.filter(b => b.combo !== binding.combo)
    this.bindings.push(binding)
  }

  /**
   * 移除快捷键
   */
  removeBinding(combo: string): void {
    this.bindings = this.bindings.filter(b => b.combo !== combo)
  }

  /**
   * 启用/禁用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * 将键盘事件转换为 combo 字符串
   */
  private eventToCombo(e: KeyboardEvent): string {
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.shiftKey) parts.push('shift')
    if (e.altKey) parts.push('alt')

    const key = e.key.toLowerCase()
    // 标准化特殊键名
    const keyMap: Record<string, string> = {
      'escape': 'escape',
      'delete': 'delete',
      'backspace': 'backspace',
      'home': 'home',
      'end': 'end',
      '+': 'plus',
      '-': 'minus',
      '=': 'plus'  // = 键通常和 + 在同一位置
    }
    const normalizedKey = keyMap[key] ?? key

    // 跳过修饰键本身
    if (['control', 'shift', 'alt', 'meta'].includes(normalizedKey)) return ''

    parts.push(normalizedKey)
    return parts.join('+')
  }

  /**
   * 绑定到 DOM 元素
   */
  bindTo(element: HTMLElement | Window): void {
    this.unbind()
    this.handler = (e: KeyboardEvent) => {
      if (!this.enabled) return

      // 如果焦点在 input/textarea 上，忽略快捷键
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const combo = this.eventToCombo(e)
      if (!combo) return

      const binding = this.bindings.find(b => b.combo === combo)
      if (binding) {
        const handler = this.actionHandlers.get(binding.action)
        if (handler) {
          e.preventDefault()
          e.stopPropagation()
          handler()
        }
      }
    }
    element.addEventListener('keydown', this.handler as EventListener)
  }

  /**
   * 解绑
   */
  unbind(): void {
    // 这里无法自动解绑因为我们不保存 element 引用
    // 调用者需要在 cleanup 时手动管理
    this.handler = null
  }

  /**
   * 获取所有绑定（用于 UI 显示）
   */
  getBindings(): ShortcutBinding[] {
    return [...this.bindings]
  }

  /**
   * 获取事件处理函数（用于外部绑定管理）
   */
  getHandler(): ((e: KeyboardEvent) => void) | null {
    return this.handler
  }
}

export { defaultBindings }
export type { ShortcutBinding }
export default KeyboardShortcutManager
