import {describe,it,expect,vi} from 'vitest'
import {createOpaqueId} from '../ids'

describe('opaque IDs without randomUUID',()=>{
  it('retains UUID v4 encoding and independent values using the ordinary random API',()=>{
    const nativeCrypto=globalThis.crypto
    vi.stubGlobal('crypto',{getRandomValues:nativeCrypto.getRandomValues.bind(nativeCrypto)})
    try{
      const first=createOpaqueId(),second=createOpaqueId()
      expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(second).not.toBe(first)
    }finally{vi.unstubAllGlobals()}
  })
})
