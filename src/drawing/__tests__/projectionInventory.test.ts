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
