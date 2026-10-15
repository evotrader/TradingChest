import { describe, it, expect, beforeEach, vi } from 'vitest'
import {saveLayoutV3 as saveLayout,loadLayoutV3,deleteLayoutV3 as deleteLayout,listLayoutsV3} from '../index'
const loadLayout=(key:string)=>{const result=loadLayoutV3(key);return result.status==='ok'?result.value:null}
const listLayouts=()=>{const result=listLayoutsV3();return result.status==='ok'?result.value:[]}

const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key]
  }),
  get length() {
    return Object.keys(store).length
  },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  clear: vi.fn(() => {
    Object.keys(store).forEach(k => delete store[k])
  })
}

vi.stubGlobal('localStorage', localStorageMock)

describe('persistence', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('saveLayout & loadLayout', () => {
    it('should save and load a layout correctly', () => {
      const layout = {
        theme: 'dark',
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        indicators: [{name:'MA',placement:'main' as const},{name:'VOL',placement:'sub' as const}], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      saveLayout('test1', layout)
      const loaded = loadLayout('test1')

      expect(loaded).not.toBeNull()
      expect(loaded!.theme).toBe('dark')
      expect(loaded!.locale).toBe('zh-CN')
      expect(loaded!.timezone).toBe('Asia/Shanghai')
      expect(loaded!.indicators.filter(i=>i.placement==='main').map(i=>i.name)).toEqual(['MA'])
      expect(loaded!.indicators.filter(i=>i.placement==='sub').map(i=>i.name)).toEqual(['VOL'])
      expect(loaded!.version).toBe(3)
      expect(loaded!.timestamp).toBeGreaterThan(0)
    })

    it('should add version and timestamp automatically', () => {
      const beforeSave = Date.now()
      const layout = {
        theme: 'light',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      saveLayout('versioned', layout)
      const loaded = loadLayout('versioned')!

      expect(loaded.version).toBe(3)
      expect(loaded.timestamp).toBeGreaterThanOrEqual(beforeSave)
      expect(loaded.timestamp).toBeLessThanOrEqual(Date.now())
    })

    it('should preserve complex overlay data', () => {
      const layout = {
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: [
          {
            name: 'line1',
            groupId: 'group-1',
            points: [
              { timestamp: 1000, value: 100 },
              { timestamp: 2000, value: 200 }
            ],
            lock: true,
            visible: true,
            extendData: { color: '#ff0000' }
          }
        ]
      }

      saveLayout('overlay', layout)
      const loaded = loadLayout('overlay')!

      expect(loaded.overlayData).toHaveLength(1)
      expect(loaded.overlayData[0].name).toBe('line1')
      expect(loaded.overlayData[0].points).toHaveLength(2)
      expect(loaded.overlayData[0].lock).toBe(true)
      expect(loaded.overlayData[0].extendData).toEqual({ color: '#ff0000' })
    })
  })

  describe('loadLayout', () => {
    it('should return null for nonexistent key', () => {
      expect(loadLayout('nonexistent')).toBeNull()
    })

    it('should return null for corrupted JSON', () => {
      store['trading-chest-layout-v3-corrupted'] = 'not valid json'
      expect(loadLayout('corrupted')).toBeNull()
    })

    it('should return null for invalid version', () => {
      const data = {
        version: 999,
        timestamp: Date.now(),
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: []
      }
      store['trading-chest-layout-v3-invalid-version'] = JSON.stringify(data)
      expect(loadLayout('invalid-version')).toBeNull()
    })

    it('should handle localStorage errors gracefully', () => {
      const getItemSpy = vi.spyOn(localStorageMock, 'getItem').mockImplementation(() => {
        throw new Error('Storage error')
      })

      expect(loadLayout('error-key')).toBeNull()
      getItemSpy.mockRestore()
    })
  })

  describe('deleteLayout', () => {
    it('should remove a layout so it cannot be loaded', () => {
      const layout = {
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      saveLayout('delme', layout)
      expect(loadLayout('delme')).not.toBeNull()

      deleteLayout('delme')
      expect(loadLayout('delme')).toBeNull()
    })

    it('should not throw error when deleting nonexistent key', () => {
      expect(() => deleteLayout('nonexistent')).not.toThrow()
    })
  })

  describe('listLayouts', () => {
    it('should return empty array when no layouts exist', () => {
      const list = listLayouts()
      expect(list).toEqual([])
    })

    it('should return all saved layouts with key and timestamp', () => {
      const layout1 = {
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      const layout2 = {
        theme: 'light',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      saveLayout('first', layout1)
      // Add a small delay to ensure different timestamps
      const firstTimestamp = Date.now()
      saveLayout('second', layout2)

      const list = listLayouts()

      expect(list).toHaveLength(2)
      expect(list.some(item => item.key === 'first')).toBe(true)
      expect(list.some(item => item.key === 'second')).toBe(true)
    })

    it('should return layouts sorted by timestamp descending (newest first)', () => {
      const layout = {
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      saveLayout('a', layout)
      // Simulate time passing with manual timestamp manipulation
      const bData = {
        version: 3,
        timestamp: Date.now() + 1000,
        ...layout
      }
      store['trading-chest-layout-v3-b'] = JSON.stringify(bData)

      const list = listLayouts()

      expect(list.length).toBeGreaterThanOrEqual(1)
      for (let i = 0; i < list.length - 1; i++) {
        expect(list[i].timestamp).toBeGreaterThanOrEqual(list[i + 1].timestamp)
      }
    })

    it('should surface corrupted layouts without hiding existing valid ones', () => {
      const layout = {
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      saveLayout('valid', layout)
      store['trading-chest-layout-v3-corrupted'] = 'invalid json'

      expect(listLayoutsV3()).toMatchObject({status:'error',code:'read'})
      expect(loadLayout('valid')).not.toBeNull()
    })

    it('should ignore non-trading-chest keys in storage', () => {
      const layout = {
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
        indicators: [], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      saveLayout('trading', layout)
      store['some-other-key'] = 'value'
      store['another-app-data'] = 'data'

      const list = listLayouts()

      expect(list).toHaveLength(1)
      expect(list[0].key).toBe('trading')
    })
  })

  describe('integration', () => {
    it('should handle multiple save/load/delete cycles', () => {
      const layout = {
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
        indicators: [{name:'MA',placement:'main' as const},{name:'VOL',placement:'sub' as const}], panes:[], axes:[],
        styles: null,
        overlayData: []
      }

      // Create multiple layouts
      saveLayout('layout1', layout)
      saveLayout('layout2', { ...layout, theme: 'light' })
      saveLayout('layout3', { ...layout, locale: 'zh-CN' })

      expect(listLayouts()).toHaveLength(3)

      // Update one
      deleteLayout('layout2')
      expect(listLayouts()).toHaveLength(2)

      // Verify remaining ones are intact
      const list = listLayouts()
      expect(list.some(item => item.key === 'layout1')).toBe(true)
      expect(list.some(item => item.key === 'layout3')).toBe(true)
      expect(list.some(item => item.key === 'layout2')).toBe(false)

      // Verify data integrity
      const loaded1 = loadLayout('layout1')!
      expect(loaded1.indicators.filter(i=>i.placement==='main').map(i=>i.name)).toEqual(['MA'])
      const loaded3 = loadLayout('layout3')!
      expect(loaded3.locale).toBe('zh-CN')
    })
  })
})
