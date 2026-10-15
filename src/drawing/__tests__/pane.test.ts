import {describe,it,expect} from 'vitest'
import type {Chart} from 'klinecharts'
import {resolveDrawingPane} from '../pane'
const identities=[{id:'vol-b',name:'VOL',calcParams:[2,3,4]}]
const chart=(existing:boolean,duplicate=false)=>({getPaneOptions:(id:string)=>existing&&id==='pane-b'?{id}:null,getIndicators:()=>[{id:'vol-a',name:'VOL',calcParams:duplicate?[2,3,4]:[5,10,20],paneId:'pane-a'},{...identities[0],paneId:'pane-b'}]}) as unknown as Chart
describe('drawing pane identity',()=>{
 it('keeps an explicit existing pane even with duplicate indicator names',()=>expect(resolveDrawingPane(chart(true),'pane-b',identities)).toBe('pane-b'))
 it('matches real indicator ID or unique parameters after pane rekeying',()=>{expect(resolveDrawingPane(chart(false),'old-pane',identities)).toBe('pane-b');expect(resolveDrawingPane(chart(false),'old-pane',[{name:'VOL',calcParams:[2,3,4]}])).toBe('pane-b')})
 it('keeps a preserved indicator ID when its parameters changed and another pane has the old parameters',()=>{
  const current={getPaneOptions:()=>null,getIndicators:()=>[{id:'vol-a',name:'VOL',calcParams:[2,3,4],paneId:'pane-a'},{id:'vol-b',name:'VOL',calcParams:[8,9,10],paneId:'rekeyed-b'}]} as unknown as Chart
  expect(resolveDrawingPane(current,'old-pane',identities)).toBe('rekeyed-b')
 })
 it('rejects ambiguous duplicates and missing identity rather than choosing the first pane',()=>{expect(()=>resolveDrawingPane(chart(false,true),'old-pane',[{name:'VOL',calcParams:[2,3,4]}])).toThrow('多个匹配');expect(()=>resolveDrawingPane(chart(false),'old-pane',[])).toThrow('缺少指标身份')})
})
