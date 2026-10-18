// @vitest-environment jsdom
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {act} from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {TradingChart} from '../TradingChart'
import {TradingWorkspace} from '../TradingWorkspace'
import {useLatest} from '../lifecycle'
import type {ChartProOptions} from '../../types'
import type {ChartWorkspaceOptions} from '../../workspace/types'

const records=vi.hoisted(()=>({chart:[] as ChartProOptions[],workspace:[] as ChartWorkspaceOptions[]}))
vi.mock('../../chart',()=>({
  KLineChartPro:class {constructor(options:ChartProOptions){records.chart.push(options)}dispose(){}getChart(){return null}},
  ChartWorkspace:class {constructor(options:ChartWorkspaceOptions){records.workspace.push(options)}dispose(){}resize(){}},
}))
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
const roots:Array<ReturnType<typeof createRoot>>=[]
afterEach(async()=>{
  await act(async()=>{for(const root of roots.splice(0))root.unmount()})
  document.body.replaceChildren();records.chart.length=0;records.workspace.length=0
})
function createHost(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);return {host,root}}

it.each(['chart','workspace'] as const)('keeps committed %s callbacks through suspended, cancelled and committed transitions',async kind=>{
  const {host,root}=createHost(),calls:number[]=[],pending=new Promise<never>(()=>{})
  let change!:(value:number)=>void
  function Block({value}:{value:number}){if(value===1)throw pending;return React.createElement('p',null,`committed:${value}`)}
  function App(){
    const [value,setValue]=React.useState(0);change=setValue
    return React.createElement(React.Suspense,{fallback:'pending'},kind==='chart'
      ?React.createElement(TradingChart,{height:400,initialOptions:{symbol:{ticker:'A'},period:{multiplier:1,timespan:'day',text:'D'}},
        createDatafeed:()=>({searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:[],hasMoreBefore:false}),subscribe(){},unsubscribe(){}}),events:{onDataReady:()=>calls.push(value)}})
      :React.createElement(TradingWorkspace,{height:400,initialOptions:{context:'C',symbols:[{ticker:'A'}],initialSymbol:{ticker:'A'},getPeriods:async()=>[]},renderCell:()=>null,onActiveCell:()=>calls.push(value)}),
      React.createElement(Block,{value}))
  }
  await act(async()=>root.render(React.createElement(App)))
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))})
  const notify=()=>{
    if(kind==='chart')records.chart[0].onDataReady?.({symbol:{ticker:'A'},period:{multiplier:1,timespan:'day',text:'D'}})
    else records.workspace[0].onActiveCell?.({cellId:'primary',context:'C',symbol:{ticker:'A'},period:{multiplier:1,timespan:'day',text:'D'}})
  }
  expect(records[kind]).toHaveLength(1)
  await act(async()=>React.startTransition(()=>change(1)))
  expect(host.textContent).toBe('committed:0');notify();expect(calls).toEqual([0])
  await act(async()=>change(0))
  expect(host.textContent).toBe('committed:0');notify();expect(calls).toEqual([0,0])
  await act(async()=>React.startTransition(()=>change(2)))
  expect(host.textContent).toBe('committed:2');notify();expect(calls).toEqual([0,0,2])
  expect(records[kind]).toHaveLength(1)
})

it('publishes committed callbacks before descendant layout effects without publishing suspended renders',async()=>{
  const {host,root}=createHost(),calls:number[]=[],pending=new Promise<never>(()=>{})
  let change!:(value:number)=>void
  function Probe({latest,value}:{latest:React.MutableRefObject<()=>void>;value:number}){
    React.useLayoutEffect(()=>{latest.current()},[latest,value])
    return React.createElement('p',null,`committed:${value}`)
  }
  function Parent({value}:{value:number}){const latest=useLatest(()=>calls.push(value));return React.createElement(Probe,{latest,value})}
  function Block({value}:{value:number}){if(value===1)throw pending;return null}
  function App(){const [value,setValue]=React.useState(0);change=setValue;return React.createElement(React.Suspense,{fallback:'pending'},React.createElement(Parent,{value}),React.createElement(Block,{value}))}
  await act(async()=>root.render(React.createElement(App)));expect(calls).toEqual([0])
  await act(async()=>React.startTransition(()=>change(1)))
  expect(host.textContent).toBe('committed:0');expect(calls).toEqual([0])
  await act(async()=>change(2))
  expect(host.textContent).toBe('committed:2');expect(calls).toEqual([0,2])
})
