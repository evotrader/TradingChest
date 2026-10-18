// @vitest-environment jsdom
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {act} from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {TradingChart,type TradingChartProps} from '../TradingChart'
import {TradingWorkspace} from '../TradingWorkspace'
import type {Datafeed,ChartProOptions} from '../../types'
const records=vi.hoisted(()=>[] as Array<{options:ChartProOptions;dispose:ReturnType<typeof vi.fn>;setTheme:ReturnType<typeof vi.fn>}>)
vi.mock('../../chart',()=>({KLineChartPro:class {
  constructor(options:ChartProOptions){const dispose=vi.fn(()=>options.datafeed.dispose?.()),setTheme=vi.fn();records.push({options,dispose,setTheme});return {dispose,setTheme,getChart:()=>null,setLocale:vi.fn(),setTimezone:vi.fn(),setStyles:vi.fn()}}
},ChartWorkspace:class {dispose=vi.fn();resize=vi.fn();constructor(_options:unknown){}
}}))
const options={symbol:{ticker:'a'},period:{multiplier:1,timespan:'day',text:'1d'}}
const feed=():Datafeed=>({searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars:[],hasMoreBefore:false}),subscribe:vi.fn(),unsubscribe:vi.fn(),dispose:vi.fn()})
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))})}
let roots:Array<ReturnType<typeof createRoot>>=[]
afterEach(async()=>{await act(async()=>{for(const root of roots)root.unmount()});roots=[];document.body.replaceChildren();records.length=0;vi.restoreAllMocks()})
async function mount(props:TradingChartProps,strict=false){
  const div=document.createElement('div');document.body.append(div);const root=createRoot(div);roots.push(root)
  const render=(value:TradingChartProps)=>root.render(React.createElement(strict?React.StrictMode:React.Fragment,null,React.createElement(TradingChart,value)))
  await act(async()=>render(props));await flush();return {root,div,render}
}
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
describe('React chart ownership',()=>{
  it('publishes ref before ready and reads current notifications without reconstruction',async()=>{
    const ref=React.createRef<any>(),first=vi.fn(),second=vi.fn(),ready=vi.fn(()=>expect(ref.current).not.toBeNull()),factory=vi.fn(feed)
    const props={initialOptions:options,createDatafeed:factory,height:400,ref,onReady:ready,events:{onDataReady:first}}
    const {render}=await mount(props);expect(records).toHaveLength(1);expect(ready).toHaveBeenCalledOnce()
    await act(async()=>render({...props,theme:'dark',events:{onDataReady:second},initialOptions:{...options,symbol:{ticker:'ignored-until-new-key'}}}))
    records[0].options.onDataReady?.({symbol:options.symbol,period:options.period})
    expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledOnce();expect(records).toHaveLength(1);expect(records[0].setTheme).toHaveBeenCalledWith('dark')
  })
  it('disposes a late factory result without notifying a retired generation',async()=>{
    let resolve!:(value:Datafeed)=>void;const pending=new Promise<Datafeed>(yes=>resolve=yes),value=feed(),ready=vi.fn()
    const {root}=await mount({initialOptions:options,height:400,createDatafeed:()=>pending,onReady:ready})
    await act(async()=>root.unmount());roots=[]
    resolve(value);await flush();expect(value.dispose).toHaveBeenCalledOnce();expect(ready).not.toHaveBeenCalled();expect(records).toHaveLength(0)
  })
  it('retries a rejected factory with a new feed and releases exactly once',async()=>{
    const value=feed(),factory=vi.fn().mockRejectedValueOnce(Error('factory failure')).mockResolvedValueOnce(value),onError=vi.fn()
    const {root,div}=await mount({initialOptions:options,height:400,createDatafeed:factory,events:{onError}})
    expect(div.textContent).toContain('factory failure');expect(onError).toHaveBeenCalledOnce()
    await act(async()=>div.querySelector('button')!.click());await flush();expect(factory).toHaveBeenCalledTimes(2)
    await act(async()=>root.unmount());roots=[];expect(value.dispose).toHaveBeenCalledOnce()
  })

  it('clears a created chart when onReady fails, then retries with independent ownership',async()=>{
    const ref=React.createRef<any>(),values:Datafeed[]=[],onReady=vi.fn().mockImplementationOnce(()=>{throw Error('ready failure')})
    const {root,div}=await mount({initialOptions:options,height:400,ref,createDatafeed:()=>{const value=feed();values.push(value);return value},onReady} as TradingChartProps)
    expect(div.textContent).toContain('ready failure');expect(ref.current).toBeNull();expect(values[0].dispose).toHaveBeenCalledOnce()
    await act(async()=>div.querySelector('button')!.click());await flush();expect(ref.current).not.toBeNull();expect(values).toHaveLength(2)
    await act(async()=>root.unmount());roots=[];for(const value of values)expect(value.dispose).toHaveBeenCalledOnce()
  })
  it('clears a created workspace and its owned store when onReady fails, then retries',async()=>{
    const ref=React.createRef<any>(),stores:Array<{dispose:ReturnType<typeof vi.fn>}>=[],onReady=vi.fn().mockImplementationOnce(()=>{throw Error('workspace ready failure')})
    const div=document.createElement('div');document.body.append(div);const root=createRoot(div);roots.push(root)
    await act(async()=>root.render(React.createElement(TradingWorkspace,{ref,height:400,initialOptions:{context:'test',symbols:[options.symbol],initialSymbol:options.symbol,getPeriods:async()=>[]},renderCell:()=>null,
      createStore:()=>{const store={dispose:vi.fn()} as any;stores.push(store);return store},onReady})))
    await flush();expect(ref.current).toBeNull();expect(stores[0].dispose).toHaveBeenCalledOnce();expect(div.textContent).toContain('workspace ready failure')
    await act(async()=>div.querySelector('button')!.click());await flush();const active=ref.current;expect(active).not.toBeNull();expect(stores).toHaveLength(2)
    await act(async()=>root.unmount());roots=[];expect(active.dispose).toHaveBeenCalledOnce();for(const store of stores)expect(store.dispose).toHaveBeenCalledOnce()
  })

  it.each(['chart','workspace'] as const)('isolates a late rejected %s factory after key replacement',async kind=>{
    let reject!:(reason:Error)=>void;const pending=new Promise<any>((_yes,no)=>reject=no),ref=React.createRef<any>()
    const div=document.createElement('div');document.body.append(div);const root=createRoot(div);roots.push(root)
    const render=(key:string)=>root.render(kind==='chart'
      ?React.createElement(TradingChart,{key,ref,height:400,initialOptions:options,createDatafeed:()=>key==='old'?pending:feed()})
      :React.createElement(TradingWorkspace,{key,ref,height:400,initialOptions:{context:'test',symbols:[options.symbol],initialSymbol:options.symbol,getPeriods:async()=>[]},renderCell:()=>null,createStore:()=>key==='old'?pending:{dispose:vi.fn()} as any}))
    await act(async()=>render('old'));await flush()
    await act(async()=>render('new'));await flush();const active=ref.current;expect(active).not.toBeNull()
    await act(async()=>reject(Error('cancelled old factory')));await flush();expect(ref.current).toBe(active)
  })
  it('closes a late owned store after unmount without publishing a workspace',async()=>{
    let resolve!:(store:any)=>void;const pending=new Promise<any>(yes=>resolve=yes),dispose=vi.fn(),ready=vi.fn(),ref=React.createRef<any>()
    const div=document.createElement('div');document.body.append(div);const root=createRoot(div);roots.push(root)
    await act(async()=>root.render(React.createElement(TradingWorkspace,{ref,height:400,initialOptions:{context:'late',symbols:[options.symbol],initialSymbol:options.symbol,getPeriods:async()=>[]},renderCell:()=>null,createStore:()=>pending,onReady:ready})))
    await flush();await act(async()=>root.unmount());roots=[];resolve({dispose});await flush()
    expect(dispose).toHaveBeenCalledOnce();expect(ref.current).toBeNull();expect(ready).not.toHaveBeenCalled()
  })
  it('releases every real mount in StrictMode over 100 mount cycles',async()=>{
    const values:Datafeed[]=[]
    for(let i=0;i<100;i++){
      const {root}=await mount({initialOptions:options,height:400,createDatafeed:()=>{const value=feed();values.push(value);return value}},true)
      await act(async()=>{await vi.waitFor(()=>expect(records).toHaveLength(i+1))})
      await act(async()=>root.unmount());roots=[]
    }
    expect(values).toHaveLength(100)
    for(const value of values)expect(value.dispose).toHaveBeenCalledOnce()
    for(const record of records)expect(record.dispose).toHaveBeenCalledOnce()
  })
})
