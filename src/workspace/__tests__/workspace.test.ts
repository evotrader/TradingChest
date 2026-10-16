// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest'
import {ChartWorkspace} from '../ChartWorkspace'
import {syncCrosshair,syncViewport} from '../viewportSync'
import type {Chart} from 'klinecharts'
import type {ChartPro,Period} from '../../types'

const period:Period={multiplier:1,timespan:'minute',text:'1m'}
const instances:ChartWorkspace[]=[]
afterEach(()=>{for(const instance of instances)instance.dispose();instances.length=0;document.body.innerHTML='';vi.restoreAllMocks()})
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function setup(){
  const container=document.createElement('div');document.body.append(container)
  const disposed:string[]=[],mounts:string[]=[],charts:Record<string,any>={}
  const getPeriods=vi.fn(async()=>[period])
  const workspace=new ChartWorkspace({container,context:'original',symbols:[{ticker:'A.X'},{ticker:'B.X'}],initialSymbol:{ticker:'A.X'},initialPeriod:period,
    getPeriods,storage:localStorage,mountCell:(_host,cell)=>{
      mounts.push(cell.context)
      const actions=new Map(),engine={resize:vi.fn(),getDom:()=>null,subscribeAction:vi.fn((name,cb)=>actions.set(name,cb)),unsubscribeAction:vi.fn(),getDataList:()=>[{timestamp:1,close:1}],getVisibleRange:()=>({from:0,to:1}),executeAction:vi.fn()}
      const shortcut={setEnabled:vi.fn()},drawing={pending:0};charts[cell.cellId]={engine,shortcut,actions,drawing}
      return {ready:Promise.resolve({getChart:()=>engine,getShortcutManager:()=>shortcut,getDrawingHistoryState:()=>drawing} as unknown as ChartPro),dispose:()=>disposed.push(cell.context)}
    }})
  instances.push(workspace);return {workspace,container,disposed,mounts,charts,getPeriods}
}
describe('workspace ownership',()=>{
  it('retains primary context, releases only removed cells, disables inactive shortcuts',async()=>{
    const {workspace,mounts,disposed,charts}=setup();await settle();await workspace.setLayout(4);await settle()
    expect(mounts).toEqual(['original','original:secondary-1','original:secondary-2','original:secondary-3'])
    workspace.setActive('secondary-2');expect(charts.primary.shortcut.setEnabled).toHaveBeenLastCalledWith(false)
    expect(charts['secondary-2'].shortcut.setEnabled).toHaveBeenLastCalledWith(true)
    await workspace.setLayout(1);expect(disposed).toEqual(['original:secondary-1','original:secondary-2','original:secondary-3'])
    expect(workspace.getCells().map(c=>c.cellId)).toEqual(['primary'])
    expect(charts.primary.engine.unsubscribeAction).not.toHaveBeenCalled()
  })
  it('retains the actual cell root and selector while a drawing write awaits confirmation',async()=>{
    const {workspace,container,mounts,disposed,charts}=setup();await settle();await workspace.setLayout(2);await settle();
    const before=workspace.getCells()[1].chart,mountCount=mounts.length;charts['secondary-1'].drawing.pending=1;
    const symbol=container.querySelector<HTMLSelectElement>('[aria-label="标的 secondary-1"]')!;symbol.value='B.X';symbol.dispatchEvent(new Event('change'));await settle();
    expect(symbol.value).toBe('A.X');expect(mounts).toHaveLength(mountCount);expect(workspace.getCells()[1].chart).toBe(before);
    await expect(workspace.setLayout(1)).rejects.toThrow('绘图提交尚未确认');expect(disposed).toEqual([]);
    charts['secondary-1'].drawing.pending=0;await workspace.setLayout(1);expect(disposed).toEqual(['original:secondary-1']);
  })
  it('does not replace current cells or damaged saved data on load failure',async()=>{
    const {workspace}=setup();await settle();localStorage.setItem('trading-chest-workspace-v1-original','{"version":1,"layout":4}')
    const before=workspace.getCells()[0].chart
    await expect(workspace.load()).rejects.toThrow('损坏')
    expect(workspace.getCells()[0].chart).toBe(before)
    expect(localStorage.getItem('trading-chest-workspace-v1-original')).toBe('{"version":1,"layout":4}')
  })
  it('aborts a pending directory read on disposal and never mounts late cells',async()=>{
    const container=document.createElement('div');let resolve!:(periods:Period[])=>void;let signal!:AbortSignal;const mount=vi.fn()
    const w=new ChartWorkspace({container,context:'x',symbols:[{ticker:'A'}],initialSymbol:{ticker:'A'},getPeriods:(_s,s)=>{signal=s;return new Promise(done=>resolve=done)},mountCell:mount})
    w.dispose();resolve([period]);await settle();expect(signal.aborted).toBe(true);expect(mount).not.toHaveBeenCalled()
  })
  it('waits for initial ownership before restoring a workspace and releases every chart',async()=>{
    const template={version:3,timestamp:1,theme:'dark',locale:'zh-CN',timezone:'UTC',styles:{},indicators:[],panes:[],axes:[],overlayData:[],context:{ticker:'A',period:{multiplier:1,timespan:'minute'}}};
    const doc={version:1,layout:1,activeCellId:'primary',sync:{symbol:false,period:false,crosshair:false,viewport:false},columnRatio:50,rowRatio:50,cells:[{cellId:'primary',context:'x',symbol:{ticker:'A'},period,chart:template}]};
    const container=document.createElement('div');document.body.append(container);let release!:(value:Period[])=>void;let mounted=0,disposed=0;
    const getPeriods=vi.fn().mockImplementationOnce(()=>new Promise(done=>release=done)).mockResolvedValue([period]);
    const w=new ChartWorkspace({container,context:'x',symbols:[{ticker:'A'}],initialSymbol:{ticker:'A'},initialPeriod:period,getPeriods,mountCell:()=>{
      mounted++;const engine={resize:vi.fn(),getDom:()=>null,subscribeAction:vi.fn(),unsubscribeAction:vi.fn(),getIndicators:()=>[],setStyles:vi.fn()};
      const pro={getChart:()=>engine,getSymbol:()=>({ticker:'A'}),getShortcutManager:()=>({setEnabled:vi.fn()}),getDrawingHistoryState:()=>({pending:0,uncertainLogicalIds:[]}),getDrawings:()=>[],resetDrawingHistory:vi.fn(),setTheme:vi.fn(),setLocale:vi.fn(),setTimezone:vi.fn(),restoreDrawings:vi.fn()};
      return {ready:Promise.resolve(pro as unknown as ChartPro),dispose:()=>disposed++};
    }});instances.push(w);
    const restoring=w.restore(doc as import('../types').WorkspaceDocument);await settle();expect(mounted).toBe(0);expect(getPeriods).toHaveBeenCalledTimes(1);
    release([period]);await restoring;await settle();expect(w.getCells()).toHaveLength(1);expect(container.querySelectorAll('[data-cell-id="primary"]')).toHaveLength(1);
    expect(mounted).toBe(2);expect(disposed).toBe(1);w.dispose();expect(disposed).toBe(2);
  })
  it('rejects sync changes while a layout expansion awaits a directory read',async()=>{
    const {workspace,container,getPeriods}=setup();await settle();let resolve!:(periods:Period[])=>void
    getPeriods.mockImplementationOnce(()=>new Promise(done=>resolve=done))
    const expanding=workspace.setLayout(4);await settle()
    const input=container.querySelector<HTMLInputElement>('[data-sync="viewport"]')!;input.click()
    expect(input.checked).toBe(false);expect(container.textContent).toContain('布局正在切换')
    const symbol=container.querySelector<HTMLSelectElement>('[aria-label="标的 primary"]')!;symbol.value='B.X';symbol.dispatchEvent(new Event('change'));await settle()
    expect(symbol.value).toBe('A.X');expect(workspace.getCells()[0].symbol.ticker).toBe('A.X')
    resolve([period]);await expanding;await settle()
    expect(workspace.getCells()).toHaveLength(4);expect(container.querySelector<HTMLSelectElement>('[aria-label="图表布局"]')!.value).toBe('4')
  })
  it('disables stale period controls until the new symbol directory is confirmed',async()=>{
    const {workspace,container,getPeriods}=setup();await settle();let resolve!:(periods:Period[])=>void
    getPeriods.mockImplementationOnce(()=>new Promise(done=>resolve=done))
    const symbol=container.querySelector<HTMLSelectElement>('[aria-label="标的 primary"]')!,periodSelect=container.querySelector<HTMLSelectElement>('[aria-label="周期 primary"]')!
    symbol.value='B.X';symbol.dispatchEvent(new Event('change'));await settle()
    expect(symbol.disabled).toBe(true);expect(periodSelect.disabled).toBe(true)
    resolve([period]);await settle()
    expect(workspace.getCells()[0].symbol.ticker).toBe('B.X')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="周期 primary"]')!.disabled).toBe(false)
  })
  it('does not apply a pending synchronization after its switch was turned off',async()=>{
    const {workspace,container,getPeriods}=setup();await settle();await workspace.setLayout(2);await settle()
    const symbol=container.querySelector<HTMLSelectElement>('[aria-label="标的 secondary-1"]')!;symbol.value='B.X';symbol.dispatchEvent(new Event('change'));await settle();workspace.setActive('secondary-1')
    let resolve!:(periods:Period[])=>void;getPeriods.mockImplementationOnce(()=>new Promise(done=>resolve=done))
    const sync=container.querySelector<HTMLInputElement>('[data-sync="symbol"]')!;sync.click();await settle();sync.click();resolve([period]);await settle()
    expect(sync.checked).toBe(false);expect(workspace.getCells().map(c=>c.symbol.ticker)).toEqual(['A.X','B.X'])
    expect(container.querySelector<HTMLSelectElement>('[aria-label="标的 primary"]')!.disabled).toBe(false)
  })
  it('keeps independent sync switches from canceling a pending symbol alignment',async()=>{
    const {workspace,container,getPeriods}=setup();await settle();await workspace.setLayout(2);await settle()
    const symbol=container.querySelector<HTMLSelectElement>('[aria-label="标的 secondary-1"]')!;symbol.value='B.X';symbol.dispatchEvent(new Event('change'));await settle();workspace.setActive('secondary-1')
    let resolve!:(periods:Period[])=>void;getPeriods.mockImplementationOnce(()=>new Promise(done=>resolve=done))
    container.querySelector<HTMLInputElement>('[data-sync="symbol"]')!.click();await settle()
    container.querySelector<HTMLInputElement>('[data-sync="crosshair"]')!.click();resolve([period]);await settle()
    expect(workspace.getCells().map(c=>c.symbol.ticker)).toEqual(['B.X','B.X'])
  })
})
describe('timestamp synchronization',()=>{
  it('hides crosshair when the actual timestamp is absent without nearest conversion',()=>{
    const executeAction=vi.fn(),convertToPixel=vi.fn(()=>({x:20}))
    const chart={getDataList:()=>[{timestamp:100},{timestamp:300}],executeAction,convertToPixel} as unknown as Chart
    const convertFromPixel=vi.fn(()=>[{dataIndex:0}]),source={getDataList:()=>[{timestamp:200},{timestamp:300}],convertFromPixel} as unknown as Chart
    expect(syncCrosshair(source,chart,{x:10,paneId:'candle_pane'})).toBe(false)
    expect(executeAction).toHaveBeenLastCalledWith('onCrosshairChange',null);expect(convertToPixel).not.toHaveBeenCalled()
    convertFromPixel.mockReturnValue([{dataIndex:1}])
    expect(syncCrosshair(source,chart,{x:20,paneId:'candle_pane'})).toBe(true)
    expect(convertToPixel).toHaveBeenLastCalledWith({dataIndex:1},{paneId:'candle_pane'})
  })
  it('uses the target width and actual intersection, and verifies engine clamping',()=>{
    const setBarSpace=vi.fn(),scrollToDataIndex=vi.fn()
    const chart={getDataList:()=>[100,200,400,500].map(timestamp=>({timestamp})),getSize:()=>({width:600}),setBarSpace,scrollToDataIndex,scrollByDistance:vi.fn(),getBarSpace:()=>({bar:300}),getVisibleRange:()=>({from:1,to:3})} as unknown as Chart
    expect(syncViewport(chart,{from:150,to:450})).toBe(true);expect(setBarSpace).toHaveBeenCalledWith(300);expect(scrollToDataIndex).toHaveBeenCalledWith(2,0)
    expect(syncViewport(chart,{from:600,to:700})).toBe(false);expect(scrollToDataIndex).toHaveBeenCalledTimes(1)
    vi.spyOn(chart,'getVisibleRange').mockReturnValue({from:0,to:1,realFrom:0,realTo:1});expect(syncViewport(chart,{from:150,to:450})).toBe(false)
  })
})
