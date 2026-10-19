/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createSignal, createEffect, onMount, Show, onCleanup, startTransition, Component, ErrorBoundary,untrack,For } from 'solid-js'

import {
  init, dispose, utils, Nullable, Chart, OverlayMode, Styles,
  PaneOptions, Indicator,
  type Overlay, type OverlayCreate, type KLineData
} from 'klinecharts'

import { deepSet } from './core/deepSet'

import { SelectDataSourceItem, Loading } from './component'

import {
  PeriodBar, DrawingBar, IndicatorModal, TimezoneModal, SettingModal,
  ScreenshotModal, IndicatorSettingModal, SymbolSearchModal, OverlayPropertyBar,
  ReplayControlBar
} from './widget'
import { ReplayEngine } from './replay/ReplayEngine'
import type { ReplayState, ReplaySpeed } from './replay/types'

import { translateTimezone } from './widget/timezone-modal/data'

import { SymbolInfo, Period, ChartProOptions, ChartPro } from './types'
import { indicatorRegistry } from './indicator'
import {configureIndicatorTooltip} from './indicator/instances'
import {builtinIndicatorCatalog,copyIndicatorCatalog,validateIndicatorParams,indicatorInstance,type AddIndicatorOptions,type IndicatorHandle} from './indicator/catalog'
import AnalysisEventList from './analysis/EventList'
import { EngineDataLoader } from './core/engineDataLoader'
import i18n from './i18n'
import {AnalysisManager,type AnalysisView} from './analysis/manager'
import {isRuntimeAnalysisPane} from './analysis/bindings'
import {MetricSeries} from './widget/metric-series/MetricSeries'
import {ComparisonManager} from './compare/manager'
import type {ComparisonState} from './compare/types'
import {DrawingHistory} from './drawing/history'
import {DrawingController} from './drawing/controller'
import {drawingBindings} from './drawing/bindings'
import {validateDrawingRestore} from './drawing/restore'
import {anchorsFromPoints,projectAnchors,intervalVisible,validateAnchor} from './drawing/anchors'
import {copyDrawingCatalog} from './drawing/catalog'
import DrawingTextEditor from './widget/drawing-editor/TextEditor'
import type {DrawingHistoryState,DrawingSnapshot,DrawingChange} from './drawing/types'
import { buildStyles } from './core/buildStyles'
import type { OverlayLifecycleEvent, OverlayLifecycleSource } from './types'

export interface ChartComponentApi extends ChartPro {
  cancelDrawing: () => void
  deleteSelectedDrawing: () => void
  createDrawing: (overlay: OverlayCreate) => void
}

export interface ChartProComponentProps extends Required<Omit<ChartProOptions, 'analysisLayerListVisible'|'onAnalysisLayerChange'|'onAnalysisEventClick'|'onAnalysisPointSelect'|'indicatorCatalog' | 'container' | 'onAlertTrigger' | 'onReplayAlertTrigger' | 'onError' | 'onDataReady' | 'onDataState'|'comparisonSymbols'|'createComparisonDatafeed'|'onComparisonChange'|'onDrawingSelect'|'drawingOwner'|'isDrawingEditable'|'commitDrawing'|'onDrawingHistoryChange'|'drawingCatalog'|'onDrawingStateChange'>> {
  analysisLayerListVisible?:ChartProOptions['analysisLayerListVisible']
  onAnalysisLayerChange?:ChartProOptions['onAnalysisLayerChange']
  onAnalysisEventClick?:ChartProOptions['onAnalysisEventClick']
  onAnalysisPointSelect?:ChartProOptions['onAnalysisPointSelect']
  drawingCatalog?:ChartProOptions['drawingCatalog']
  onDrawingStateChange?:ChartProOptions['onDrawingStateChange']
  indicatorCatalog?:ChartProOptions['indicatorCatalog']
  comparisonSymbols?:ChartProOptions['comparisonSymbols']
  createComparisonDatafeed?:ChartProOptions['createComparisonDatafeed']
  onComparisonChange?:ChartProOptions['onComparisonChange']
  onDrawingSelect?:ChartProOptions['onDrawingSelect']
  drawingOwner?:ChartProOptions['drawingOwner']
  isDrawingEditable?:ChartProOptions['isDrawingEditable']
  commitDrawing?:ChartProOptions['commitDrawing']
  onDrawingHistoryChange?:ChartProOptions['onDrawingHistoryChange']
  onDataState?: ChartProOptions['onDataState']
  onDataReady?: ChartProOptions['onDataReady']
  ref: (chart: ChartComponentApi) => void
  /** 内部回调：实时数据到达时通知外层（用于报警检测） */
  onPriceUpdate?: (price: number, timestamp: number) => void
  onReplayPriceUpdate?: (price: number, timestamp: number) => void
  onReplayReset?: (price: number | undefined, timestamp: number | undefined) => void
  onReplayActiveChange?: (active: boolean) => void
  /** 内部回调：品种/周期切换时通知外层（用于重置报警状态等） */
  onDataReset?: (symbol: SymbolInfo) => void
  /** 内部错误回调 */
  onError?: (error: { type: string, message: string, raw?: unknown }) => void
}

interface PrevSymbolPeriod {
  symbol: SymbolInfo
  period: Period
}


function snapshotOverlay (overlay: Overlay): OverlayLifecycleEvent['overlay'] {
  return {
    id: overlay.id,
    paneId:overlay.paneId,
    groupId: overlay.groupId,
    name: overlay.name,
    points: (overlay.points ?? []).map(({timestamp,dataIndex,value}) => ({timestamp,dataIndex,value})),
    extendData: overlay.extendData,
    styles: overlay.styles,
    lock: overlay.lock,
    visible: overlay.visible
  }
}

const ChartProComponent: Component<ChartProComponentProps> = props => {
  let widgetRef: HTMLDivElement | undefined = undefined
  let widget: Nullable<Chart> = null

  let priceUnitDom: HTMLElement

  const [loading, setLoading] = createSignal(false)
  let disposed = false
  let loader: EngineDataLoader | undefined
  const [engineReady, setEngineReady] = createSignal(false)
  let retryInitialization: (()=>void) | undefined
  const [loadError, setLoadError] = createSignal('')
  const [dataState,setDataState]=createSignal<import('./types').ChartDataState>()

  const [theme, setTheme] = createSignal(props.theme)
  const [styles, setStyles] = createSignal(props.styles)
  const [locale, setLocale] = createSignal(props.locale)

  const [symbol, setSymbol] = createSignal(props.symbol)
  const [period, setPeriod] = createSignal(props.period)
  const [indicatorModalVisible, setIndicatorModalVisible] = createSignal(false)
  const catalog=copyIndicatorCatalog(props.indicatorCatalog??builtinIndicatorCatalog)
  const [indicatorInstances,setIndicatorInstances]=createSignal<import('./indicator/catalog').IndicatorInstance[]>([])
  let indicatorGeneration=0
  const refreshIndicators=()=>setIndicatorInstances(widget?.getIndicators().filter(i=>catalog.some(d=>d.name===i.name)).map(indicatorInstance)??[])
  const descriptor=(name:string)=>{const d=catalog.find(d=>d.name===name);if(!d)throw Error(i18n('indicator_not_in_catalog',locale()).replace('{name}',name));return d}
  const addIndicator=async(input:AddIndicatorOptions):Promise<IndicatorHandle>=>{
    const options={...input}
    const d=descriptor(options.name),generation=indicatorGeneration
    if(!d.placements.includes(options.placement))throw Error(i18n('indicator_placement_invalid',locale()))
    if(options.calcParams!==undefined){validateIndicatorParams(d,options.calcParams,locale());options.calcParams=[...options.calcParams]}
    await indicatorRegistry.ensureRegistered(options.name)
    if(disposed||generation!==indicatorGeneration||!widget)throw new DOMException(i18n('indicator_creation_cancelled',locale()),'AbortError')
    const id=widget.createIndicator({name:options.name,paneId:options.placement==='main'?'candle_pane':undefined,calcParams:options.calcParams},true)
    const i=id?widget.getIndicators({id})[0]:undefined
    if(!i||i.name!==options.name||!i.paneId||!i.yAxisId||!widget.getYAxes({id:i.yAxisId,paneId:i.paneId}).length||(options.placement==='main')!==(i.paneId==='candle_pane')){if(id)widget.removeIndicator({id});throw Error(i18n('indicator_binding_failed',locale()))}
    try{validateIndicatorParams(d,i.calcParams,locale())}catch(e){widget.removeIndicator({id:i.id});throw e}
    configureIndicatorTooltip(widget,i,d)
    if(i.name==='VOL')widget.overrideYAxis({id:i.yAxisId,paneId:i.paneId,gap:{bottom:2}})
    refreshIndicators();return {id:i.id,name:i.name,paneId:i.paneId,yAxisId:i.yAxisId}
  }
  const requireIndicator=(id:string)=>{const i=widget?.getIndicators({id})[0];if(!i)throw Error(i18n('indicator_instance_missing',locale()));descriptor(i.name);return i}
  const updateIndicator=(id:string,updates:{calcParams?:import('./indicator/catalog').IndicatorParameterValue[];visible?:boolean})=>{const i=requireIndicator(id);if(updates.calcParams!==undefined){if(!descriptor(i.name).parameters)throw Error(i18n('indicator_params_readonly',locale()));validateIndicatorParams(descriptor(i.name),updates.calcParams,locale())}if(updates.visible!==undefined&&typeof updates.visible!=='boolean')throw Error(i18n('indicator_visibility_invalid',locale()));widget!.overrideIndicator({id,name:i.name,...updates});refreshIndicators()}
  const removeIndicator=(id:string)=>{requireIndicator(id);widget!.removeIndicator({id});refreshIndicators()}
  const openIndicatorSettings=(id:string)=>{const i=requireIndicator(id);if(!descriptor(i.name).parameters)throw Error(i18n('indicator_params_readonly',locale()));setIndicatorSettingModalParams({visible:true,indicatorId:i.id,indicatorName:i.name,paneId:i.paneId,calcParams:i.calcParams})}

  const [timezoneModalVisible, setTimezoneModalVisible] = createSignal(false)
  const [timezone, setTimezone] = createSignal<SelectDataSourceItem>({ key: props.timezone, text: translateTimezone(props.timezone, props.locale) })

  const [settingModalVisible, setSettingModalVisible] = createSignal(false)
  const [widgetDefaultStyles, setWidgetDefaultStyles] = createSignal<Styles>()

  const [screenshotUrl, setScreenshotUrl] = createSignal('')

  const [drawingBarVisible, setDrawingBarVisible] = createSignal(props.drawingBarVisible)

  const [symbolSearchModalVisible, setSymbolSearchModalVisible] = createSignal(false)

  const [loadingVisible, setLoadingVisible] = createSignal(false)

  const [indicatorSettingModalParams, setIndicatorSettingModalParams] = createSignal({
    visible: false, indicatorId:'',indicatorName: '', paneId: '', calcParams: [] as Array<any>
  })

  // 绘图 overlay 选中状态（浮动属性工具栏）
  const [selectedOverlay, setSelectedOverlay] = createSignal<{
    id: string, x: number, y: number,
    color: string, fillColor?: string, lineWidth: number, lineStyle: string, locked: boolean
  } | null>(null)

  const [textEditor,setTextEditor]=createSignal<{id:string;text:string;creating:boolean}|null>(null)
  const textOf=(value:unknown)=>typeof value==='string'?value:value&&typeof value==='object'&&'text' in value?String(value.text??''):''
  const isText=(name:string)=>['textAnnotation','callout','note','anchoredText'].includes(name)
  const notifyOverlay = (source: OverlayLifecycleSource, overlay: Overlay, kind: 'create' | 'update' | 'delete') => {
    if(applyingDrawing)return
    const value=snapshotOverlay(overlay),existing=drawingHistory.getDrawings().find(d=>d.logicalId===overlay.id)
    if(existing){value.lock=existing.overlay.lock;value.visible=existing.overlay.visible}
    try{
      const anchors=kind==='delete'?undefined:anchorsFromPoints(overlay.points,widget?.getDataList()??[],period(),'interaction')
      if(kind==='update'){
        void drawingController.execute({type:'update',ids:[overlay.id],patch:source==='property-bar'?{text:textOf(overlay.extendData)}:{anchors}})
      }else void commitDrawing({kind,logicalId:overlay.id,after:kind==='delete'?null:{...existing,logicalId:overlay.id,owner:existing?.owner??props.drawingOwner?.(value)??'local',overlay:value,anchors},source}).then(()=>{if(kind==='create')drawingController.completed()}).catch(reason=>setDrawingState({...drawingHistory.getState(),error:reason instanceof Error?reason.message:String(reason)}))
    }catch(reason){setDrawingState({...drawingHistory.getState(),error:reason instanceof Error?reason.message:String(reason)})}
  }
  const promptTextOverlay = (overlay:Overlay,creating=true) => {
    if(!isText(overlay.name))return false
    setTextEditor({id:overlay.id,text:textOf(overlay.extendData),creating});return true
  }
  const finishText=(text:string|null)=>{
    const editor=textEditor();if(!editor)return
    setTextEditor(null)
    const overlay=widget?.getOverlays({id:editor.id})[0];if(!overlay)return
    if(text===null){if(editor.creating){applyingDrawing=true;try{widget?.removeOverlay({id:editor.id})}finally{applyingDrawing=false}ownedDrawingIds.delete(editor.id);completedDrawingIds.delete(editor.id)}return}
    overlay.extendData=typeof overlay.extendData==='object'&&overlay.extendData?{...overlay.extendData,text}:text
    notifyOverlay('property-bar',overlay,editor.creating?'create':'update')
  }
  const markSelectedOverlay = (overlay: Overlay) => {
    if (overlay.id) {
      if(drawingHistory.getDrawings().some(d=>d.logicalId===overlay.id))void drawingController.execute({type:'select',ids:[overlay.id]})
      const points = overlay.points ?? []
      let x = 0, y = 0
      if (points.length > 0 && widget) {
        const pixel = widget.convertToPixel(
          { timestamp: points[0].timestamp, value: points[0].value },
          { paneId: overlay.paneId,yAxisId:drawingHistory.getDrawings().find(d=>d.logicalId===overlay.id)?.yAxisId }
        ) as any
        x = (pixel?.x ?? 200) + 52
        y = (pixel?.y ?? 100) - 50
      }
      const fillOverlays = [
        'rect', 'circle', 'triangle', 'parallelogram',
        'gannBox', 'regressionChannel', 'xabcd',
        'positionRange', 'longPosition', 'shortPosition',
        'dateAndPriceRange', 'dateRange', 'priceRange',
        'fibonacciCircle',
      ]
      const hasFill = fillOverlays.includes(overlay.name ?? '')
      const defaults=widget?.getStyles().overlay,own=overlay.styles
      const line={...defaults?.line,...own?.line}
      const fill=own?.polygon?.color??own?.rect?.color
      setSelectedOverlay({
        id: overlay.id,
        x: Math.max(100, x),
        y: Math.max(10, y),
        color: own?.line?.color??own?.text?.color??defaults?.line.color??'#1677ff',
        fillColor: hasFill ? typeof fill==='string'?fill:'rgba(22, 119, 255, 0.15)' : undefined,
        lineWidth: line.size??1,
        lineStyle: line.style==='dashed'&&line.dashedValue?.[0]===1?'dotted':line.style??'solid',
        locked: drawingHistory.getDrawings().find(d=>d.logicalId===overlay.id)?.overlay.lock??overlay.lock??false
      })
    }
  }

  const notifySelectedOverlayUpdate = (source: OverlayLifecycleSource, overlayId: string) => {
    const overlay = widget?.getOverlays({id:overlayId})[0]
    if (overlay) {
      notifyOverlay(source, overlay, 'update')
    }
  }
  const drawingStyles=(id:string,inputs:Parameters<typeof buildStyles>[0])=>{
    const defaults=widget?.getStyles().overlay??{},own=widget?.getOverlays({id})[0]?.styles??{},next=buildStyles(inputs)
    const result:any={}
    for(const key of new Set([...Object.keys(defaults),...Object.keys(own),...Object.keys(next)]))result[key]={...(defaults as any)[key],...(own as any)[key],...next[key]}
    result.text={...result.text,color:inputs.color};return result
  }

  let comparisonPanel:HTMLDivElement|undefined,comparisonResizeFrame:number|undefined,comparisonPanelHeight=0
  const resizeComparisonPanel=()=>{if(comparisonResizeFrame!==undefined||disposed)return;comparisonResizeFrame=requestAnimationFrame(()=>{comparisonResizeFrame=undefined;if(disposed)return;const height=comparisonPanel?.clientHeight??0;if(height!==comparisonPanelHeight){comparisonPanelHeight=height;widget?.resize()}})}
  const [comparisonState,setComparisonState]=createSignal<ComparisonState>({handles:[],pending:[],replay:false,restoring:false})
  const [comparisonSelected,setComparisonSelected]=createSignal('')
  let factoryGeneration=0
  const comparisons=new ComparisonManager({locale,chart:()=>widget,symbol,period,instanceId:`compare_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,onChange:state=>{if(!disposed){setComparisonState(state);resizeComparisonPanel();props.onComparisonChange?.(state)}}})
  const addSelectedComparison=async()=>{
    const selected=props.comparisonSymbols?.find(value=>value.ticker===comparisonSelected()),factory=props.createComparisonDatafeed
    if(!selected||!factory)return
    const epoch=factoryGeneration
    try{const feed=await factory(selected,period());if(disposed||epoch!==factoryGeneration){feed.dispose?.();return}await comparisons.add(selected,feed)}catch(reason){if(!disposed&&!(reason instanceof DOMException&&reason.name==='AbortError'))setComparisonState({...comparisons.getState(),error:reason instanceof Error?reason.message:String(reason)})}
  }

  const [analysisViews,setAnalysisViews]=createSignal<AnalysisView[]>([])
  const analysis=new AnalysisManager({chart:()=>widget,locale,changed:setAnalysisViews,onAnalysisLayerChange:props.onAnalysisLayerChange,onAnalysisEventClick:props.onAnalysisEventClick,onAnalysisPointSelect:props.onAnalysisPointSelect})
  let analysisResizeObserver:ResizeObserver|undefined
  const analysisClick=(event:MouseEvent)=>analysis.click(event)

  // 回放状态
  const defaultReplayState: ReplayState = { active: false, playing: false, speed: 1, position: 0, totalBars: 0 }
  const [replayState, setReplayState] = createSignal<ReplayState>(defaultReplayState)
  let replayEngine: ReplayEngine | null = null
  let replayRevision=0,replayPrefix:KLineData[]=[]

  const setChartPeriod = (nextPeriod: Period) => {
    if (replayEngine) return
    ++indicatorGeneration
    setPeriod(nextPeriod)
    props.onPeriodChange?.(nextPeriod)
  }

  const startReplay = (startPosition?: number) => {
    if (disposed || replayEngine || !widget) return
    const dataList = widget.getDataList()
    if (dataList.length === 0) return
    setLoading(false)
    setLoadingVisible(false)
    // 暂停实时数据订阅，防止实时数据污染回放时间线
    const pos = startPosition ?? Math.floor(dataList.length * 0.5)
    try{comparisons.enterReplay(dataList[Math.max(0,pos-1)]?.timestamp??dataList[0].timestamp)}catch(reason){setLoadError(i18n('replay_start_failure',locale()).replace('{reason}',reason instanceof Error?reason.message:String(reason)));return}
    props.onReplayActiveChange?.(true)
    const engine = new ReplayEngine({
      onDataChange: (data) => {
        if(disposed||replayEngine!==engine)return
        ++replayRevision;replayPrefix=data
        props.onReplayReset?.(data.at(-1)?.close, data.at(-1)?.timestamp)
        comparisons.seek(data.at(-1)?.timestamp??-Infinity)
        loader?.setReplay(data)
      },
      onBarUpdate: (bar) => {
        if(disposed||replayEngine!==engine)return
        ++replayRevision;replayPrefix=[...replayPrefix,bar]
        comparisons.seek(bar.timestamp)
        if(resuming())loader?.setReplay(replayPrefix);else loader?.pushReplay(bar)
        props.onReplayPriceUpdate?.(bar.close, bar.timestamp)
      },
      onStateChange: (state) => { setReplayState(state) },
    })
    replayEngine=engine
    engine.start(dataList, pos)
  }

  const [resuming,setResuming] = createSignal(false)
  const stopReplay = () => {
    if (disposed || !replayEngine || resuming()) return
    replayEngine.pause()
    setResuming(true)
    const engine=replayEngine,revision=replayRevision
    const current=()=>!disposed&&replayEngine===engine&&replayRevision===revision
    const assertCurrent=()=>{if(!current())throw new DOMException(i18n('replay_restore_outdated',locale()),'AbortError')}
    const retainedReplay=widget?.getDataList().map(bar=>({...bar}))??[],retainedRange=widget?.getVisibleRange(),retainedSpace=widget?.getBarSpace().bar
    const transaction=loader?.beginReplayResume()
    let mainRestored=false
    const reloadMain=()=>{assertCurrent();return (loader?.reload(true)??Promise.resolve()).then(()=>{assertCurrent();mainRestored=true})}
    const restore=comparisons.getState().handles.length?comparisons.prepareResume().then(reloadMain):reloadMain()
    restore.then(() => {
      assertCurrent()
      transaction?.prepare()
      comparisons.leaveReplay()
      transaction?.commit()
      replayEngine?.dispose()
      replayEngine = null
      replayPrefix=[]
      setReplayState(defaultReplayState)
      props.onReplayActiveChange?.(false)
      props.onDataReady?.({symbol:symbol(),period:period()})
    }).catch(error => {
      if(current())comparisons.rollbackResume()
      if(current()&&!mainRestored)transaction?.rollback()
      if(current()&&mainRestored){transaction?.rollback();props.onReplayReset?.(retainedReplay.at(-1)?.close,retainedReplay.at(-1)?.timestamp);if(retainedSpace!==undefined)widget?.setBarSpace(retainedSpace);if(retainedRange){widget?.scrollToDataIndex(Math.min(retainedReplay.length-1,retainedRange.to-1),0);if(retainedSpace!==undefined)widget?.scrollByDistance(retainedSpace/2,0)}}
      if(!disposed)setLoadError(error instanceof DOMException&&error.name==='AbortError'?i18n('replay_restore_cancelled',locale()):i18n('replay_restore_failure',locale()).replace('{reason}',error instanceof Error?error.message:String(error)))
    }).finally(() => {setResuming(false)})
  }

  // Only drawings created through this instance's UI belong to its shortcuts.
  const ownedDrawingIds = new Set<string>()
  const completedDrawingIds = new Set<string>()
  let applyingDrawing=false
  const [drawingState,setDrawingState]=createSignal<DrawingHistoryState>({pending:0,canUndo:false,canRedo:false,uncertainLogicalIds:[]})
  const drawingCatalog=copyDrawingCatalog(props.drawingCatalog)
  let drawingController:DrawingController
  const [workbenchState,setWorkbenchState]=createSignal<import('./drawing/types').DrawingState>()
  const editable=(overlay:OverlayLifecycleEvent['overlay'])=>drawingCatalog.some(t=>t.overlayName===overlay.name)&&overlay.name!=='alertLine'&&!overlay.id?.startsWith('alert_')&&(props.isDrawingEditable?.(overlay)??true)
  const validateDrawingTarget=(value:DrawingSnapshot)=>{
    if(value.anchors)for(const anchor of value.anchors)validateAnchor(anchor)
    if(widget&&isRuntimeAnalysisPane(widget,value.overlay.paneId))throw Error(i18n('drawing_runtime_pane',locale()))
  }
  const validateRestore=(_owner:import('./drawing/types').DrawingOwner,values:DrawingSnapshot[])=>{
    validateDrawingRestore(values,{editable,existing:widget?.getOverlays().map(snapshotOverlay)??[],ownedIds:new Set(drawingHistory.getDrawings().map(d=>d.logicalId))})
    for(const value of values)validateDrawingTarget(value)
  }
  const applyDrawing=(id:string,value:DrawingSnapshot|null):DrawingSnapshot|null=>{
    if(!widget)throw Error(i18n('chart_not_ready',locale()))
    if(value?.overlay.paneId&&!widget.getPaneOptions(value.overlay.paneId))throw Error(i18n('drawing_pane_missing',locale()))
    const selected=selectedOverlay()?.id===id
    applyingDrawing=true
    try{
      if(!value){widget.removeOverlay({id});ownedDrawingIds.delete(id);completedDrawingIds.delete(id);if(selected)setSelectedOverlay(null);return null}
      const overlay=value.overlay
      let points:Overlay['points']
      try{points=value.anchors?projectAnchors(value.anchors,widget.getDataList(),period()):overlay.points}catch(error){widget.removeOverlay({id});throw error}
      widget.removeOverlay({id});ownedDrawingIds.delete(id);completedDrawingIds.delete(id)
      const state=drawingController?.getState()
      const created=widget.createOverlay({...overlay,id,points,zLevel:value.presentation?.order??0,fixedZLevel:true,visible:overlay.visible&&!state?.hidden&&intervalVisible(value.presentation?.intervals,period()),lock:overlay.lock||state?.preventDragging,styles:overlay.styles??undefined,extendData:overlay.extendData??undefined,...drawingHandlers()})
      const actual=widget.getOverlays({id})[0]
      if(created!==id||!actual||(overlay.paneId&&actual.paneId!==overlay.paneId))throw Error(i18n('drawing_render_failure',locale()))
      ownedDrawingIds.add(id);completedDrawingIds.add(id)
      if(selected)markSelectedOverlay(actual)
      return {...value,logicalId:id,overlay:{...snapshotOverlay(actual),lock:overlay.lock,visible:overlay.visible}}
    }finally{applyingDrawing=false}
  }
  const drawingHistory=new DrawingHistory({
    locale,
    validate:validateDrawingTarget,
    context:()=>({symbol:symbol(),period:period()}),apply:applyDrawing,commit:change=>props.commitDrawing?props.commitDrawing(change):Promise.resolve({status:'rejected',message:i18n('drawing_message_3',locale())}),
    onChange:state=>{if(disposed)return;setDrawingState(state);props.onDrawingHistoryChange?.(state);drawingController?.refresh();queueMicrotask(()=>{if(!disposed)widget?.resize()})},
    onConfirmed:change=>{const event={overlay:(change.after??change.before)!.overlay,source:change.source};if(change.kind==='create')props.onOverlayCreate?.(event);else if(change.kind==='update')props.onOverlayUpdate?.(event);else props.onOverlayDelete?.(event)},
  })
  const commitDrawing=(change:Pick<DrawingChange,'kind'|'logicalId'|'after'|'source'>)=>{
    if(!widget)return Promise.reject(Error(i18n('chart_not_ready',locale())))
    try{if(change.after)validateDrawingTarget(change.after)}catch(error){return Promise.reject(error)}
    const overlay=change.after?.overlay??drawingHistory.getDrawings().find(d=>d.logicalId===change.logicalId)?.overlay
    if(overlay&&!editable(overlay))return Promise.reject(Error(i18n('drawing_protected',locale())))
    return drawingHistory.submit(change.kind,change.logicalId,change.after,change.source)
  }
  let activeDrawingId: string | null = null
  const cancelDrawing = () => {
    if (activeDrawingId) widget?.removeOverlay({ id: activeDrawingId })
    activeDrawingId = null
    setSelectedOverlay(null);setTextEditor(null)
  }
  const deleteSelectedDrawing = () => {
    const info = selectedOverlay()
    if (info && ownedDrawingIds.has(info.id) && !info.locked) {
      widget?.removeOverlay({ id: info.id })
      setSelectedOverlay(null)
    }
  }
  function drawingHandlers():Partial<OverlayCreate>{return {
      onDrawing:event=>drawingController?.setStep(event.overlay.currentStep),
      onDoubleClick:event=>{if(isText(event.overlay.name))promptTextOverlay(event.overlay,false)},
      onRightClick:event=>{event.preventDefault?.();markSelectedOverlay(event.overlay);if(isText(event.overlay.name))promptTextOverlay(event.overlay,false)},
      onDrawEnd: (event) => {
        if(widget&&isRuntimeAnalysisPane(widget,event.overlay.paneId)){
          // Reject the preview before text prompts, history or host persistence callbacks.
          applyingDrawing=true
          try{widget.removeOverlay({id:event.overlay.id})}finally{applyingDrawing=false}
          activeDrawingId=null;ownedDrawingIds.delete(event.overlay.id);completedDrawingIds.delete(event.overlay.id)
          setSelectedOverlay(null);props.onDrawingSelect?.(null)
          setDrawingState({...drawingHistory.getState(),error:i18n('drawing_runtime_pane',locale())})
          return true
        }
        activeDrawingId = null
        completedDrawingIds.add(event.overlay.id)
        if(!promptTextOverlay(event.overlay))notifyOverlay('drawing-bar', event.overlay, 'create')
        return true
      },
      onPressedMoveEnd: (event) => {
        notifyOverlay('drawing-bar', event.overlay, 'update')
        return true
      },
      onSelected: (event) => {
        // The engine can emit selection after onDrawEnd removed a rejected preview.
        if(!widget?.getOverlays({id:event.overlay.id}).length){setSelectedOverlay(null);props.onDrawingSelect?.(null);return true}
        markSelectedOverlay(event.overlay)
        return true
      },
      onDeselected: () => {
        void drawingController.execute({type:'select',ids:[]})
        setSelectedOverlay(null)
        return true
      },
      onRemoved: (event) => {
        if(applyingDrawing)return true
        if (activeDrawingId === event.overlay.id) activeDrawingId = null
        ownedDrawingIds.delete(event.overlay.id)
        if (completedDrawingIds.delete(event.overlay.id)) {
          notifyOverlay('drawing-bar', event.overlay, 'delete')
        }
        setSelectedOverlay(null)
        return true
      }
    }}
  const createDrawing = (overlay: OverlayCreate) => {
    if (disposed) return
    cancelDrawing()
    const id = widget?.createOverlay({...overlay,...drawingHandlers()})
    if (typeof id === 'string') {
      ownedDrawingIds.add(id)
      const drawing = widget?.getOverlays({id})[0]
      if (drawing && drawing.currentStep !== -1) activeDrawingId = id
    }
  }

  drawingController=new DrawingController({history:drawingHistory,catalog:drawingCatalog,
    editable:value=>editable(value.overlay),validate:validateDrawingTarget,
    create:tool=>createDrawing({name:tool.overlayName,groupId:'drawing_tools'}),cancel:cancelDrawing,
    owner:value=>props.drawingOwner?.(value.overlay)??'local',
    coordinates:(value,patch)=>{if(!widget)throw Error('图表尚未就绪');if(patch.anchors)return {...value,overlay:{...value.overlay,points:projectAnchors(patch.anchors,widget.getDataList(),period())}};return {...value,anchors:anchorsFromPoints(value.overlay.points,widget.getDataList(),period(),'interaction')}},
    project:()=>drawingHistory.reproject(),
    changed:state=>{setWorkbenchState(state);props.onDrawingStateChange?.(state)},
    selected:ids=>{props.onDrawingSelect?.(ids.length===1?ids[0]:null)}
  })

  props.ref({
    getAnalysisContext:()=>analysis.getContext(),
    addAnalysisLayer:(context,spec)=>analysis.add(context,spec),
    getIndicatorCatalog:()=>copyIndicatorCatalog(catalog),
    addIndicator,
    getIndicators:()=>{refreshIndicators();return indicatorInstances()},
    updateIndicator,removeIndicator,
    locateTimestamp: () => { throw new Error('[TradingChest] locateTimestamp must be called on KLineChartPro instance') },
    cancelDrawing, deleteSelectedDrawing, createDrawing,
    commitDrawing,
    getDrawingTools:()=>copyDrawingCatalog(drawingCatalog),
    getDrawingState:()=>drawingController.getState(),
    executeDrawingCommand:command=>drawingController.execute(command),
    getDrawings:()=>drawingHistory.getDrawings(),
    getDrawingHistoryState:()=>drawingHistory.getState(),
    restoreDrawings:(owner,values)=>{validateRestore(owner,values);drawingHistory.reconcile(owner,values)},
    resetDrawingHistory:()=>drawingHistory.reset(),
    undoDrawing:()=>drawingHistory.undo(),
    redoDrawing:()=>drawingHistory.redo(),
    retryData:()=>replayEngine?Promise.reject(new Error('回放中请先退出回放')):loader?.retry()??Promise.resolve(),
    reloadData: options => replayEngine ? Promise.reject(new Error('回放中请先退出回放，再重新加载行情')) : loader?.reload(options?.preserveViewport ?? true) ?? Promise.resolve(),
    applySnapshot: snapshot => loader?.applySnapshot(snapshot) ?? Promise.reject(new Error(i18n('chart_not_ready',locale()))),
    setTheme,
    getTheme: () => theme(),
    setStyles,
    getStyles: () => widget?.getStyles() ?? {} as Styles,
    setLocale,
    getLocale: () => locale(),
    setTimezone: (tz: string) => { setTimezone({ key: tz, text: translateTimezone(tz, locale()) }) },
    getTimezone: () => timezone().key,
    setSymbol: (s: SymbolInfo) => { if (!replayEngine) {++indicatorGeneration;setSymbol(s)} },
    getSymbol: () => symbol(),
    setPeriod: setChartPeriod,
    getPeriod: () => period(),
    getChart: () => widget,
    // 以下方法由 KLineChartPro 直接实现，不经过 _chartApi 代理
    // 如果有人绕过 KLineChartPro 直接调用组件 ref，给出明确错误
    exportCSV: () => { throw new Error('[TradingChest] exportCSV must be called on KLineChartPro instance') },
    exportAllCSV: () => { throw new Error('[TradingChest] exportAllCSV must be called on KLineChartPro instance') },
    exportScreenshot: () => { throw new Error('[TradingChest] exportScreenshot must be called on KLineChartPro instance') },
    getShortcutManager: () => { throw new Error('[TradingChest] getShortcutManager must be called on KLineChartPro instance') },
    addAlert: () => { throw new Error('[TradingChest] addAlert must be called on KLineChartPro instance') },
    updateAlert: () => { throw new Error('[TradingChest] updateAlert must be called on KLineChartPro instance') },
    removeAlert: () => { throw new Error('[TradingChest] removeAlert must be called on KLineChartPro instance') },
    getAlerts: () => { throw new Error('[TradingChest] getAlerts must be called on KLineChartPro instance') },
    addComparison:(symbol,feed)=>{if(feed===props.datafeed)return Promise.reject(Error('比较必须使用独立于主图的数据通道'));return comparisons.add(symbol,feed)},
    removeComparison:id=>comparisons.remove(id),
    cancelComparison:id=>comparisons.cancel(id),
    getComparisons:()=>comparisons.getState(),
    resetComparisonRange:()=>comparisons.resetRange(),
    refreshComparisons:()=>comparisons.retry(),
    startReplay: (pos?: number) => { startReplay(pos) },
    stopReplay: () => { stopReplay() },
    getReplayEngine: () => replayEngine,
    createTradeVisualization: () => { throw new Error('[TradingChest] createTradeVisualization must be called on KLineChartPro instance') },
    feedPrice: () => { throw new Error('[TradingChest] feedPrice must be called on KLineChartPro instance') },
    dispose: () => { throw new Error('[TradingChest] dispose must be called on KLineChartPro instance') },
  })

  const documentResize = () => {
    widget?.resize()
  }

  // Backspace/Delete 删除选中的绘图
  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Backspace' || e.key === 'Delete') {
      deleteSelectedDrawing()
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'Escape') {
      cancelDrawing()
      e.preventDefault()
      e.stopPropagation()
    }
  }

  onMount(() => {
    window.addEventListener('resize', documentResize)
    // 绑定到 container 而非 window，避免图表外的按键误触发
    widgetRef!.addEventListener('keydown', handleKeyDown)
    widgetRef!.addEventListener('click',analysisClick,true)
    if(typeof ResizeObserver!=='undefined'){analysisResizeObserver=new ResizeObserver(()=>widget?.resize());analysisResizeObserver.observe(widgetRef!)}
    widget = init(widgetRef!, {
      locale:locale(), timezone:timezone().key, styles:theme(),
      hotkey: {enabled:false},
      formatter: {
        formatDate: ({dateTimeFormat, timestamp, type}) => {
          const p = period()
          switch (p.timespan) {
            case 'minute': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'HH:mm')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
            }
            case 'hour': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'MM-DD HH:mm')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
            }
            case 'day':
            case 'week': return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            case 'month': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            }
            case 'year': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'YYYY')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            }
          }
          return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
        }
      }
    })

    if (widget) {
      const watermarkContainer = widget.getDom('candle_pane', 'main')
      if (watermarkContainer) {
        let watermark = document.createElement('div')
        watermark.className = 'klinecharts-pro-watermark'
        if (utils.isString(props.watermark)) {
          const str = (props.watermark as string).replace(/(^\s*)|(\s*$)/g, '')
          watermark.textContent = str
        } else {
          watermark.appendChild(props.watermark as Node)
        }
        watermarkContainer.appendChild(watermark)
      }

      const priceUnitContainer = widget.getDom('candle_pane', 'yAxis')
      priceUnitDom = document.createElement('span')
      priceUnitDom.className = 'klinecharts-pro-price-unit'
      priceUnitContainer?.appendChild(priceUnitDom)
    }

    if(widget)drawingBindings.set(widget,{history:drawingHistory,validateRestore})
    if (widget) loader = new EngineDataLoader(widget, props.datafeed, {
      committed:state=>analysis.sync(state),
      state: state=>{setDataState(state);setLoadError(state.error?`${state.errorCode??state.operation??'data'}: ${state.error}`:'');comparisons.mainChanged();props.onDataState?.(state)},
      loading: active => {setLoading(active);setLoadingVisible(active)},
      ready: identity => {setLoadError('');drawingHistory.reproject();if(!resuming())props.onDataReady?.(identity)},
      error: error => {setLoadError(error.message);props.onError?.(error)},
      price: bar => props.onPriceUpdate?.(bar.close,bar.timestamp)
    })

    // Capture default styles once for "restore defaults" in settings modal
    setWidgetDefaultStyles(structuredClone(widget!.getStyles()))

    let initializing = false
    retryInitialization = () => {
      if (initializing || disposed) return
      initializing = true
      setLoadingVisible(true)
      void (async () => {
        for(const name of props.mainIndicators){if(!widget?.getIndicators({name,paneId:'candle_pane'}).length)await addIndicator({name,placement:'main'})}
        for(const name of props.subIndicators){if(!widget?.getIndicators({name}).some(i=>i.paneId!=='candle_pane'))await addIndicator({name,placement:'sub'})}
        if(!disposed){refreshIndicators();setEngineReady(true)}
      })().catch(error=>{if(!disposed){setLoadError(i18n('indicator_initialization_retry',locale()));setLoadingVisible(false);props.onError?.({type:'indicator-init',message:i18n('indicator_initialization_failed',locale()),raw:error})}}).finally(()=>{initializing=false})
    }
    retryInitialization()
    widget?.subscribeAction('onIndicatorTooltipFeatureClick', (event) => {
      const data = event as {indicator: Indicator; feature: {id:string}; paneId:string}
      const indicator = data.indicator
      if (!indicator) return
      switch (data.feature.id) {
        case 'visible': updateIndicator(indicator.id,{visible:true}); break
        case 'invisible': updateIndicator(indicator.id,{visible:false}); break
        case 'setting': openIndicatorSettings(indicator.id); break
        case 'close': removeIndicator(indicator.id); break
      }
    })
    // 点击蜡烛区域时清除 overlay 选中状态
    widget?.subscribeAction('onCandleBarClick', () => {
      setSelectedOverlay(null)
    })

  })

  onCleanup(() => {
    disposed = true
    ++indicatorGeneration
    if(comparisonResizeFrame!==undefined)cancelAnimationFrame(comparisonResizeFrame)
    analysisResizeObserver?.disconnect()
    analysis.dispose()
    widgetRef!.removeEventListener('click',analysisClick,true)
    ++factoryGeneration;comparisons.dispose()
    if(widget)drawingBindings.delete(widget)
    drawingController.dispose();drawingHistory.dispose()
    loader?.dispose()
    window.removeEventListener('resize', documentResize)
    widgetRef!.removeEventListener('keydown', handleKeyDown)
    // 取消实时数据订阅，防止组件卸载后幽灵回调
    if (replayEngine) {
      replayEngine.stop()
      replayEngine.dispose()
      replayEngine = null
    }
    dispose(widgetRef!)
    widget = null
  })

  createEffect(() => {
    const s = symbol()
    if (priceUnitDom) {
      if (s?.priceCurrency) {
        priceUnitDom.textContent = s?.priceCurrency.toLocaleUpperCase()
        priceUnitDom.style.display = 'flex'
      } else {
        priceUnitDom.textContent = i18n('price_currency_unknown',locale())
        priceUnitDom.style.display = 'flex'
      }
    }
  })

  createEffect((prev?: PrevSymbolPeriod) => {
    const s = symbol(), p = period()
    if(!engineReady())return undefined
    if (prev) untrack(()=>{analysis.clear();++indicatorGeneration;++factoryGeneration;comparisons.clear();cancelDrawing();drawingHistory.reset(true);setSelectedOverlay(null);props.onDataReset?.(s)})
    setLoadError('')
    loader?.activate(s,p)
    return {symbol:s,period:p}
  })

  createEffect(()=>{locale();analysis.refreshPresentation();comparisons.refreshPresentation()})

  createEffect(() => {
    const t = theme()
    widget?.setStyles(t)
    const color = t === 'dark' ? '#929AA5' : '#76808F'
    widget?.setStyles({
      indicator: {
        tooltip: {
          features: [
            {
              id: 'visible',
              position: 'middle',
              marginLeft: 8,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              type: 'icon_font',
              content: {code:'\ue903', family:'icomoon'},
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'invisible',
              position: 'middle',
              marginLeft: 8,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              type: 'icon_font',
              content: {code:'\ue901', family:'icomoon'},
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'setting',
              position: 'middle',
              marginLeft: 6,
              marginTop: 7,
              marginBottom: 0,
              marginRight: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              type: 'icon_font',
              content: {code:'\ue902', family:'icomoon'},
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'close',
              position: 'middle',
              marginLeft: 6,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              type: 'icon_font',
              content: {code:'\ue900', family:'icomoon'},
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            }
          ]
        }
      }
    })
  })

  createEffect(() => {
    if(widget && widget.getLocale()!==locale())widget.setLocale(locale())
  })

  createEffect(() => {
    if(widget && widget.getTimezone()!==timezone().key)widget.setTimezone(timezone().key)
  })

  createEffect(() => {
    if (styles()) {
      widget?.setStyles(styles())
    }
  })

  return (
    <ErrorBoundary fallback={(err) => (
      <div style={{ padding: '20px', color: 'red', 'font-family': 'monospace' }}>
        [TradingChest] Render error: {err?.message ?? String(err)}
      </div>
    )}>
      <i class="icon-close klinecharts-pro-load-icon"/>
      <Show when={symbolSearchModalVisible()}>
        <SymbolSearchModal
          locale={locale()}
          datafeed={props.datafeed}
          onSymbolSelected={symbol => { setSymbol(symbol) }}
          onClose={() => { setSymbolSearchModalVisible(false) }}/>
      </Show>
      <Show when={indicatorModalVisible()}>
        <IndicatorModal
          locale={locale()}
          catalog={catalog}
          instances={indicatorInstances()}
          onClose={() => { setIndicatorModalVisible(false) }}
          onAdd={(name,placement)=>addIndicator({name,placement})}
          onRemove={removeIndicator}
          onUpdate={(id,visible)=>updateIndicator(id,{visible})}
          onSettings={openIndicatorSettings}/>
      </Show>
      <Show when={timezoneModalVisible()}>
        <TimezoneModal
          locale={locale()}
          timezone={timezone()}
          onClose={() => { setTimezoneModalVisible(false) }}
          onConfirm={setTimezone}
        />
      </Show>
      <Show when={settingModalVisible()}>
        <SettingModal
          locale={locale()}
          currentStyles={{...utils.clone(widget!.getStyles()), axis:{name:widget!.getYAxes({paneId:'candle_pane'})[0]?.name ?? 'normal',reverse:widget!.getYAxes({paneId:'candle_pane'})[0]?.reverse ?? false}}}
          onClose={() => { setSettingModalVisible(false) }}
          onChange={style => {
            const {axis,...engineStyles} = style as any
            if(axis) widget?.overrideYAxis({paneId:'candle_pane',id:widget?.getYAxes({paneId:'candle_pane'})[0]?.id,...axis})
            widget?.setStyles(engineStyles)
          }}
          onRestoreDefault={(options: SelectDataSourceItem[]) => {
            const style = {}
            options.forEach(option => {
              const key = option.key
              if(key.startsWith('axis.')) deepSet(style,key,key==='axis.name'?'normal':false)
              else deepSet(style, key, utils.formatValue(widgetDefaultStyles(), key))
            })
            const {axis,...engineStyles} = style as any
            if(axis) widget?.overrideYAxis({paneId:'candle_pane',id:widget?.getYAxes({paneId:'candle_pane'})[0]?.id,...axis})
            widget?.setStyles(engineStyles)
          }}
        />
      </Show>
      <Show when={screenshotUrl().length > 0}>
        <ScreenshotModal
          locale={locale()}
          url={screenshotUrl()}
          onClose={() => { setScreenshotUrl('') }}
        />
      </Show>
      <Show when={indicatorSettingModalParams().visible}>
        <IndicatorSettingModal
          locale={locale()}
          descriptor={descriptor(indicatorSettingModalParams().indicatorName)}
          params={indicatorSettingModalParams()}
          onClose={() => { setIndicatorSettingModalParams({ visible: false, indicatorId:'',indicatorName: '', paneId: '', calcParams: [] }) }}
          onConfirm={(params)=> {
            const modalParams = indicatorSettingModalParams()
            const indicator=modalParams.indicatorId?widget?.getIndicators({id:modalParams.indicatorId})[0]:undefined
            if(!indicator||indicator.name!==modalParams.indicatorName||indicator.paneId!==modalParams.paneId){throw Error(i18n('indicator_setting_target_missing',locale()))}
            updateIndicator(indicator.id,{calcParams:params})
          }}
        />
      </Show>
      <div class="klinecharts-pro-drawing-history" style={{display:'flex','flex-wrap':'wrap',gap:'8px',padding:'4px 8px','font-size':'12px'}}>
        <button aria-label={i18n('drawing_undo',locale())} disabled={!drawingState().canUndo||drawingState().pending>0} onClick={()=>void drawingHistory.undo().catch(()=>{})}>{i18n('drawing_undo',locale())}</button>
        <button aria-label={i18n('drawing_redo',locale())} disabled={!drawingState().canRedo||drawingState().pending>0} onClick={()=>void drawingHistory.redo().catch(()=>{})}>{i18n('drawing_redo',locale())}</button>
        <Show when={drawingState().pending>0}><span role="status">{i18n('drawing_pending',locale())}: {drawingState().pending}</span></Show>
        <Show when={drawingState().error}><span role="alert">{drawingState().error}</span></Show>
      </div>
      <div ref={comparisonPanel} class="klinecharts-pro-comparisons" style={{'max-height':'140px','overflow-y':'auto','flex-shrink':'0',display:'flex','flex-wrap':'wrap',gap:'8px',padding:'4px 8px','font-size':'12px'}}>
        <label>{i18n('comparison_select',locale())} <select aria-label={i18n('comparison_select',locale())} value={comparisonSelected()} disabled={!props.createComparisonDatafeed||!props.comparisonSymbols?.length||comparisonState().replay||comparisonState().restoring} onChange={e=>setComparisonSelected(e.currentTarget.value)}>
          <option value="">{i18n('comparison_choose',locale())}</option>
          {props.comparisonSymbols?.filter(value=>value.ticker!==symbol().ticker).map(value=><option value={value.ticker}>{value.name??value.ticker}</option>)}
        </select></label>
        <button disabled={!comparisonSelected()||!props.createComparisonDatafeed||comparisonState().replay||comparisonState().restoring} onClick={()=>void addSelectedComparison()}>{i18n('comparison_add',locale())}</button>
        <Show when={!props.createComparisonDatafeed||!props.comparisonSymbols?.length}><span>{i18n('comparison_unavailable',locale())}</span></Show>
        {comparisonState().pending.map(value=><span>{value.symbol.ticker} {i18n('comparison_loading',locale())} <button aria-label={`${i18n('comparison_cancel',locale())} ${value.symbol.ticker}`} onClick={()=>comparisons.cancel(value.id)}>{i18n('comparison_cancel',locale())}</button></span>)}
        {comparisonState().handles.map(value=><span data-comparison-symbol={value.symbol.ticker} data-comparison-return={value.plottedReturn} data-comparison-timestamp={value.plottedTimestamp}>{value.symbol.ticker} · {i18n('comparison_latest_return',locale())} {value.plottedReturn===undefined?i18n('comparison_no_return',locale()):`${value.plottedReturn.toFixed(2)}%`} · {value.mode==='static'?i18n('comparison_static',locale()):value.mode==='http-snapshot'?i18n('comparison_snapshot',locale()):i18n('comparison_stream',locale())} · {i18n('comparison_read_at',locale())} {value.readAt?new Date(value.readAt).toISOString():i18n('unknown',locale())} · {i18n('comparison_source_at',locale())} {value.sourceTimestamp?new Date(value.sourceTimestamp).toISOString():i18n('unknown',locale())} <button aria-label={`${i18n('comparison_remove',locale())} ${value.symbol.ticker}`} onClick={()=>comparisons.remove(value.id)}>{i18n('comparison_remove',locale())}</button></span>)}
        <Show when={comparisonState().handles.length>0}>
          <span data-main-return={comparisonState().mainReturn}>{i18n('comparison_main_latest',locale())}: {comparisonState().mainReturn===undefined?i18n('comparison_no_return',locale()):`${comparisonState().mainReturn!.toFixed(2)}%`}</span>
          <button disabled={comparisonState().replay||comparisonState().restoring} onClick={()=>void comparisons.resetRange().catch(()=>{})}>{i18n('comparison_reset',locale())}</button>
          <span data-comparison-base={comparisonState().baseTimestamp}>{i18n('comparison_common_base',locale())}: {comparisonState().baseTimestamp?new Date(comparisonState().baseTimestamp!).toISOString():i18n('comparison_incomparable',locale())} · {i18n('comparison_axes',locale())}</span>
          <span>{[symbol(),...comparisonState().handles.map(h=>h.symbol)].map(value=>`${value.ticker}：${value.priceCurrency?`${i18n('comparison_local_currency',locale())} ${value.priceCurrency}`:i18n('comparison_unknown_currency',locale())}`).join('；')} · {i18n('comparison_no_fx',locale())}</span>
        </Show>
        <Show when={comparisonState().notice}><span role="status">{comparisonState().notice}</span></Show>
        <Show when={comparisonState().replay}><span>{i18n('comparison_paused',locale())}</span></Show>
        <Show when={comparisonState().restoring}><span role="status">{i18n('comparison_restoring',locale())}</span></Show>
        <Show when={comparisonState().error}><button disabled={comparisonState().restoring} onClick={()=>void comparisons.retry().catch(()=>{})}>{i18n('comparison_retry',locale())}</button><span role="alert">{i18n('comparison_failure',locale())}: {comparisonState().error} · {i18n('comparison_next',locale())}</span></Show>
      </div>
      <PeriodBar
        locale={locale()}
        symbol={symbol()}
        spread={drawingBarVisible()}
        period={period()}
        periods={props.periods}
        onMenuClick={async () => {
          try {
            await startTransition(() => setDrawingBarVisible(!drawingBarVisible()))
            widget?.resize()
          } catch (e) { console.warn('[TradingChest] toggle drawing bar failed:', e) }
        }}
        onSymbolClick={() => { setSymbolSearchModalVisible(!symbolSearchModalVisible()) }}
        onPeriodChange={setChartPeriod}
        onIndicatorClick={() => { refreshIndicators();setIndicatorModalVisible((visible => !visible)) }}
        onTimezoneClick={() => { setTimezoneModalVisible((visible => !visible)) }}
        onSettingClick={() => { setSettingModalVisible((visible => !visible)) }}
        onScreenshotClick={() => {
          if (widget) {
            const url = widget.getConvertPictureUrl(true, 'jpeg', props.theme === 'dark' ? '#151517' : '#ffffff')
            setScreenshotUrl(url)
          }
        }}
        replayActive={replayState().active}
        onReplayClick={() => {
          if (replayState().active) {
            stopReplay()
          } else {
            startReplay()
          }
        }}
      />
      <div
        class="klinecharts-pro-content">
        <Show when={dataState()}>{state=><div role="status" class="klinecharts-pro-data-state">
          {i18n(`data_${state().dataStatus}`,locale())} · {i18n(`connection_${state().connection}`,locale())}
          <Show when={state().lastRead?.metadata?.state==='partial'}> · {i18n('data_partial',locale())}</Show>
          <Show when={state().lastRead}>{read=><span> · {i18n('data_last_read',locale())}: {read().query.kind==='before'?i18n('data_before',locale()):i18n('data_range',locale())} · {i18n('data_observed',locale())}: {read().metadata?.sourceTimestamp===undefined?i18n('data_unknown',locale()):new Date(read().metadata!.sourceTimestamp!).toISOString()} · {i18n('data_delay',locale())}: {read().metadata?.delayMs===undefined?i18n('data_unknown',locale()):`${read().metadata!.delayMs}ms`}</span>}</Show>
          <Show when={state().revisionRequired}><button onClick={()=>void loader?.reload(true).catch(()=>{})}>{i18n('data_revision',locale())}</button></Show>
        </div>}</Show>
        <For each={Object.entries(drawingState().projectionErrors??{})}>{([id,message])=><div role="alert" class="klinecharts-pro-data-error">{id}: {message} <button onClick={()=>drawingHistory.reproject()}>{i18n('retry',locale())}</button></div>}</For>
        <Show when={workbenchState()?.lastResult?.message}><div role="alert" class="klinecharts-pro-data-error">{workbenchState()?.lastResult?.message}</div></Show>
        <Show when={loadError()}><div role="alert" class="klinecharts-pro-data-error">{loadError()} <button onClick={() => {!engineReady() ? retryInitialization?.() : replayEngine ? stopReplay() : void loader?.retry().catch(()=>{})}}>{i18n('retry',locale())}</button></div></Show>
        <Show when={loadingVisible()}>
          <Loading/>
        </Show>
        <Show when={drawingBarVisible()}>
          <DrawingBar
            locale={locale()}
            catalog={drawingCatalog}
            onDrawingItemClick={overlay => {
              const tool=drawingCatalog.find(t=>t.overlayName===overlay.name);if(tool)void drawingController.execute({type:'tool',toolId:tool.toolId})
            }}
            onModeChange={mode => { for(const id of ownedDrawingIds)widget?.overrideOverlay({id,mode:mode as OverlayMode}) }}
            onLockChange={lock => {void drawingController.execute({type:'view',preventDragging:lock})}}
            onVisibleChange={visible => {void drawingController.execute({type:'view',hidden:!visible})}}
            onRemoveClick={(groupId) => { for(const id of [...ownedDrawingIds]){const overlay=widget?.getOverlays({id})[0];if(overlay&&(!groupId||overlay.groupId===groupId))widget?.removeOverlay({id})} }}/>
        </Show>
        <div
          ref={widgetRef}
          class='klinecharts-pro-widget'
          data-drawing-bar-visible={drawingBarVisible()}/>
        <Show when={textEditor()}>{editor=><DrawingTextEditor locale={locale()} value={editor().text} onConfirm={value=>finishText(value)} onCancel={()=>finishText(null)}/>}</Show>
        {/* Drawing properties */}
        <OverlayPropertyBar
          locale={locale()}
          visible={selectedOverlay() !== null}
          position={{ x: selectedOverlay()?.x ?? 0, y: selectedOverlay()?.y ?? 0 }}
          overlayId={selectedOverlay()?.id ?? ''}
          currentColor={selectedOverlay()?.color ?? '#1677ff'}
          currentFillColor={selectedOverlay()?.fillColor}
          currentLineWidth={selectedOverlay()?.lineWidth ?? 1}
          currentLineStyle={selectedOverlay()?.lineStyle ?? 'solid'}
          locked={selectedOverlay()?.locked ?? false}
          onColorChange={color=>{const info=selectedOverlay();if(info)void drawingController.execute({type:'update',ids:[info.id],patch:{overlay:{styles:{line:{color},point:{color},text:{color},arc:{color},polygon:{borderColor:color},circle:{borderColor:color},rect:{borderColor:color}}}}})}}
          onFillColorChange={fillColor=>{const info=selectedOverlay();if(info)void drawingController.execute({type:'update',ids:[info.id],patch:{overlay:{styles:{polygon:{color:fillColor,style:'stroke_fill'},circle:{color:fillColor,style:'stroke_fill'},rect:{color:fillColor,style:'stroke_fill'}}}}})}}
          onLineWidthChange={lineWidth=>{const info=selectedOverlay();if(info)void drawingController.execute({type:'update',ids:[info.id],patch:{overlay:{styles:{line:{size:lineWidth},polygon:{borderSize:lineWidth},circle:{borderSize:lineWidth},rect:{borderSize:lineWidth}}}}})}}
          onLineStyleChange={lineStyle=>{const info=selectedOverlay();if(info)void drawingController.execute({type:'update',ids:[info.id],patch:{overlay:{styles:{line:{style:lineStyle==='solid'?'solid':'dashed',dashedValue:lineStyle==='dotted'?[1,3]:[6,4]},polygon:{borderStyle:lineStyle==='solid'?'solid':'dashed'},circle:{borderStyle:lineStyle==='solid'?'solid':'dashed'},rect:{borderStyle:lineStyle==='solid'?'solid':'dashed'}}}}})}}
          onLockChange={lock=>{const info=selectedOverlay();if(info)void drawingController.execute({type:'update',ids:[info.id],patch:{overlay:{lock}}})}}
          onDelete={()=>{const info=selectedOverlay();if(info)void drawingController.execute({type:'delete',ids:[info.id]})}}
          onClose={() => setSelectedOverlay(null)}
        />
        <ReplayControlBar
          locale={locale()}
          state={replayState()}
          busy={resuming()}
          onPlay={() => { if(!resuming())replayEngine?.play() }}
          onPause={() => { replayEngine?.pause() }}
          onStepForward={() => { if(!resuming())replayEngine?.stepForward() }}
          onStepBackward={() => { if(!resuming())replayEngine?.stepBackward() }}
          onSpeedChange={(speed: ReplaySpeed) => { if(!resuming())replayEngine?.setSpeed(speed) }}
          onPositionChange={(pos: number) => { if(!resuming())replayEngine?.goToPosition(pos) }}
          onStop={() => { stopReplay() }}
        />
      </div>
      <div class="klinecharts-pro-analysis" style={{'max-height':analysisViews().some(v=>v.state.type==='label-series'&&v.state.visible)?'240px':'100px','overflow-y':'auto','flex-shrink':'0'}}>
        <Show when={props.analysisLayerListVisible!==false&&analysisViews().length}><div aria-label={i18n('analysis_layers',locale())}>
          <For each={analysisViews()}>{view=><div data-analysis-layer={view.state.id} data-analysis-status={view.state.status}>
            <label><input type="checkbox" checked={view.state.visible} onChange={e=>analysis.setVisible(view.state.id,e.currentTarget.checked)}/>{view.state.label}</label>
            <span role={view.state.status==='error'?'alert':'status'}>{i18n(`analysis_${view.state.status}`,locale())}{view.state.reason?` · ${view.state.reason}`:''}{view.state.unalignedCount?` (${view.state.unalignedCount})`:''}</span>
            <Show when={view.state.type==='events'}><AnalysisEventList events={view.events} onSelect={id=>analysis.selectEvent(view.state.id,id)}/></Show>
          </div>}</For>
        </div></Show>
        <For each={analysisViews().filter(v=>v.state.type==='label-series'&&v.state.visible)}>{view=><section data-analysis-label-series={view.state.id} aria-label={view.state.label}><strong>{view.state.label}</strong>
          <Show when={view.state.status==='error'}><p role="alert">{view.state.reason}</p></Show>
          <MetricSeries locale={locale()} theme={theme()} height={120} viewState={{status:view.state.status==='hidden'?'unavailable':view.points.length?'ready':view.state.status==='error'?'error':'empty',message:view.state.reason??i18n('analysis_empty',locale())}} points={view.points.map(p=>({id:p.id,x:p.label,y:p.value,label:p.label}))} onPointSelect={p=>analysis.selectPoint(view.state.id,p.id)}/>
        </section>}</For>
      </div>
    </ErrorBoundary>
  )
}

export default ChartProComponent
