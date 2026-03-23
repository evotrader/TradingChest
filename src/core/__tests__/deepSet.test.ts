import { describe, it, expect } from 'vitest'
import { deepSet } from '../deepSet'

describe('deepSet', () => {
  it('sets a nested property', () => {
    const obj: any = {}
    deepSet(obj, 'a.b.c', 42)
    expect(obj.a.b.c).toBe(42)
  })

  it('overwrites existing value', () => {
    const obj = { a: { b: 1 } }
    deepSet(obj, 'a.b', 2)
    expect(obj.a.b).toBe(2)
  })

  it('sets top-level property', () => {
    const obj: any = {}
    deepSet(obj, 'x', 'hello')
    expect(obj.x).toBe('hello')
  })

  it('rejects __proto__ path segments', () => {
    const obj: any = {}
    deepSet(obj, '__proto__.polluted', true)
    expect(({} as any).polluted).toBeUndefined()
  })

  it('rejects constructor path segments', () => {
    const obj: any = {}
    deepSet(obj, 'constructor.prototype.polluted', true)
    expect(({} as any).polluted).toBeUndefined()
  })
})
