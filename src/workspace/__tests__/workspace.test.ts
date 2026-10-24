// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest'
import {ChartWorkspace} from '../ChartWorkspace'
import {DrawingHistory} from '../../drawing/history'
import {drawingBindings} from '../../drawing/bindings'
import {builtinDrawingCatalog} from '../../drawing/catalog'
import {syncCrosshair,syncViewport} from '../viewportSync'
import type {Chart} from 'klinecharts'
import type {ChartPro,Period} from '../../types'
import type {ChartWorkspaceOptions} from '../types'

const period:Period={multiplier:1,timespan:'minute',text:'1m'}
const instances:ChartWorkspace[]=[]
afterEach(()=>{for(const instance of instances)instance.dispose();instances.length=0;document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function setup(overrides:Partial<ChartWorkspaceOptions>={}){
  const container=document.createElement('div');document.body.append(container)
  const disposed:string[]=[],mounts:string[]=[],charts:Record<string,any>={}
  const getPeriods=vi.fn(async()=>[period])
  const workspace=new ChartWorkspace({container,context:'original',symbols:[{ticker:'A.X'},{ticker:'B.X'}],initialSymbol:{ticker:'A.X'},initialPeriod:period,
    getPeriods,store:{list:async()=>[],read:async()=>null,write:async()=>{throw Error('Unused isolated write')},remove:async()=>{}},mountCell:(_host,cell)=>{
      mounts.push(cell.context)
      const actions=new Map(),engine={resize:vi.fn(),getDom:()=>null,subscribeAction:vi.fn((name,cb)=>actions.set(name,cb)),unsubscribeAction:vi.fn(),getDataList:()=>[{timestamp:1,close:1}],getVisibleRange:()=>({from:0,to:1}),executeAction:vi.fn()}
      const shortcut={setEnabled:vi.fn()},drawing={pending:0,uncertainLogicalIds:[]};charts[cell.cellId]={engine,shortcut,actions,drawing}
      return {ready:Promise.resolve({getChart:()=>engine,getShortcutManager:()=>shortcut,getDrawingHistoryState:()=>drawing} as unknown as ChartPro),dispose:()=>disposed.push(cell.context)}
    },...overrides})
  instances.push(workspace);return {workspace,container,disposed,mounts,charts,getPeriods}
}
describe('workspace ownership',()=>{
  it('uses the containing height and resizes the current engine without remounting cells',async()=>{
    const {workspace,container,mounts,charts}=setup();await settle()
    const root=container.querySelector<HTMLElement>('.tc-workspace')!,grid=container.querySelector<HTMLElement>('.tc-workspace-grid')!
    expect(root.style.height).toBe('100%');expect(grid.style.height).toBe('')
    const before=charts.primary.engine.resize.mock.calls.length
    workspace.resize(640);expect(root.style.height).toBe('640px');expect(charts.primary.engine.resize.mock.calls.length).toBeGreaterThan(before)
    expect(()=>workspace.resize(0)).toThrow('高度');expect(root.style.height).toBe('640px')
    workspace.resize('100%');await workspace.setLayout(4)
    expect(root.style.height).toBe('100%');expect(grid.style.gridTemplateRows).toContain('240px')
    expect(mounts).toHaveLength(4)
  })
  it('binds every successor and ignores an older initial ready result',async()=>{
    let emit!:(pro:ChartPro)=>void,resolveInitial!:(pro:ChartPro)=>void,releaseBinding!:()=>void
    const initial=new Promise<ChartPro>(resolve=>resolveInitial=resolve),bindingGate=new Promise<void>(resolve=>releaseBinding=resolve)
    const make=(bind:()=>Promise<void>)=>({bindDrawingWorkspace:vi.fn(bind),getChart:()=>({resize:()=>{},subscribeAction:()=>{},unsubscribeAction:()=>{},getDom:()=>null}),getShortcutManager:()=>({setEnabled:()=>{}})}) as unknown as ChartPro
    const old=make(async()=>{}),next=make(async()=>bindingGate)
    const {workspace}=setup({mountCell:()=>({ready:initial,subscribeReady:accept=>{emit=accept;return()=>{}},dispose:()=>{}})})
    await settle();emit(next);await settle();expect(workspace.getCells()[0].chart).toBeUndefined();expect(next.bindDrawingWorkspace).toHaveBeenCalledOnce()
    resolveInitial(old);await settle();expect(old.bindDrawingWorkspace).not.toHaveBeenCalled();releaseBinding();await settle();expect(workspace.getCells()[0].chart).toBe(next)
    const third=make(async()=>{});emit(third);await settle();expect(workspace.getCells()[0].chart).toBe(third);expect(third.bindDrawingWorkspace).toHaveBeenCalledOnce()
    expect((third.bindDrawingWorkspace as any).mock.calls[0][0]).toBe((next.bindDrawingWorkspace as any).mock.calls[0][0])
  })
  it('hides each toolbar group without disabling its programmatic operation',async()=>{
    const onLayoutChange=vi.fn(),{workspace,container}=setup({toolbar:{layout:false,sync:false,storage:false,size:false},onLayoutChange});await settle()
    const groups=[...container.querySelectorAll<HTMLElement>('[data-toolbar-group]')]
    expect(groups).toHaveLength(4);expect(groups.every(group=>group.hidden)).toBe(true)
    expect(onLayoutChange).toHaveBeenLastCalledWith(1)
    await workspace.setLayout(2);expect(workspace.getCells()).toHaveLength(2);expect(onLayoutChange).toHaveBeenLastCalledWith(2)
    const read=vi.fn(async()=>null);workspace['options'].store!.read=read;await expect(workspace.deleteSaved('missing')).rejects.toMatchObject({code:'WORKSPACE_NOT_FOUND'});expect(read).toHaveBeenCalledOnce()
  })
  it('updates existing chrome and library empty-state errors when locale changes',async()=>{
    const {workspace,container}=setup({getPeriods:async()=>[]});await settle()
    expect(container.textContent).toContain('A.X 没有可用行情周期')
    workspace.setLocale('en-US')
    expect(container.querySelector('[aria-label="Chart layout"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Symbol primary"]')).not.toBeNull()
    expect(container.textContent).toContain('No market periods for A.X')
    expect(container.textContent).not.toContain('图表布局')
    await expect(workspace.load('missing')).rejects.toThrow('No saved workspace')
    workspace.setLocale('ja');expect(container.textContent).toContain('No market periods for A.X')
  })
  it('retains host error details and chart identity when changing theme and locale',async()=>{
    const {workspace,container,mounts}=setup({getPeriods:async()=>{throw Error('数据源原始错误 code=FEED_UNAVAILABLE')}});await settle()
    workspace.setTheme('light');workspace.setLocale('en-US')
    expect(container.querySelector<HTMLElement>('.tc-workspace')?.dataset.theme).toBe('light')
    expect(container.textContent).toContain('数据源原始错误 code=FEED_UNAVAILABLE')
    expect(mounts).toHaveLength(0)
  })
  it('disconnects container observation and ignores late resize notifications after disposal',async()=>{
    let notify!:()=>void
    const observe=vi.fn(),disconnect=vi.fn()
    vi.stubGlobal('ResizeObserver',class {constructor(callback:()=>void){notify=callback}observe=observe;disconnect=disconnect})
    const {workspace,charts}=setup();await settle()
    expect(observe).toHaveBeenCalledTimes(1)
    notify();const calls=charts.primary.engine.resize.mock.calls.length
    workspace.dispose();notify()
    expect(disconnect).toHaveBeenCalledTimes(1);expect(charts.primary.engine.resize).toHaveBeenCalledTimes(calls)
  })
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
    await expect(workspace.importLegacy('旧布局')).rejects.toThrow('损坏')
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
    const container=document.createElement('div');document.body.append(container);let release!:(value:Period[])=>void;let mounted=0,disposed=0;const chartThemes:string[]=[],chartLocales:string[]=[];
    const getPeriods=vi.fn().mockImplementationOnce(()=>new Promise(done=>release=done)).mockResolvedValue([period]);
    const w=new ChartWorkspace({container,context:'x',locale:'en-US',theme:'light',height:640,toolbar:{size:false},symbols:[{ticker:'A'}],initialSymbol:{ticker:'A'},initialPeriod:period,getPeriods,mountCell:()=>{
      mounted++;const engine:any={resize:vi.fn(),getDom:()=>null,subscribeAction:vi.fn(),unsubscribeAction:vi.fn(),getIndicators:()=>[],setStyles:vi.fn(),getOverlays:()=>[],getDataList:()=>[],getVisibleRange:()=>({from:0,to:0}),getBarSpace:()=>({bar:8}),getStyles:()=>({}),getPaneOptions:()=>[],getYAxes:()=>[]};
      const history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period}),apply:(_id,value)=>value});drawingBindings.set(engine,{history,validateRestore:()=>{},validateRestoreStep:()=>{}});
      const pro={getTheme:()=> 'dark',getLocale:()=> 'zh-CN',getTimezone:()=> 'UTC',getDrawingTools:()=>builtinDrawingCatalog,getChart:()=>engine,getIndicatorCatalog:()=>[],getSymbol:()=>({ticker:'A'}),getPeriod:()=>period,getShortcutManager:()=>({setEnabled:vi.fn()}),getDrawingHistoryState:()=>history.getState(),getDrawings:()=>history.getDrawings(),resetDrawingHistory:()=>history.reset(),setTheme:(value:string)=>chartThemes.push(value),setLocale:(value:string)=>chartLocales.push(value),setTimezone:vi.fn(),restoreDrawings:vi.fn()};
      return {ready:Promise.resolve(pro as unknown as ChartPro),dispose:()=>disposed++};
    }});instances.push(w);
    const restoring=w.restore(doc as import('../types').WorkspaceDocument);await settle();expect(mounted).toBe(0);expect(getPeriods).toHaveBeenCalledTimes(1);
    release([period]);await restoring;await settle();expect(w.getCells()).toHaveLength(1);expect(container.querySelectorAll('[data-cell-id="primary"]')).toHaveLength(1);
    expect(chartThemes).toEqual(['dark']);expect(chartLocales).toEqual(['zh-CN'])
    const chrome=container.querySelector<HTMLElement>('.tc-workspace')!;expect(chrome.dataset.theme).toBe('light');expect(chrome.dataset.locale).toBe('en-US');expect(chrome.style.height).toBe('640px')
    expect(container.querySelector('[aria-label="Column width"]')).not.toBeNull();expect(container.textContent).toContain('Workspace restored')
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
