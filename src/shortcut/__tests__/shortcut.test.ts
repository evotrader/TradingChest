/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import KeyboardShortcutManager from '../index'

describe('KeyboardShortcutManager', () => {
  let manager: KeyboardShortcutManager

  beforeEach(() => {
    manager = new KeyboardShortcutManager([])
  })

  describe('registerAction', () => {
    it('注册单个 action 处理函数', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      expect(manager.getBindings().length).toBe(0) // 只是注册了 handler，没有绑定快捷键
    })

    it('后注册的 action 覆盖先前的', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      manager.registerAction('test:action', handler1)
      manager.registerAction('test:action', handler2)
      // 触发键盘事件来验证第二个 handler 被使用
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler2).toHaveBeenCalled()
      expect(handler1).not.toHaveBeenCalled()
    })
  })

  describe('registerActions', () => {
    it('批量注册多个 action', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      manager.registerActions({
        'action:1': handler1,
        'action:2': handler2
      })
      manager.addBinding({ combo: 'ctrl+a', action: 'action:1', description_zh: '动作1', description_en: 'Action 1' })
      manager.addBinding({ combo: 'ctrl+b', action: 'action:2', description_zh: '动作2', description_en: 'Action 2' })
      const el = document.createElement('div')
      manager.bindTo(el)

      // 触发第一个快捷键
      let event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler1).toHaveBeenCalled()

      // 触发第二个快捷键
      event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler2).toHaveBeenCalled()
    })
  })

  describe('addBinding', () => {
    it('添加新的快捷键绑定', () => {
      const binding = { combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' }
      manager.addBinding(binding)
      const bindings = manager.getBindings()
      expect(bindings.some(b => b.combo === 'ctrl+t' && b.action === 'test:action')).toBe(true)
    })

    it('同一 combo 的新绑定覆盖旧绑定', () => {
      manager.addBinding({ combo: 'ctrl+t', action: 'action:1', description_zh: '动作1', description_en: 'Action 1' })
      manager.addBinding({ combo: 'ctrl+t', action: 'action:2', description_zh: '动作2', description_en: 'Action 2' })
      const bindings = manager.getBindings()
      const ctrlTBindings = bindings.filter(b => b.combo === 'ctrl+t')
      expect(ctrlTBindings.length).toBe(1)
      expect(ctrlTBindings[0].action).toBe('action:2')
    })

    it('支持各种快捷键组合', () => {
      const combos = ['alt+f', 'shift+ctrl+z', 'escape', 'delete', 'home', 'end', 'ctrl+plus', 'ctrl+minus']
      combos.forEach(combo => {
        manager.addBinding({ combo, action: 'test', description_zh: '测试', description_en: 'Test' })
      })
      const bindings = manager.getBindings()
      expect(bindings.length).toBe(combos.length)
      combos.forEach(combo => {
        expect(bindings.some(b => b.combo === combo)).toBe(true)
      })
    })
  })

  describe('removeBinding', () => {
    it('移除指定 combo 的绑定', () => {
      manager.addBinding({ combo: 'alt+f', action: 'draw:fibonacci', description_zh: '斐波那契', description_en: 'Fibonacci' })
      manager.addBinding({ combo: 'alt+t', action: 'draw:line', description_zh: '趋势线', description_en: 'Trend Line' })
      const countBefore = manager.getBindings().length
      manager.removeBinding('alt+f')
      expect(manager.getBindings().length).toBe(countBefore - 1)
      expect(manager.getBindings().some(b => b.combo === 'alt+f')).toBe(false)
    })

    it('移除不存在的 combo 不抛错', () => {
      expect(() => {
        manager.removeBinding('non:existent')
      }).not.toThrow()
    })

    it('移除后不会触发该快捷键的 handler', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      manager.removeBinding('ctrl+t')
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('setEnabled', () => {
    it('disabled 时不触发任何 handler', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      manager.setEnabled(false)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).not.toHaveBeenCalled()
    })

    it('重新 enabled 后恢复 handler 触发', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      manager.setEnabled(false)
      let event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).not.toHaveBeenCalled()

      manager.setEnabled(true)
      event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })
  })

  describe('bindTo', () => {
    it('绑定到 DOM 元素并响应快捷键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持绑定到 Window', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'escape', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      manager.bindTo(window)
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      window.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('再次 bindTo 会解绑前一个元素', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el1 = document.createElement('div')
      manager.bindTo(el1)
      const el2 = document.createElement('div')
      manager.bindTo(el2)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      // 旧元素解绑后不再触发
      el1.dispatchEvent(event)
      expect(handler.mock.calls.length).toBe(0)
      // 新元素触发恰好一次
      el2.dispatchEvent(event)
      expect(handler.mock.calls.length).toBe(1)
    })

    it('在 input 上不触发快捷键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const input = document.createElement('input')
      document.body.appendChild(input)
      manager.bindTo(document.body)
      input.focus()
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true, target: input })
      input.dispatchEvent(event)
      expect(handler).not.toHaveBeenCalled()
      document.body.removeChild(input)
    })

    it('在 textarea 上不触发快捷键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      manager.bindTo(document.body)
      textarea.focus()
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true, target: textarea })
      textarea.dispatchEvent(event)
      expect(handler).not.toHaveBeenCalled()
      document.body.removeChild(textarea)
    })


    it('快捷键匹配不到时不触发 handler', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      // 发送不匹配的快捷键
      const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).not.toHaveBeenCalled()
    })

    it('快捷键对应的 action 没注册时不触发', () => {
      manager.addBinding({ combo: 'ctrl+t', action: 'unregistered:action', description_zh: '未注册', description_en: 'Unregistered' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      expect(() => {
        el.dispatchEvent(event)
      }).not.toThrow()
    })
  })

  describe('事件处理', () => {
    it('触发快捷键时调用 preventDefault 和 stopPropagation', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation')
      el.dispatchEvent(event)
      expect(preventDefaultSpy).toHaveBeenCalled()
      expect(stopPropagationSpy).toHaveBeenCalled()
    })
  })

  describe('修饰键处理', () => {
    it('支持 ctrl 修饰键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持 shift 修饰键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'shift+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 'T', shiftKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持 alt 修饰键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'alt+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', altKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持多个修饰键组合', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+shift+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, shiftKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('meta 键等价于 ctrl 键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })
  })

  describe('特殊键处理', () => {
    it('支持 escape 键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'escape', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持 delete 键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'delete', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持 backspace 键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'backspace', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持 home 键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'home', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持 end 键', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'end', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: 'End', bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })

    it('支持 plus 和 minus 键', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      manager.registerAction('zoom:in', handler1)
      manager.registerAction('zoom:out', handler2)
      manager.addBinding({ combo: 'ctrl+plus', action: 'zoom:in', description_zh: '放大', description_en: 'Zoom In' })
      manager.addBinding({ combo: 'ctrl+minus', action: 'zoom:out', description_zh: '缩小', description_en: 'Zoom Out' })
      const el = document.createElement('div')
      manager.bindTo(el)

      // 测试 plus
      let event = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler1).toHaveBeenCalled()

      // 测试 minus
      event = new KeyboardEvent('keydown', { key: '-', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler2).toHaveBeenCalled()
    })

    it('= 键映射到 plus', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+plus', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)
      const event = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })
  })

  describe('getBindings', () => {
    it('返回所有绑定的副本', () => {
      manager.addBinding({ combo: 'ctrl+t', action: 'test:1', description_zh: '测试1', description_en: 'Test 1' })
      manager.addBinding({ combo: 'ctrl+s', action: 'test:2', description_zh: '测试2', description_en: 'Test 2' })
      const bindings = manager.getBindings()
      expect(bindings.length).toBe(2)
      expect(bindings[0].combo).toBe('ctrl+t')
      expect(bindings[1].combo).toBe('ctrl+s')
    })

    it('返回的副本修改不影响内部状态', () => {
      manager.addBinding({ combo: 'ctrl+t', action: 'test:1', description_zh: '测试1', description_en: 'Test 1' })
      const bindings1 = manager.getBindings()
      bindings1.pop() // 修改副本
      const bindings2 = manager.getBindings()
      expect(bindings2.length).toBe(1) // 内部状态不变
    })

    it('自定义初始化时返回自定义绑定', () => {
      const customBindings = [
        { combo: 'custom+1', action: 'custom:1', description_zh: '自定义1', description_en: 'Custom 1' }
      ]
      const mgr = new KeyboardShortcutManager(customBindings)
      expect(mgr.getBindings().length).toBe(1)
      expect(mgr.getBindings()[0].combo).toBe('custom+1')
    })
  })

  describe('getHandler', () => {
    it('bindTo 前返回 null', () => {
      expect(manager.getHandler()).toBeNull()
    })

    it('bindTo 后返回事件处理函数', () => {
      const el = document.createElement('div')
      manager.bindTo(el)
      expect(manager.getHandler()).not.toBeNull()
      expect(typeof manager.getHandler()).toBe('function')
    })

    it('unbind 后返回 null', () => {
      const el = document.createElement('div')
      manager.bindTo(el)
      manager.unbind()
      expect(manager.getHandler()).toBeNull()
    })
  })

  describe('unbind', () => {
    it('unbind 后 getHandler 返回 null', () => {
      const el = document.createElement('div')
      manager.bindTo(el)
      manager.unbind()
      expect(manager.getHandler()).toBeNull()
    })

    it('unbind 后 dispatch 事件不触发 handler', () => {
      const mgr = new KeyboardShortcutManager()
      const handler = vi.fn()
      mgr.registerAction('chart:cancelDraw', handler)

      const el = document.createElement('div')
      mgr.bindTo(el)

      // Before unbind: handler fires
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1)

      mgr.unbind()

      // After unbind: handler should NOT fire
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1) // still 1, not 2
    })
  })

  describe('case 敏感性', () => {
    it('键名大小写不敏感', () => {
      const handler = vi.fn()
      manager.registerAction('test:action', handler)
      manager.addBinding({ combo: 'ctrl+t', action: 'test:action', description_zh: '测试', description_en: 'Test' })
      const el = document.createElement('div')
      manager.bindTo(el)

      // 发送大写的 T
      const event = new KeyboardEvent('keydown', { key: 'T', ctrlKey: true, bubbles: true })
      el.dispatchEvent(event)
      expect(handler).toHaveBeenCalled()
    })
  })
})
