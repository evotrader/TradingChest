import {describe,it,expect,vi} from 'vitest'
import type {Chart,Overlay} from 'klinecharts'
import {DrawingProjectionInventory} from '../projectionInventory'

function setup(){
  const values=new Map<string,Overlay>()
  const chart={
    createOverlay:vi.fn((input:{id:string;name:string})=>{values.set(input.id,{...input} as Overlay);return input.id}),
    removeOverlay:vi.fn((input:{id:string})=>values.delete(input.id)),
    getOverlays:vi.fn((filter?:{id?:string})=>[...values.values()].filter(value=>!filter?.id||value.id===filter.id))
  } as unknown as Chart
  return {chart,values,inventory:new DrawingProjectionInventory(chart)}
}
describe('projection engine identity inventory',()=>{
  it('indexes a stable read batch once without repeatedly copying the growing creation inventory',()=>{
    const {chart,values,inventory}=setup(),reads=vi.mocked(chart.getOverlays)
    for(let i=0;i<128;i++){
      expect(inventory.get(String(i))).toBeUndefined();chart.removeOverlay({id:String(i)});chart.createOverlay({id:String(i),name:'segment'});expect(inventory.get(String(i))).toBe(values.get(String(i)))
    }
    expect(reads.mock.calls.filter(([filter])=>!filter)).toHaveLength(0)
    for(let i=0;i<128;i++)expect(inventory.get(String(i))).toBe(values.get(String(i)))
    expect(reads.mock.calls.filter(([filter])=>!filter)).toHaveLength(1)
    chart.removeOverlay({id:'0'});expect(inventory.get('0')).toBeUndefined();inventory.dispose()
  })
  it('respects a getOverlays decorator even after a complete inventory was cached',()=>{
    const {chart,inventory}=setup();for(const id of ['a','b'])chart.createOverlay({id,name:'segment'})
    inventory.get('a');inventory.get('b');chart.getOverlays=vi.fn(()=>[])
    expect(inventory.get('a')).toBeUndefined();inventory.dispose()
  })
  it('observes a host replacing the same ID and preserves real overlay identity',()=>{
    const {chart,inventory}=setup()
    chart.createOverlay({id:'user',name:'segment'})
    const original=inventory.get('user')
    expect(inventory.get('user')).toBe(original)
    chart.removeOverlay({id:'user'});chart.createOverlay({id:'user',name:'host-owned'})
    expect(inventory.get('user')).not.toBe(original);expect(inventory.get('user')?.name).toBe('host-owned')
    inventory.dispose()
  })
  it('invalidates native removals and does not override a host method decorator',()=>{
    const {chart,values,inventory}=setup()
    chart.createOverlay({id:'user',name:'segment'});expect(inventory.get('user')).toBeDefined()
    values.delete('user');inventory.invalidate();expect(inventory.get('user')).toBeUndefined()
    const original=chart.createOverlay,decorator=((...args:Parameters<Chart['createOverlay']>)=>original.apply(chart,args)) as Chart['createOverlay']
    chart.createOverlay=decorator
    values.set('foreign',{id:'foreign',name:'foreign'} as Overlay)
    expect(inventory.get('foreign')).toBe(values.get('foreign'))
    inventory.dispose();expect(chart.createOverlay).toBe(decorator)
  })
})
