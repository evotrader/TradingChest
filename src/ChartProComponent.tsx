import {createOpaqueId} from './ids'
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
  type Overlay, type OverlayCreate, type KLineData, type OverlayFigure
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
import {snappedPoint,type DrawingSnapCandidate} from './drawing/snap'
import {DrawingProjectionInventory} from './drawing/projectionInventory'
import {constrainedPoint,translatedDrawing,nudgedDrawing,rotatedDrawing,marketIndex} from './drawing/geometry'
import {DrawingCoordinator} from './drawing/coordinator'
import {drawingShareKey} from './drawing/document'
import type {DrawingSessionRegistry,DrawingShareResolver} from './drawing/session'
import {DrawingHistory} from './drawing/history'
import {DrawingController} from './drawing/controller'
import {isVolumeDrawing} from './drawing/analytics'
import {DrawingAnalyticsRuntime,drawingAnalyticsRuntimes} from './drawing/analyticsRuntime'
import {DrawingPreferencesManager} from './drawing/preferences'
import {drawingParameters,drawingContent,engineDrawingData} from './drawing/content'
import {drawingBindings} from './drawing/bindings'
import {validateDrawingRestore,assertDrawingRestoreAuthority} from './drawing/restore'
import {drawingFigureHit} from './drawing/hitTest'
import {anchorsFromPoints,projectAnchors,intervalVisible,validateAnchor} from './drawing/anchors'
import {copyDrawingCatalog,validateDrawingParameters} from './drawing/catalog'
import DrawingTextEditor from './widget/drawing-editor/TextEditor'
import DrawingAxisLabels from './widget/drawing-editor/AxisLabels'
import DrawingContextMenu from './widget/drawing-editor/ContextMenu'
import DrawingHandles,{type DrawingHandle} from './widget/drawing-editor/Handles'
import DrawingWorkbench from './widget/drawing-object-tree/DrawingWorkbench'
import AnalyticsSummary from './widget/drawing-object-tree/AnalyticsSummary'
import DrawingFavorites from './widget/drawing-bar/Favorites'
import type {DrawingHistoryState,DrawingSnapshot,DrawingChange} from './drawing/types'
import { buildStyles } from './core/buildStyles'
import type { OverlayLifecycleEvent, OverlayLifecycleSource } from './types'

export interface ChartComponentApi extends ChartPro {
  cancelDrawing: () => void
  deleteSelectedDrawing: () => void
  createDrawing: (overlay: OverlayCreate) => void
}

export interface ChartProComponentProps extends Required<Omit<ChartProOptions, 'analysisLayerListVisible'|'onAnalysisLayerChange'|'onAnalysisEventClick'|'onAnalysisPointSelect'|'indicatorCatalog' | 'container' | 'onAlertTrigger' | 'onReplayAlertTrigger' | 'onError' | 'onDataReady' | 'onDataState'|'comparisonSymbols'|'createComparisonDatafeed'|'onComparisonChange'|'onDrawingSelect'|'drawingOwner'|'isDrawingEditable'|'commitDrawing'|'onDrawingHistoryChange'|'drawingCatalog'|'onDrawingStateChange'|'drawingPreferences'|'drawingPreferencesStore'|'drawingPreferencesScope'|'resolveDrawingShareKey'|'drawingWorkspaceSessions'|'drawingHostSessions'|'createDrawingDocumentId'>> {
  analysisLayerListVisible?:ChartProOptions['analysisLayerListVisible']
  onAnalysisLayerChange?:ChartProOptions['onAnalysisLayerChange']
  onAnalysisEventClick?:ChartProOptions['onAnalysisEventClick']
  onAnalysisPointSelect?:ChartProOptions['onAnalysisPointSelect']
  drawingPreferences?:ChartProOptions['drawingPreferences']
  drawingPreferencesStore?:ChartProOptions['drawingPreferencesStore']
  drawingPreferencesScope?:ChartProOptions['drawingPreferencesScope']
  drawingCatalog?:ChartProOptions['drawingCatalog']
  resolveDrawingShareKey?:ChartProOptions['resolveDrawingShareKey']
  drawingWorkspaceSessions?:DrawingSessionRegistry
  createDrawingDocumentId?:ChartProOptions['createDrawingDocumentId']
  drawingHostSessions?:DrawingSessionRegistry
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
    extendData: drawingContent(overlay.extendData),
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
  const drawingAnalytics=new DrawingAnalyticsRuntime()
  const [drawingContextEpoch,setDrawingContextEpoch]=createSignal(0)
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

  const [workbenchOpen,setWorkbenchOpen]=createSignal(false)
  const [workbenchEditing,setWorkbenchEditing]=createSignal<string>()
  const [drawingMenu,setDrawingMenu]=createSignal<{x:number;y:number}>()
  const [selectionBox,setSelectionBox]=createSignal<{x:number;y:number;width:number;height:number}>()
  const [drawingHandles,setDrawingHandles]=createSignal<DrawingHandle[]>([])
  const [drawingAxisLabels,setDrawingAxisLabels]=createSignal<Array<{id:string;x:number;y:number;text:string;side:'left'|'right'|'time'}>>([])
  const [temporaryPan,setTemporaryPan]=createSignal(false)
  const [textEditor,setTextEditor]=createSignal<{id:string;text:string;creating:boolean;target:Overlay}|null>(null)
  const textOf=(value:unknown)=>typeof value==='string'?value:value&&typeof value==='object'&&'text' in value?String(value.text??''):''
  const isText=(name:string)=>['textAnnotation','callout','note','anchoredText'].includes(name)
  const notifyOverlay = (source: OverlayLifecycleSource, overlay: Overlay, kind: 'create' | 'update' | 'delete') => {
    if(applyingDrawing)return
    const value=snapshotOverlay(overlay),existing=drawingCoordinator?.getDrawing(overlay.id)??drawingHistory.getDrawing(overlay.id)
    if(existing){value.lock=existing.overlay.lock;value.visible=existing.overlay.visible}
    try{
      let anchors=kind==='delete'?undefined:anchorsFromPoints(overlay.points,widget?.getDataList()??[],period(),'interaction')
      if(kind==='create'&&overlay.name==='anchoredText')anchors=[convertDrawingAnchor({logicalId:overlay.id,owner:'local',overlay:value,anchors},0,'viewport')]
      if(kind==='update'){
        void drawingController.execute({type:'update',ids:[overlay.id],patch:source==='property-bar'?{text:textOf(overlay.extendData)}:{anchors}})
      }else void commitDrawing({kind,logicalId:overlay.id,after:kind==='delete'?null:{...existing,logicalId:overlay.id,owner:existing?.owner??props.drawingOwner?.(value)??'local',overlay:value,anchors,yAxisId:existing?.yAxisId,parameters:existing?.parameters??drawingParameters(overlay.extendData)},source}).then(result=>{if(kind==='create'&&result.status==='confirmed'){if(selectedOverlay()?.id===overlay.id)void drawingController.execute({type:'select',ids:[overlay.id]});drawingController.completed(drawingCatalog.find(t=>t.overlayName===overlay.name)?.toolId)}}).catch(reason=>{if(kind==='create'&&widget?.getOverlays({id:overlay.id})[0]===overlay){applyingDrawing=true;try{widget?.removeOverlay({id:overlay.id});ownedDrawingIds.delete(overlay.id);completedDrawingIds.delete(overlay.id)}finally{applyingDrawing=false}}setDrawingState({...drawingCoordinator.state(),error:reason instanceof Error?reason.message:String(reason)})})
    }catch(reason){setDrawingState({...drawingHistory.getState(),error:reason instanceof Error?reason.message:String(reason)})}
  }
  const promptTextOverlay = (overlay:Overlay,creating=true) => {
    if(!isText(overlay.name))return false
    setTextEditor({id:overlay.id,text:textOf(overlay.extendData),creating,target:overlay});return true
  }
  const finishText=(text:string|null)=>{
    const editor=textEditor();if(!editor)return
    setTextEditor(null)
    const overlay=widget?.getOverlays({id:editor.id})[0];if(overlay!==editor.target){setSnapHint('绘图对象已被替换，本次文字编辑已取消');return}
    if(text===null){if(editor.creating){applyingDrawing=true;try{widget?.removeOverlay({id:editor.id})}finally{applyingDrawing=false}ownedDrawingIds.delete(editor.id);completedDrawingIds.delete(editor.id)}return}
    overlay.extendData=typeof overlay.extendData==='object'&&overlay.extendData?{...overlay.extendData,text}:text
    notifyOverlay('property-bar',overlay,editor.creating?'create':'update')
  }
  const markSelectedOverlay = (overlay: Overlay,select=true) => {
    if (overlay.id) {
      if(select&&(drawingCoordinator?.getDrawing(overlay.id)??drawingHistory.getDrawing(overlay.id))){
        const selected=drawingController.getSelectedIds(),additive=drawingModifiers.control||drawingModifiers.shift
        void drawingController.execute({type:'select',ids:additive?(selected.includes(overlay.id)?selected.filter(id=>id!==overlay.id):[...selected,overlay.id]):selected.includes(overlay.id)?selected:[overlay.id]})
      }
      const points = overlay.points ?? []
      let x = 0, y = 0
      if (points.length > 0 && widget) {
        try{const value=drawingCoordinator.getDrawing(overlay.id),pane=widget.getDom(overlay.paneId,'main'),content=pane?.closest('.klinecharts-pro-content'),r=pane?.getBoundingClientRect(),outer=content?.getBoundingClientRect(),pixel=value?drawingToPixel(projectDrawingPoints(value)[0],value):undefined
          x=(pixel?.x??200)+(r?.left??0)-(outer?.left??0);y=(pixel?.y??100)+(r?.top??0)-(outer?.top??0)-54
          if(outer){x=Math.min(outer.width-240,x);y=Math.min(outer.height-48,y)}
        }catch{ x=100;y=10 }
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
        x: Math.max(0, x),
        y: Math.max(10, y),
        color: own?.line?.color??own?.text?.color??defaults?.line.color??'#1677ff',
        fillColor: hasFill ? typeof fill==='string'?fill:'rgba(22, 119, 255, 0.15)' : undefined,
        lineWidth: line.size??1,
        lineStyle: line.style==='dashed'&&line.dashedValue?.[0]===1?'dotted':line.style??'solid',
        locked:(drawingCoordinator?.getDrawing(overlay.id)??drawingHistory.getDrawing(overlay.id))?.overlay.lock??overlay.lock??false
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
  const analysisClick=(event:MouseEvent)=>analysis.click(event)

  // 回放状态
  const defaultReplayState: ReplayState = { active: false, playing: false, speed: 1, position: 0, totalBars: 0 }
  const [replayState, setReplayState] = createSignal<ReplayState>(defaultReplayState)
  let replayEngine: ReplayEngine | null = null
  let replayRevision=0,replayPrefix:KLineData[]=[]

  const assertDrawingTransition=()=>{const state=drawingCoordinator?.state();if(state&&(state.pending&&!(drawingHistory.isLayoutRestoring()&&state.pending===1)||state.uncertainLogicalIds.length))throw Error('绘图提交或迁移尚未确认，请先核对原目标再切换')}
  const setChartPeriod = (nextPeriod: Period) => {
    if (replayEngine) return
    assertDrawingTransition();++indicatorGeneration
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
  const nativeDrawingPreviews = new WeakSet<Overlay>()
  let applyingDrawing=false
  let drawingPresentationFrame:number|undefined
  const [drawingState,setDrawingState]=createSignal<DrawingHistoryState>({pending:0,canUndo:false,canRedo:false,uncertainLogicalIds:[]})
  const drawingCatalog=copyDrawingCatalog(props.drawingCatalog)
  let drawingController:DrawingController
  let drawingCoordinator:DrawingCoordinator
  const [workbenchState,setWorkbenchState]=createSignal<import('./drawing/types').DrawingState>()
  const editable=(overlay:OverlayLifecycleEvent['overlay'])=>drawingCatalog.some(t=>t.overlayName===overlay.name)&&overlay.name!=='alertLine'&&!overlay.id?.startsWith('alert_')&&(props.isDrawingEditable?.(overlay)??true)
  const validateDrawingTarget=(value:DrawingSnapshot,target?:import('./drawing/bindings').DrawingRestoreTarget)=>{
    if(widget&&!target&&value.overlay.paneId&&!widget.getPaneOptions(value.overlay.paneId))throw Error(i18n('drawing_pane_missing',locale()))
    if(value.anchors)for(const anchor of value.anchors)validateAnchor(anchor)
    if(isVolumeDrawing(value.overlay.name)){
      const tool=drawingCatalog.find(tool=>tool.overlayName===value.overlay.name)!
      validateDrawingParameters(tool,value.parameters??{})
      if((value.overlay.paneId??'candle_pane')!=='candle_pane'||value.anchors?.length!==tool.minPoints||value.anchors.some(anchor=>anchor.kind!=='market'||anchor.interpolation))throw Error('量价工具仅支持主价格窗格的真实市场时间锚点')
    }
    if(value.anchors?.some(anchor=>anchor.kind==='viewport')&&(!isText(value.overlay.name)||value.anchors.length!==1))throw Error('视口锚定仅适用于单点文字')
    const axes=target?.axes.filter(axis=>axis.paneId===(value.overlay.paneId??'candle_pane'))??widget?.getYAxes({paneId:value.overlay.paneId??'candle_pane'})??[]
    if(widget&&value.yAxisId&&!axes.some(axis=>axis.id===value.yAxisId))throw Error('绘图绑定的价格轴不存在，请重新选择')
    const axis=value.yAxisId?axes.find(axis=>axis.id===value.yAxisId):target?target.axes.find(axis=>axis.paneId===(value.overlay.paneId??'candle_pane')&&axis.default)??axes[0]:axes[0]
    if(isVolumeDrawing(value.overlay.name)&&value.yAxisId&&axis!==axes[0])throw Error('量价工具只能绑定主价格轴')
    if(!isVolumeDrawing(value.overlay.name)&&axis&&/log/i.test(axis.name)&&value.anchors?.some(anchor=>'value' in anchor&&anchor.value<=0))throw Error('对数轴不能绘制零或负值，请调整坐标或选择线性轴')
    if(widget&&isRuntimeAnalysisPane(widget,value.overlay.paneId))throw Error(i18n('drawing_runtime_pane',locale()))
  }
  const projectDrawingPoints=(value:DrawingSnapshot)=>{
    if(isVolumeDrawing(value.overlay.name)&&value.anchors){const bars=widget?.getDataList()??[];return value.anchors.map(anchor=>{if(anchor.kind!=='market')throw Error('量价工具只支持市场时间');let dataIndex=0;try{dataIndex=marketIndex(anchor.timestamp,bars)}catch{dataIndex=bars.length&&anchor.timestamp>bars[bars.length-1].timestamp?bars.length-1:0}return {timestamp:anchor.timestamp,dataIndex,value:anchor.value}})}
    return value.anchors?projectAnchors(value.anchors,widget?.getDataList()??[],period(),(x,y)=>{
    const size=widget?.getSize(value.overlay.paneId??'candle_pane','main');if(!size?.width||!size.height)throw Error('绘图视口尺寸尚未就绪')
    const points=widget!.convertFromPixel([{x:x*size.width,y:y*size.height}],{paneId:value.overlay.paneId,yAxisId:value.yAxisId})
    return Array.isArray(points)?points[0]:points
  }):value.overlay.points}
  const drawingSize=(value:DrawingSnapshot)=>{const size=widget?.getSize(value.overlay.paneId??'candle_pane','main');if(!size)throw Error('绘图窗格尺寸尚未就绪');return size}
  const drawingToPixel=(point:Overlay['points'][number],value:DrawingSnapshot)=>{
    if(!widget)throw Error('图表尚未就绪')
    const dataIndex=point.dataIndex!==undefined?point.dataIndex:point.timestamp!==undefined?marketIndex(point.timestamp,widget.getDataList()):undefined
    const pixel=widget.convertToPixel({dataIndex,value:point.value},{paneId:value.overlay.paneId,yAxisId:value.yAxisId}) as {x?:number;y?:number}
    if(!Number.isFinite(pixel.x)||!Number.isFinite(pixel.y))throw Error('绘图坐标不适用于当前价格轴或历史范围')
    return {x:pixel.x!,y:pixel.y!}
  }
  const drawingFromPixel=(pixel:{x:number;y:number},value:DrawingSnapshot)=>{
    if(!widget)throw Error('图表尚未就绪')
    const filter={paneId:value.overlay.paneId,yAxisId:value.yAxisId},converted=widget.convertFromPixel([pixel],filter),point=Array.isArray(converted)?converted[0]:converted
    const origin=widget.convertToPixel({dataIndex:0,value:point.value},filter) as {x:number},space=widget.getBarSpace().bar,raw=(pixel.x-origin.x)/space,dataIndex=Math.abs(raw-Math.round(raw))<1e-7?Math.round(raw):raw
    if(!Number.isFinite(dataIndex)||!Number.isFinite(point.value))throw Error('无法解析绘图坐标，请检查价格轴')
    return {...point,dataIndex}
  }
  const translateDrawing=(value:DrawingSnapshot,dx:number,dy:number)=>translatedDrawing(value,dx,dy,{bars:widget?.getDataList()??[],period:period(),size:drawingSize,toPixel:drawingToPixel,fromPixel:drawingFromPixel,project:projectDrawingPoints})
  const nudgeDrawing=(value:DrawingSnapshot,dx:number,dy:number)=>nudgedDrawing(value,dx,dy,{bars:widget?.getDataList()??[],period:period(),size:drawingSize,toPixel:drawingToPixel,fromPixel:drawingFromPixel,project:projectDrawingPoints})
  const convertDrawingAnchor=(value:DrawingSnapshot,index:number,kind:import('./drawing/types').DrawingAnchor['kind']):import('./drawing/types').DrawingAnchor=>{
    if(!widget)throw Error('图表尚未就绪')
    const points=projectDrawingPoints(value),point=points[index],paneId=value.overlay.paneId??'candle_pane'
    if(!point)throw Error('绘图坐标不存在')
    if(kind==='viewport'){
      if(!isText(value.overlay.name)||points.length!==1)throw Error('视口锚定仅适用于单点文字')
      const size=widget.getSize(paneId,'main'),pixel=widget.convertToPixel(point,{paneId,yAxisId:value.yAxisId}) as {x?:number;y?:number}
      if(!size?.width||!size.height||pixel.x===undefined||pixel.y===undefined)throw Error('绘图视口坐标尚未就绪')
      return {kind:'viewport',x:Math.max(0,Math.min(1,pixel.x/size.width)),y:Math.max(0,Math.min(1,pixel.y/size.height))}
    }
    const bars=widget.getDataList();if(!bars.length||point.value===undefined)throw Error('请先加载真实历史')
    const pixel=widget.convertToPixel(point,{paneId,yAxisId:value.yAxisId}) as {x?:number;y?:number},converted=widget.convertFromPixel([pixel],{paneId,yAxisId:value.yAxisId}),actual=Array.isArray(converted)?converted[0]:converted
    const dataIndex=point.dataIndex??actual.dataIndex
    if(dataIndex===undefined||!Number.isFinite(dataIndex))throw Error('无法定位绘图参考 K 线')
    if(kind==='logical'){const reference=Math.max(0,Math.min(bars.length-1,Math.floor(dataIndex)));return {kind:'logical',referenceTimestamp:bars[reference].timestamp,offsetBars:dataIndex-reference,period:{multiplier:period().multiplier,timespan:period().timespan},value:point.value}}
    const bar=bars[Math.round(dataIndex)];if(!bar)throw Error('未来区域没有已知市场时刻，请先移动到真实历史区域')
    return {kind:'market',timestamp:bar.timestamp,value:point.value}
  }
  const validateProjectionRestore=(values:DrawingSnapshot[],target?:import('./drawing/bindings').DrawingRestoreTarget)=>{
    validateDrawingRestore(values,{editable,existing:widget?.getOverlays().map(snapshotOverlay)??[],ownedIds:new Set([...drawingHistory.getDrawingIds(),...(widget?.getOverlays().filter(object=>nativeDrawingPreviews.has(object)).map(object=>object.id)??[]),...[...sharedProjectionObjects].filter(([id,object])=>object===widget?.getOverlays({id})[0]).map(([id])=>id)])})
    for(const value of values)validateDrawingTarget(value,target)
  }
  const validateRestore=(_owner:import('./drawing/types').DrawingOwner,values:DrawingSnapshot[],target?:import('./drawing/bindings').DrawingRestoreTarget)=>{
    assertDrawingRestoreAuthority(values,drawingCoordinator.getSharedDrawingIds())
    validateProjectionRestore(values,target)
  }
  const drawingPreviews=new Map<string,DrawingSnapshot>()
  const drawingFigures=new WeakMap<Overlay,OverlayFigure[]>()
  const drawingHandlePixel=(point:Overlay['points'][number],value:DrawingSnapshot,size:{height:number})=>{
    if(!isVolumeDrawing(value.overlay.name))return drawingToPixel(point,value)
    const bars=widget!.getDataList(),index=Math.max(0,Math.min(bars.length-1,Math.round(point.dataIndex??0)))
    // A time handle is geometry only: its display price never writes back to the canonical anchor.
    const pixel=widget!.convertToPixel({dataIndex:point.dataIndex,value:bars[index]?.close},{paneId:value.overlay.paneId,yAxisId:value.yAxisId}) as {x?:number;y?:number}
    if(!Number.isFinite(pixel.x))throw Error('时间控制点不在当前历史范围')
    const margin=Math.min(22,size.height/2),y=Number.isFinite(pixel.y)?pixel.y!:size.height/2
    return {x:pixel.x!,y:Math.max(margin,Math.min(size.height-margin,y))}
  }
  const refreshDrawingHandles=()=>{
    if(!widget||disposed)return
    const root=(widgetRef as HTMLDivElement|undefined)?.closest('.klinecharts-pro-content')?.getBoundingClientRect(),handles:DrawingHandle[]=[],labels:Array<{id:string;x:number;y:number;text:string;side:'left'|'right'|'time'}>=[]
    if(!root)return
    for(const id of drawingController?.getSelectedIds()??[]){const value=drawingPreviews.get(id)??drawingCoordinator.getDrawing(id);if(!value||!drawingIsVisible(value))continue
      const pane=widget.getDom(value.overlay.paneId??'candle_pane','main')?.getBoundingClientRect();if(!pane)continue
      try{const points=projectDrawingPoints(value),size=drawingSize(value);points.forEach((point,index)=>{const anchor=value.anchors?.[index],pixel=anchor?.kind==='viewport'?{x:anchor.x*size.width,y:anchor.y*size.height}:drawingHandlePixel(point,value,size);if(pixel.x<0||pixel.y<0||pixel.x>pane.width||pixel.y>pane.height)return;const axis=widget!.getYAxes({paneId:value.overlay.paneId??'candle_pane'}).find(axis=>!value.yAxisId||axis.id===value.yAxisId);if(point.value!==undefined&&!isVolumeDrawing(value.overlay.name))labels.push({id:`${id}:y:${index}`,x:pane.left-root.left+(axis?.position==='left'?0:pane.width),y:pane.top-root.top+pixel.y,text:`${Number(point.value).toFixed(symbol().pricePrecision??2)} · ${axis?.id===widget!.getYAxes({paneId:value.overlay.paneId??'candle_pane'})[0]?.id?'':axis?.id??''}`,side:axis?.position==='left'?'left':'right'});const timePane=widget!.getDom('x_axis_pane','main')?.getBoundingClientRect();if(timePane){const label=anchor?.kind==='logical'?`${locale()==='en-US'?'Following bars':'后续根数'} ${anchor.offsetBars.toFixed(2)}`:anchor?.kind==='market'?`${new Date(anchor.timestamp).toISOString()}${anchor.interpolation?` + ${(anchor.interpolation.fraction*100).toFixed(1)}% ${locale()==='en-US'?'of reference interval':'参考时段'}`:''}`:undefined;if(label)labels.push({id:`${id}:x:${index}`,x:pane.left-root.left+pixel.x,y:timePane.top-root.top,text:label,side:'time'})}handles.push({id,index,x:pane.left-root.left+pixel.x,y:pane.top-root.top+pixel.y,label:`${locale()==='en-US'?'Drawing point':'绘图控制点'} ${index+1} · ${value.presentation?.name??(isVolumeDrawing(value.overlay.name)?drawingCatalog.find(t=>t.overlayName===value.overlay.name)?.labels[locale()==='en-US'?'en-US':'zh-CN']??value.overlay.name:value.overlay.name)}`,timeOnly:isVolumeDrawing(value.overlay.name),locked:value.overlay.lock||drawingController.getViewState().preventDragging})})}catch{}
    }
    if(!handleDrag)setDrawingHandles(handles);setDrawingAxisLabels(labels)
    const selected=selectedOverlay(),first=selected&&handles.find(handle=>handle.id===selected.id&&handle.index===0)
    if(first){const x=Math.max(0,Math.min(root.width-240,first.x)),y=Math.max(10,Math.min(root.height-48,first.y>=74?first.y-64:first.y+32));if(x!==selected.x||y!==selected.y)setSelectedOverlay({...selected,x,y})}
  }
  let handleLayoutFrame:number|undefined
  const refreshDrawingHandleLayout=()=>{
    refreshDrawingHandles()
    if(handleLayoutFrame===undefined)handleLayoutFrame=requestAnimationFrame(()=>{handleLayoutFrame=undefined;refreshDrawingHandles()})
  }
  let handleDrag:{handle:DrawingHandle;before:DrawingSnapshot;invalid?:string}|undefined
  const startDrawingHandle=(handle:DrawingHandle)=>{const before=drawingCoordinator.getDrawing(handle.id);if(before)handleDrag={handle,before}}
  const sameDrawing=(a:DrawingSnapshot|undefined,b:DrawingSnapshot)=>JSON.stringify(a)===JSON.stringify(b)
  const restoreCurrentDrawings=(ids:string[])=>{for(const id of ids){drawingPreviews.delete(id);const current=drawingCoordinator.getDrawing(id);if(current)applyDrawing(id,current);else if(ownedDrawingIds.has(id))applyDrawing(id,null)}refreshDrawingHandles()}
  const controlPointProposal=(before:DrawingSnapshot,index:number,pixel:{x:number;y:number})=>{
    const actual=widget?.getOverlays({id:before.logicalId})[0];if(!actual)throw Error('绘图已不再显示，请刷新对象列表')
    const overlay=Object.assign(Object.create(actual),{points:projectDrawingPoints(before)}) as Overlay
    drawingPointInput(overlay,pixel,index,'edit')
    const anchors=anchorsFromPoints(overlay.points,widget!.getDataList(),period(),'interaction'),size=drawingSize(before)
    if(before.anchors?.[index]?.kind==='viewport')anchors[index]={kind:'viewport',x:Math.max(0,Math.min(1,pixel.x/size.width)),y:Math.max(0,Math.min(1,pixel.y/size.height))}
    return {...structuredClone(before),anchors,overlay:{...structuredClone(before.overlay),points:structuredClone(overlay.points)}}
  }
  const moveDrawingHandle=(handle:DrawingHandle,event:PointerEvent)=>{
    const drag=handleDrag,pane=widget?.getDom(drag?.before.overlay.paneId??'candle_pane','main')?.getBoundingClientRect();if(!drag||!pane)return
    drawingModifierKey(event as unknown as KeyboardEvent)
    try{if(!sameDrawing(drawingCoordinator.getDrawing(handle.id),drag.before))throw Error('绘图已被更新，本次拖动已取消，请重新选择')
      const preview=controlPointProposal(drag.before,handle.index,{x:event.clientX-pane.left,y:event.clientY-pane.top});drawingPreviews.set(handle.id,preview);widget!.overrideOverlay({id:handle.id,points:preview.overlay.points})
      refreshDrawingHandles()
      const root=(widgetRef as HTMLDivElement|undefined)?.closest('.klinecharts-pro-content')?.getBoundingClientRect(),button=event.currentTarget as HTMLElement;if(root){button.style.left=`${event.clientX-root.left-22}px`;button.style.top=`${event.clientY-root.top-22}px`}
    }catch(error){drag.invalid=error instanceof Error?error.message:String(error);setSnapHint(drag.invalid)}
  }
  const endDrawingHandle=(handle:DrawingHandle,cancel:boolean)=>{const drag=handleDrag,preview=drawingPreviews.get(handle.id);handleDrag=undefined;if(!drag)return
    if(cancel||drag.invalid||!preview||!sameDrawing(drawingCoordinator.getDrawing(handle.id),drag.before)){restoreCurrentDrawings([handle.id]);return}
    void drawingController.commitPreview({type:'update',ids:[handle.id],patch:{anchors:preview.anchors}},[drag.before]).then(result=>{if(result.status==='rejected')restoreCurrentDrawings([handle.id]);else refreshDrawingHandles()})
  }
  const nudgeDrawingHandle=(handle:DrawingHandle,dx:number,dy:number)=>{if(!temporaryPan()&&!handle.locked)void drawingController.nudgePoint(handle.id,handle.index,dx,dy)}
  let nativeDrawingDrag:{id:string;before:DrawingSnapshot;objects:DrawingSnapshot[];x:number;y:number;pointIndex:number|null;clone:boolean;dx:number;dy:number;invalid?:string}|undefined
  const projectedDrawingObjects=new Map<string,Overlay>()
  let projectionInventory:DrawingProjectionInventory|undefined
  const engineDrawing=(id:string)=>{
    if(!widget)return undefined
    projectionInventory??=new DrawingProjectionInventory(widget)
    const current=projectionInventory.get(id)
    // Foreign overlays can use native removal handlers; recheck their current membership.
    return current&&(projectedDrawingObjects.get(id)===current||nativeDrawingPreviews.has(current))?current:widget.getOverlays({id})[0]
  }
  const projectedDrawingDefinitions=new Map<string,{key:string;presentation:string}>()
  const applyDrawing=(id:string,value:DrawingSnapshot|null):DrawingSnapshot|null=>{
    if(!widget)throw Error(i18n('chart_not_ready',locale()))
    if(value?.overlay.paneId&&!widget.getPaneOptions(value.overlay.paneId))throw Error(i18n('drawing_pane_missing',locale()))
    const selected=selectedOverlay()?.id===id
    if(handleDrag?.handle.id===id&&!sameDrawing(value??undefined,handleDrag.before))handleDrag.invalid='绘图已被更新，本次拖动已取消，请重新选择'
    if(nativeDrawingDrag?.objects.some(before=>before.logicalId===id&&!sameDrawing(value??undefined,before)))nativeDrawingDrag.invalid='绘图已被更新，本次拖动已取消，请重新选择'
    drawingPreviews.delete(id)
    applyingDrawing=true
    try{
      const current=engineDrawing(id),owned=!current||projectedDrawingObjects.get(id)===current||nativeDrawingPreviews.has(current)
      if(value&&!owned)throw Error('绘图 ID 已被宿主对象占用，原绘图已保留，请处理冲突后重试')
      const remove=()=>{if(owned)widget!.removeOverlay({id});projectedDrawingObjects.delete(id);projectedDrawingDefinitions.delete(id);ownedDrawingIds.delete(id);completedDrawingIds.delete(id)}
      if(!value){remove();if(selected)setSelectedOverlay(null);return null}
      const overlay=value.overlay
      const key=JSON.stringify([overlay,value.anchors,value.yAxisId,value.parameters]),presentation=JSON.stringify(value.presentation??null)
      const previous=projectedDrawingDefinitions.get(id)
      if(current&&previous?.key===key&&previous.presentation!==presentation){
        // Presentation does not change canonical geometry or the figure wrapper's inputs.
        const view=drawingController?.getViewState()
        widget.overrideOverlay({id,zLevel:value.presentation?.order??0,fixedZLevel:true,visible:overlay.visible&&!view?.hidden&&intervalVisible(value.presentation?.intervals,period()),lock:overlay.lock||view?.preventDragging||temporaryPan()})
        projectedDrawingDefinitions.set(id,{key,presentation})
        if(selected)markSelectedOverlay(current,false)
        return value
      }
      let points:Overlay['points']
      try{points=projectDrawingPoints(value);points.forEach((point,index)=>{if(value.anchors?.[index]?.kind!=='viewport')drawingToPixel(point,value)})}catch(error){remove();throw error}
      remove()
      const state=drawingController?.getViewState()
      const created=widget.createOverlay({...overlay,id,points,zLevel:value.presentation?.order??0,fixedZLevel:true,visible:overlay.visible&&!state?.hidden&&intervalVisible(value.presentation?.intervals,period()),lock:overlay.lock||state?.preventDragging||temporaryPan(),styles:overlay.styles??undefined,extendData:engineDrawingData(overlay.extendData,value.parameters)??undefined,...drawingHandlers()})
      const actual=engineDrawing(id)
      if(created!==id||!actual||(overlay.paneId&&actual.paneId!==overlay.paneId))throw Error(i18n('drawing_render_failure',locale()))
      projectedDrawingObjects.set(id,actual)
      projectedDrawingDefinitions.set(id,{key,presentation})
      if(temporaryPan())temporaryPanLocks.set(id,{overlay:actual,lock:overlay.lock||!!state?.preventDragging})
      actual.needDefaultPointFigure=false;actual.needDefaultYAxisFigure=false;actual.needDefaultXAxisFigure=false
      for(const figure of ['createPointFigures','createYAxisFigures','createXAxisFigures'] as const){
        const draw=actual[figure];if(!draw)continue
        actual[figure]=args=>{
          const document=drawingPreviews.get(id)??value
          let projected:Overlay['points'],coordinates:Array<{x:number;y:number}>
          try{
            // Native timestamp lookup rounds between bars; only exact, unchanged inputs are equivalent.
            const bars=widget!.getDataList()
            const nativeCoordinates=!drawingPreviews.has(id)&&!document.yAxisId&&!isVolumeDrawing(document.overlay.name)&&document.anchors?.length===args.overlay.points.length&&document.anchors?.every((anchor,index)=>{
              if(anchor.kind!=='market'||anchor.interpolation)return false
              const point=args.overlay.points[index],dataIndex=marketIndex(anchor.timestamp,bars)
              return Number.isInteger(dataIndex)&&point.timestamp===anchor.timestamp&&point.value===anchor.value&&(point.dataIndex===undefined||point.dataIndex===dataIndex)
            })
            if(nativeCoordinates){
              projected=args.overlay.points;coordinates=args.coordinates
              if(coordinates.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)))throw Error('绘图坐标不适用于当前价格轴或历史范围')
            }else{
              projected=projectDrawingPoints(document)
              const size=drawingSize(document)
              coordinates=projected.map((point,index)=>{const anchor=document.anchors?.[index];return anchor?.kind==='viewport'?{x:anchor.x*size.width,y:anchor.y*size.height}:drawingToPixel(point,document)})
            }
          }catch(error){
            // The engine can render between replacing its bars and the loader's commit.
            // Keep canonical anchors intact; the confirmed projection pass records the error.
            if(figure==='createPointFigures')drawingFigures.delete(actual)
            return figure==='createPointFigures'?[{type:'rectText',ignoreEvent:true,attrs:{x:8,y:20,text:error instanceof Error?error.message:String(error),baseline:'top'},styles:{color:'#ef5350'}}]:[]
          }
          const axis=widget?.getYAxes({paneId:document.overlay.paneId??'candle_pane'}).find(axis=>!document.yAxisId||axis.id===document.yAxisId)
          const figures=draw({...args,coordinates,yAxis:axis??args.yAxis,overlay:Object.assign(Object.create(args.overlay),{points:projected})})
          if(figure==='createPointFigures')drawingFigures.set(actual,Array.isArray(figures)?figures:[figures])
          return figures
        }
      }
      ownedDrawingIds.add(id);completedDrawingIds.add(id)
      if(selected)markSelectedOverlay(actual,false)
      return value
    }finally{applyingDrawing=false}
  }
  const drawingHistory=new DrawingHistory({
    locale,
    validate:validateDrawingTarget,validateTransfer:values=>validateProjectionRestore(values),
    context:()=>({symbol:symbol(),period:period()}),apply:applyDrawing,commit:change=>props.commitDrawing?props.commitDrawing(change):Promise.resolve({status:'rejected',message:i18n('drawing_message_3',locale())}),
    onChange:state=>{if(disposed)return;setDrawingState(state);if(drawingPresentationFrame===undefined){
      const present=()=>{
        if(disposed){drawingPresentationFrame=undefined;return}
        if(drawingHistory.isYieldingLocalWork()){drawingPresentationFrame=requestAnimationFrame(present);return}
        drawingPresentationFrame=undefined;drawingController?.refresh()
        const size=widget?.getSize()
        const node=widgetRef as HTMLDivElement|undefined
        if(node&&size&&(node.clientWidth!==Math.round(size.width)||node.clientHeight!==Math.round(size.height)))widget?.resize()
      }
      drawingPresentationFrame=requestAnimationFrame(present)
    }},
    onConfirmed:change=>{if(change.after&&change.source!=='history')drawingController?.rememberConfirmed(change.after);const event={overlay:(change.after??change.before)!.overlay,source:change.source};if(change.kind==='create')props.onOverlayCreate?.(event);else if(change.kind==='update')props.onOverlayUpdate?.(event);else props.onOverlayDelete?.(event)},
  })
  const sharedProjectionObjects=new Map<string,Overlay>()
  drawingCoordinator=new DrawingCoordinator(drawingHistory,{saveAs:props.createDrawingDocumentId&&props.drawingHostSessions?async(session,identity)=>{const id=await props.createDrawingDocumentId!(identity);if(!id)throw Error('宿主没有提供另存文档 ID');const target=await props.drawingHostSessions!.bind({identity,documentId:id});if(target.getState().revision!==null||target.history.getDrawingIds().length)throw Error('另存目标已存在，当前草稿已保留');return target}:undefined,owns:id=>sharedProjectionObjects.get(id)===widget?.getOverlays({id})[0]&&sharedProjectionObjects.has(id),project:(id,value)=>{if(!value&&sharedProjectionObjects.get(id)!==widget?.getOverlays({id})[0]){sharedProjectionObjects.delete(id);return;}applyDrawing(id,value);if(value){const actual=widget?.getOverlays({id})[0];if(actual)sharedProjectionObjects.set(id,actual)}else sharedProjectionObjects.delete(id)},validate:value=>{validateDrawingTarget(value);validateDrawingRestore([value],{editable,existing:widget?.getOverlays().map(snapshotOverlay)??[],ownedIds:new Set([...drawingHistory.getDrawingIds(),...(widget?.getOverlays().filter(object=>nativeDrawingPreviews.has(object)).map(object=>object.id)??[]),...[...sharedProjectionObjects].filter(([id,object])=>object===widget?.getOverlays({id})[0]).map(([id])=>id)])})},validateBatch:values=>validateProjectionRestore(values),changed:()=>{if(disposed)return;const state=drawingCoordinator?.state(drawingController?.getState().selectedIds??[]);if(state){setDrawingState(state)}drawingController?.refresh()}})
  let workspaceSessions=props.drawingWorkspaceSessions,shareResolver=props.resolveDrawingShareKey,sharingEpoch=0
  let boundShareKey:string|undefined,boundWorkspace:DrawingSessionRegistry|undefined,boundHost:DrawingSessionRegistry|undefined
  let bindingTask:Promise<boolean>|undefined,bindingKey:string|undefined,bindingEpoch=-1,bindingWorkspace:DrawingSessionRegistry|undefined,bindingHost:DrawingSessionRegistry|undefined
  let waitingWorkspaceBinding:{resolve:()=>void;reject:(error:unknown)=>void}|undefined
  let bindingAbort:AbortController|undefined
  const cancelSharedBinding=()=>{++sharingEpoch;bindingAbort?.abort(new DOMException('共享绑定已取消','AbortError'));bindingAbort=undefined;bindingTask=undefined;bindingKey=undefined;boundShareKey=undefined}
  const awaitSharedRead=<T,>(task:Promise<T>,signal:AbortSignal):Promise<T>=>new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason)
    if(signal.aborted){reject(signal.reason);return}
    signal.addEventListener('abort',abort,{once:true})
    task.then(value=>{signal.removeEventListener('abort',abort);resolve(value)},error=>{signal.removeEventListener('abort',abort);reject(error)})
  })
  const settleWorkspaceBinding=(error?:unknown)=>{const waiting=waitingWorkspaceBinding;waitingWorkspaceBinding=undefined;if(error)waiting?.reject(error);else waiting?.resolve()}
  const bindSharedDrawings=async():Promise<boolean>=>{
    const context=analysis.getContext()
    if(!context||!shareResolver){cancelSharedBinding();drawingCoordinator.detach();return !shareResolver}
    const resolution=shareResolver(context)
    if('reason' in resolution){cancelSharedBinding();drawingCoordinator.detach(resolution.reason);drawingController?.refresh();return true}
    const key=JSON.stringify([drawingShareKey(resolution.identity),resolution.documentId]),workspaceRegistry=workspaceSessions,hostRegistry=props.drawingHostSessions
    if(boundShareKey===key&&boundWorkspace===workspaceRegistry&&boundHost===hostRegistry)return true
    if(bindingTask&&bindingEpoch===sharingEpoch&&bindingKey===key&&bindingWorkspace===workspaceRegistry&&bindingHost===hostRegistry)return bindingTask
    cancelSharedBinding();const epoch=sharingEpoch,controller=new AbortController();bindingAbort=controller;bindingEpoch=epoch;drawingCoordinator.detach()
    bindingKey=key;bindingWorkspace=workspaceRegistry;bindingHost=hostRegistry
    const task=(async()=>{
      try{
        const [workspace,host]=await awaitSharedRead(Promise.all([workspaceRegistry?.bind(resolution),hostRegistry?.bind(resolution)]),controller.signal)
        if(disposed||epoch!==sharingEpoch)throw new DOMException('共享上下文已改变，旧绑定已取消','AbortError')
        drawingCoordinator.bind(workspace,host);boundShareKey=key;boundWorkspace=workspaceRegistry;boundHost=hostRegistry
        return true
      }catch(error){if(!disposed&&epoch===sharingEpoch){boundShareKey=undefined;drawingCoordinator.reason=error instanceof Error?error.message:String(error);drawingController?.refresh()}throw error}
    })()
    bindingTask=task
    try{return await task}finally{if(bindingTask===task){bindingTask=undefined;bindingKey=undefined}}
  }
  const refreshSharedDrawings=()=>{const waiting=waitingWorkspaceBinding;void bindSharedDrawings().then(ready=>{if(ready&&waitingWorkspaceBinding===waiting)settleWorkspaceBinding()},error=>{if(waitingWorkspaceBinding===waiting)settleWorkspaceBinding(error)})}

  const commitDrawing=(change:Pick<DrawingChange,'kind'|'logicalId'|'after'|'source'>)=>{
    if(!widget)return Promise.reject(Error(i18n('chart_not_ready',locale())))
    try{if(change.after)validateDrawingTarget(change.after)}catch(error){return Promise.reject(error)}
    const overlay=change.after?.overlay??drawingHistory.getDrawing(change.logicalId)?.overlay
    if(overlay&&!editable(overlay))return Promise.reject(Error(i18n('drawing_protected',locale())))
    const history=drawingCoordinator.history(change.kind==='create'?[]:[change.logicalId],true)
    const after=change.after&&history!==drawingHistory?drawingCoordinator.prepare({...change.after,presentation:{...change.after.presentation,scope:change.kind==='create'?drawingCoordinator.getScope():drawingCoordinator.getDrawing(change.logicalId)?.presentation?.scope??'chart'}}):change.after
    if(after&&history!==drawingHistory)drawingCoordinator.validate(after)
    drawingController?.rememberHistory(history)
    return history.submit(change.kind,change.logicalId,after,change.source)
  }
  const [snapHint,setSnapHint]=createSignal('')
  let drawingModifiers={shift:false,control:false,alt:false}
  const drawingPointerDown=(event:PointerEvent)=>{drawingModifiers={shift:event.shiftKey,control:event.ctrlKey||event.metaKey,alt:event.altKey};if(!(event.target as HTMLElement).closest?.('button,input,textarea,select,[contenteditable]'))(widgetRef as HTMLDivElement|undefined)?.focus({preventScroll:true})}
  const drawingModifierKey=(event:KeyboardEvent)=>{drawingModifiers={shift:event.shiftKey,control:event.ctrlKey||event.metaKey,alt:event.altKey}}
  let temporaryPanGesture:{pointerId:number;x:number}|undefined
  const temporaryPanPointerStart=(event:PointerEvent)=>{if(!temporaryPan()||event.button!==0||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))return;temporaryPanGesture={pointerId:event.pointerId,x:event.clientX};(widgetRef as HTMLDivElement|undefined)?.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation()}
  const temporaryPanLocks=new Map<string,{overlay:Overlay;lock:boolean}>()
  const lockTemporaryPan=()=>{for(const overlay of widget?.getOverlays()??[]){if(!temporaryPanLocks.has(overlay.id))temporaryPanLocks.set(overlay.id,{overlay,lock:overlay.lock});widget?.overrideOverlay({id:overlay.id,lock:true})}}
  const beginTemporaryPan=()=>{if(temporaryPan())return;if(handleDrag)endDrawingHandle(handleDrag.handle,true);if(nativeDrawingDrag){const ids=nativeDrawingDrag.objects.map(value=>value.logicalId);nativeDrawingDrag=undefined;restoreCurrentDrawings(ids)}setTemporaryPan(true);lockTemporaryPan()}
  let spaceDrawing:{overlay:OverlayLifecycleEvent['overlay'];points:Overlay['points'];step:number}|undefined
  const restoreSpaceDrawing=()=>{const saved=spaceDrawing;spaceDrawing=undefined;temporaryPanGesture=undefined;setTemporaryPan(false);for(const [id,before] of temporaryPanLocks){const actual=widget?.getOverlays({id})[0];if(actual===before.overlay){const current=drawingCoordinator.getDrawing(id);widget?.overrideOverlay({id,lock:current?current.overlay.lock||drawingController.getViewState().preventDragging:before.lock})}}temporaryPanLocks.clear();if(!saved||disposed||!widget)return
    if(widget.getOverlays({id:saved.overlay.id}).length){ownedDrawingIds.delete(saved.overlay.id);completedDrawingIds.delete(saved.overlay.id);drawingController.setStep(0);setSnapHint('原绘图 ID 已被宿主占用，未确认预览已取消');return}
    applyingDrawing=true
    try{const {points,...base}=saved.overlay;widget.createOverlay({...base,...drawingHandlers()});const overlay=widget.getOverlays({id:base.id})[0];if(overlay){nativeDrawingPreviews.add(overlay);overlay.points=saved.points;overlay.currentStep=saved.step;activeDrawingId=overlay.id;ownedDrawingIds.add(overlay.id)}}finally{applyingDrawing=false}
  }
  const drawingKeyUp=(event:KeyboardEvent)=>{drawingModifierKey(event);if(event.code==='Space')restoreSpaceDrawing()}
  const drawingInputBlur=()=>{drawingModifiers={shift:false,control:false,alt:false};setSnapHint('');restoreSpaceDrawing();cancelSelectionBox();clearDrawingHold()}
  const showDrawingMenu=(overlay:Overlay|undefined,x:number,y:number)=>{
    if(overlay?.id===activeDrawingId&&overlay.currentStep>0){overlay.points=overlay.points.slice(0,Math.max(0,overlay.currentStep-1));widget?.resize();setSnapHint(locale()==='en-US'?'Unconfirmed point cancelled':'已取消当前未确认落点')}
    else if(overlay)markSelectedOverlay(overlay)
    const pane=widget?.getDom(overlay?.paneId??'candle_pane','main')?.getBoundingClientRect(),root=(widgetRef as HTMLDivElement|undefined)?.closest('.klinecharts-pro-content')?.getBoundingClientRect()
    if(root&&pane)setDrawingMenu({x:Math.max(0,Math.min(root.width-180,pane.left-root.left+x)),y:Math.max(0,Math.min(root.height-280,pane.top-root.top+y))})
  }
  let boxDrag:{x:number;y:number;paneId:string;pointerId:number}|undefined,holdTimer:ReturnType<typeof setTimeout>|undefined,holdPoint:{x:number;y:number}|undefined
  const clearDrawingHold=()=>{if(holdTimer!==undefined)clearTimeout(holdTimer);holdTimer=undefined;holdPoint=undefined}
  const drawingPaneAt=(x:number,y:number)=>{
    const panes=new Set(['candle_pane',...drawingCoordinator.getDrawings().map(value=>value.overlay.paneId??'candle_pane'),...(widget?.getIndicators()??[]).map(indicator=>indicator.paneId)])
    for(const paneId of panes){const rect=widget?.getDom(paneId,'main')?.getBoundingClientRect();if(rect&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)return {paneId,rect}}
  }
  const drawingBounds=(value:DrawingSnapshot)=>{const points=projectDrawingPoints(value),size=drawingSize(value),pixels=points.map((point,index)=>{const anchor=value.anchors?.[index];return anchor?.kind==='viewport'?{x:anchor.x*size.width,y:anchor.y*size.height}:drawingToPixel(point,value)});return {left:Math.min(...pixels.map(p=>p.x)),right:Math.max(...pixels.map(p=>p.x)),top:Math.min(...pixels.map(p=>p.y)),bottom:Math.max(...pixels.map(p=>p.y))}}
  const drawingIsVisible=(value:DrawingSnapshot)=>value.overlay.visible&&!drawingController.getViewState().hidden&&intervalVisible(value.presentation?.intervals,period())&&!!widget?.getOverlays({id:value.logicalId})[0]?.visible
  const drawingNear=(paneId:string,x:number,y:number,event:'onPressedMoveStart'|'onRightClick'='onPressedMoveStart')=>{
    for(const overlay of (widget?.getOverlays({paneId})??[]).slice().reverse()){
      const value=drawingCoordinator.getDrawing(overlay.id)
      if(value&&drawingIsVisible(value)&&drawingFigureHit({x,y},drawingFigures.get(overlay)??[],widget!.getStyles().overlay,overlay.styles,event))return value
    }
  }
  const cancelSelectionBox=()=>{boxDrag=undefined;setSelectionBox(undefined)}
  const drawingPointerStart=(event:PointerEvent)=>{
    drawingPointerDown(event);setDrawingMenu(undefined);if(temporaryPan()){lockTemporaryPan();return}
    const pane=drawingPaneAt(event.clientX,event.clientY);if(!pane)return
    const x=event.clientX-pane.rect.left,y=event.clientY-pane.rect.top,near=drawingNear(pane.paneId,x,y)
    if(event.shiftKey&&event.button===0&&!activeDrawingId&&!near){boxDrag={x,y,paneId:pane.paneId,pointerId:event.pointerId};(widgetRef as HTMLDivElement|undefined)?.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation()}
    if(event.pointerType==='touch'&&!activeDrawingId){clearDrawingHold();holdPoint={x:event.clientX,y:event.clientY};holdTimer=setTimeout(()=>{holdTimer=undefined;showDrawingMenu(near?widget?.getOverlays({id:near.logicalId})[0]:undefined,x,y)},550)}
  }
  const drawingPointerMove=(event:PointerEvent)=>{
    if(temporaryPanGesture&&temporaryPanGesture.pointerId===event.pointerId){widget?.scrollByDistance(event.clientX-temporaryPanGesture.x);temporaryPanGesture.x=event.clientX;event.preventDefault();event.stopPropagation();refreshDrawingHandles();return}
    if(holdPoint&&Math.hypot(event.clientX-holdPoint.x,event.clientY-holdPoint.y)>8)clearDrawingHold()
    const drag=boxDrag;if(!drag)return
    const pane=widget?.getDom(drag.paneId,'main')?.getBoundingClientRect(),root=(widgetRef as HTMLDivElement|undefined)?.closest('.klinecharts-pro-content')?.getBoundingClientRect();if(!pane||!root)return
    const x=event.clientX-pane.left,y=event.clientY-pane.top;setSelectionBox({x:pane.left-root.left+Math.min(x,drag.x),y:pane.top-root.top+Math.min(y,drag.y),width:Math.abs(x-drag.x),height:Math.abs(y-drag.y)});event.preventDefault();event.stopPropagation()
  }
  const drawingPointerEnd=(event:PointerEvent)=>{
    if(temporaryPanGesture?.pointerId===event.pointerId){temporaryPanGesture=undefined;if((widgetRef as HTMLDivElement|undefined)?.hasPointerCapture(event.pointerId))(widgetRef as HTMLDivElement|undefined)?.releasePointerCapture(event.pointerId);event.preventDefault();event.stopPropagation();return}
    clearDrawingHold();const drag=boxDrag,box=selectionBox();cancelSelectionBox()
    if(event.type==='pointercancel'){if(activeDrawingId)void drawingController.execute({type:'cancel'});if(nativeDrawingDrag){const ids=nativeDrawingDrag.objects.map(value=>value.logicalId);nativeDrawingDrag=undefined;restoreCurrentDrawings(ids)}return}
    if(!drag||!box)return
    const pane=widget?.getDom(drag.paneId,'main')?.getBoundingClientRect(),root=(widgetRef as HTMLDivElement|undefined)?.closest('.klinecharts-pro-content')?.getBoundingClientRect();if(pane&&root){const left=box.x+root.left-pane.left,top=box.y+root.top-pane.top,values=drawingCoordinator.getDrawings().filter(value=>{if((value.overlay.paneId??'candle_pane')!==drag.paneId||!drawingIsVisible(value))return false;try{const b=drawingBounds(value);return b.right>=left&&b.left<=left+box.width&&b.bottom>=top&&b.top<=top+box.height}catch{return false}});void drawingController.execute({type:'select',ids:values.map(value=>value.logicalId)});setSnapHint(`${locale()==='en-US'?'Selected':'已选择'} ${values.length}${values.some(value=>value.overlay.lock)?locale()==='en-US'?' · Includes locked drawings':' · 含锁定对象，请先解锁或仅选择可操作对象':''}`)}
    event.preventDefault();event.stopPropagation()
  }
  const drawingContext=(event:MouseEvent)=>{event.preventDefault();const pane=drawingPaneAt(event.clientX,event.clientY);if(!pane)return;const x=event.clientX-pane.rect.left,y=event.clientY-pane.rect.top,near=drawingNear(pane.paneId,x,y,'onRightClick');showDrawingMenu(activeDrawingId?widget?.getOverlays({id:activeDrawingId})[0]:near?widget?.getOverlays({id:near.logicalId})[0]:undefined,x,y);event.stopPropagation()}

  let activeDrawingId: string | null = null
  const cancelDrawing = () => {
    setDrawingMenu(undefined)
    if(spaceDrawing){spaceDrawing=undefined}
    if(nativeDrawingDrag){const ids=nativeDrawingDrag.objects.map(value=>value.logicalId);nativeDrawingDrag=undefined;restoreCurrentDrawings(ids)}
    if(handleDrag)endDrawingHandle(handleDrag.handle,true)
    if (activeDrawingId) widget?.removeOverlay({ id: activeDrawingId })
    activeDrawingId = null;setSnapHint('')
    setSelectedOverlay(null);setTextEditor(null)
  }
  const deleteSelectedDrawing = () => {const ids=drawingController.getSelectedIds();if(ids.length)void drawingController.execute({type:'delete',ids})}
  const drawingPointInput=(overlay:Overlay,event:{x?:number;y?:number},index:number,phase:'drawing'|'edit'='drawing')=>{
    if(!widget||index<0||!Number.isFinite(event.x)||!Number.isFinite(event.y))return
    const current=drawingCoordinator.getDrawing(overlay.id),snapshot:DrawingSnapshot=current??{logicalId:overlay.id,owner:'local',overlay:snapshotOverlay(overlay),yAxisId:widget.getYAxes({paneId:overlay.paneId})[0]?.id}
    let pixel={x:event.x!,y:event.y!}
    if(drawingModifiers.shift&&index>0&&overlay.points[0])pixel=constrainedPoint(drawingToPixel(overlay.points[0],snapshot),pixel,['rect','ellipse'].includes(overlay.name))
    const converted=drawingFromPixel(pixel,snapshot)
    if(isVolumeDrawing(overlay.name)){
      if(overlay.paneId!=='candle_pane')throw Error('量价工具只能在主价格窗格绘制')
      const bars=widget.getDataList(),barIndex=Math.round(converted.dataIndex??marketIndex(converted.timestamp!,bars)),bar=bars[barIndex]
      if(!bar)throw Error('请在已加载的真实历史上选择时间')
      overlay.points[index]={timestamp:bar.timestamp,dataIndex:barIndex,value:phase==='edit'?overlay.points[index]?.value??bar.close:bar.close}
      setSnapHint('当前周期 OHLCV 估算 · 仅调整时间');return
    }
    let point:Overlay['points'][number]=phase==='edit'||overlay.drawingMode==='continuous'||drawingModifiers.shift?converted:{...overlay.points[index],value:converted.value}
    const bars=widget.getDataList(),barIndex=point.dataIndex===undefined?bars.findIndex(bar=>bar.timestamp===point.timestamp):Math.round(point.dataIndex),bar=bars[barIndex]
    const mode=drawingController.getViewState().magnet,effective=drawingModifiers.control?mode==='normal'?'weak_magnet':'normal':mode
    const candidates:DrawingSnapCandidate[]=[],axes=widget.getYAxes({paneId:overlay.paneId}),axisId=snapshot.yAxisId??axes[0]?.id
    if(bar&&effective!=='normal'){
      if(overlay.paneId==='candle_pane'&&axisId===axes[0]?.id)for(const key of ['open','high','low','close'] as const)candidates.push({value:bar[key],label:(locale()==='en-US'?{open:'Open',high:'High',low:'Low',close:'Close'}:{open:'开盘',high:'最高',low:'最低',close:'收盘'})[key],source:'ohlc'})
      for(const indicator of widget.getIndicators({paneId:overlay.paneId}))if(indicator.visible&&(indicator.yAxisId??axes[0]?.id)===axisId){
        const row=indicator.result[barIndex] as Record<string,unknown>|undefined
        for(const figure of indicator.figures)if(['line','bar','circle'].includes(figure.type??'')&&row){const value=row[figure.key];if(typeof value==='number'&&Number.isFinite(value))candidates.push({value,label:`${indicator.shortName||indicator.name} · ${figure.title||figure.key}`,source:'indicator'})}
      }
    }
    const snapped=snappedPoint(point,pixel.y,candidates,effective,value=>drawingToPixel({...point,value},snapshot).y)
    point=snapped.point
    if(snapped.candidate&&bar){point={...point,timestamp:bar.timestamp,dataIndex:barIndex};setSnapHint(`${locale()==='en-US'?'Snap':'吸附'}: ${snapped.candidate.label}`)}
    else setSnapHint(!bar&&point.dataIndex!==undefined&&point.dataIndex>bars.length-1?`${locale()==='en-US'?'Following bars':'后续根数'}: ${(point.dataIndex-(bars.length-1)).toFixed(1)}`:'')
    overlay.points[index]=point
    const perform=phase==='edit'?overlay.performEventPressedMove:overlay.performEventMoveForDrawing
    perform?.call(overlay,{currentStep:overlay.currentStep,mode:overlay.mode,points:overlay.points,performPointIndex:index,performPoint:point})
  }
  function drawingHandlers():Partial<OverlayCreate>{return {
      onDrawing:event=>{try{drawingPointInput(event.overlay,event,event.overlay.drawingMode==='continuous'?event.overlay.points.length-1:event.overlay.currentStep-1)}catch(error){setSnapHint(error instanceof Error?error.message:String(error))}drawingController?.setStep(event.overlay.currentStep)},
      onClick:event=>{if(!applyingDrawing&&!drawingController.getSelectedIds().includes(event.overlay.id))markSelectedOverlay(event.overlay)},
      onDoubleClick:event=>{if(isText(event.overlay.name))promptTextOverlay(event.overlay,false)},
      onRightClick:event=>{event.preventDefault?.();showDrawingMenu(event.overlay,event.x??0,event.y??0)},
      onDrawEnd: (event) => {
        const descriptor=drawingCatalog.find(tool=>tool.overlayName===event.overlay.name)
        if(descriptor?.mode==='variable'){event.overlay.points=event.overlay.points.filter((point,index,points)=>index===0||point.timestamp!==points[index-1].timestamp||point.dataIndex!==points[index-1].dataIndex||point.value!==points[index-1].value);if(event.overlay.points.length<descriptor.minPoints){applyingDrawing=true;try{widget?.removeOverlay({id:event.overlay.id})}finally{applyingDrawing=false};ownedDrawingIds.delete(event.overlay.id);completedDrawingIds.delete(event.overlay.id);activeDrawingId=null;setSnapHint(`请至少确认 ${descriptor.minPoints} 个不同落点`);return true}}
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
      onPressedMoveStart:event=>{
        if(temporaryPan())return
        const before=drawingCoordinator.getDrawing(event.overlay.id);if(!before)return
        const match=event.figure?.key?.match(/point_(\d+)$/)
        const ids=drawingController.getSelectedIds(),objects=(!match&&ids.includes(before.logicalId)?ids:[before.logicalId]).map(id=>drawingCoordinator.getDrawing(id)!).filter(Boolean)
        nativeDrawingDrag={id:event.overlay.id,before,objects,x:event.x??0,y:event.y??0,pointIndex:match?Number(match[1]):null,clone:drawingModifiers.alt,dx:0,dy:0}
        if(objects.some(value=>value.overlay.lock)||new Set(objects.map(value=>value.overlay.paneId)).size>1)nativeDrawingDrag.invalid='请先解锁绘图，并仅选择同一窗格中的对象'
      },
      onPressedMoving:event=>{
        const drag=nativeDrawingDrag;if(!drag||drag.id!==event.overlay.id||!widget)return
        try{
          if(drag.invalid)throw Error(drag.invalid)
          if(temporaryPan()||drag.objects.some(before=>!sameDrawing(drawingCoordinator.getDrawing(before.logicalId),before)))throw Error('绘图已更新或处于临时平移，本次拖动已取消')
          let preview:DrawingSnapshot
          if(drag.pointIndex!==null){preview=controlPointProposal(drag.before,drag.pointIndex,{x:event.x??0,y:event.y??0});widget.overrideOverlay({id:drag.id,points:preview.overlay.points})}
          else{
            const delta=drawingModifiers.shift?constrainedPoint({x:0,y:0},{x:(event.x??drag.x)-drag.x,y:(event.y??drag.y)-drag.y}):{x:(event.x??drag.x)-drag.x,y:(event.y??drag.y)-drag.y}
            drag.dx=delta.x;drag.dy=delta.y
            for(const before of drag.objects){const next=translateDrawing(before,delta.x,delta.y);drawingPreviews.set(before.logicalId,next);widget.overrideOverlay({id:before.logicalId,points:next.overlay.points})}
            preview=drawingPreviews.get(drag.id)!
          }
          drawingPreviews.set(drag.id,preview);refreshDrawingHandles()
        }catch(error){drag.invalid=error instanceof Error?error.message:String(error);setSnapHint(drag.invalid)}
      },
      onPressedMoveEnd: (event) => {
        const drag=nativeDrawingDrag;nativeDrawingDrag=undefined
        if(!drag)return true
        const preview=drawingPreviews.get(drag.id)
        if(drag.invalid||temporaryPan()||drag.objects.some(before=>!sameDrawing(drawingCoordinator.getDrawing(before.logicalId),before))){restoreCurrentDrawings(drag.objects.map(value=>value.logicalId));return true}
        if(drag.pointIndex!==null){if(preview)void drawingController.commitPreview({type:'update',ids:[drag.id],patch:{anchors:preview.anchors}},drag.objects).then(result=>{if(result.status==='rejected')restoreCurrentDrawings(drag.objects.map(value=>value.logicalId))})}
        else if(drag.dx||drag.dy){if(drag.clone)restoreCurrentDrawings(drag.objects.map(value=>value.logicalId));void drawingController.commitPreview({type:'move',ids:drag.objects.map(d=>d.logicalId),dx:drag.dx,dy:drag.dy,clone:drag.clone},drag.objects).then(result=>{if(result.status!=='completed')for(const value of drag.objects){const current=drawingCoordinator.getDrawing(value.logicalId);if(current)applyDrawing(current.logicalId,current)}})}else if(preview)restoreCurrentDrawings(drag.objects.map(value=>value.logicalId))
        return true
      },
      onSelected: (event) => {
        if(applyingDrawing)return true
        // The engine can emit selection after onDrawEnd removed a rejected preview.
        if(!widget?.getOverlays({id:event.overlay.id}).length){setSelectedOverlay(null);props.onDrawingSelect?.(null);return true}
        markSelectedOverlay(event.overlay)
        return true
      },
      onDeselected: () => {
        if(applyingDrawing)return true
        if(drawingModifiers.control||drawingModifiers.shift||nativeDrawingDrag)return true
        void drawingController.execute({type:'select',ids:[]})
        setSelectedOverlay(null)
        return true
      },
      onRemoved: (event) => {
        projectionInventory?.invalidate()
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
    if(overlay.id&&widget?.getOverlays({id:overlay.id}).length){setSnapHint('绘图 ID 已被占用，不能覆盖现有对象');return}
    const id = widget?.createOverlay({...overlay,id:overlay.id??'drawing_'+createOpaqueId(),...drawingHandlers()})
    if (typeof id === 'string') {
      ownedDrawingIds.add(id)
      const drawing = widget?.getOverlays({id})[0]
      if (drawing) nativeDrawingPreviews.add(drawing)
      if (drawing && drawing.currentStep !== -1) activeDrawingId = id
    }
  }

  const finishDrawing=async():Promise<import('./drawing/types').DrawingCommandResult>=>{
    const overlay=activeDrawingId?widget?.getOverlays({id:activeDrawingId})[0]:undefined,tool=drawingCatalog.find(tool=>tool.overlayName===overlay?.name)
    if(!overlay||!tool||tool.mode!=='variable')return {status:'rejected',items:[],message:'当前没有待完成的可变点绘图'}
    const points=overlay.points.slice(0,Math.max(0,overlay.currentStep-1))
    if(points.length<tool.minPoints)return {status:'rejected',items:[],message:`请至少确认 ${tool.minPoints} 个点后完成`}
    const id=overlay.id,value={...snapshotOverlay(overlay),points},snapshot:DrawingSnapshot={logicalId:id,owner:props.drawingOwner?.(value)??'local',overlay:value,anchors:anchorsFromPoints(points,widget!.getDataList(),period(),'interaction'),parameters:drawingParameters(overlay.extendData)}
    applyingDrawing=true
    try{widget!.removeOverlay({id});widget!.createOverlay({...value,lock:true,...drawingHandlers()});const preview=widget!.getOverlays({id})[0];if(preview)nativeDrawingPreviews.add(preview);activeDrawingId=null}finally{applyingDrawing=false}
    const finishingPreview=widget!.getOverlays({id})[0]
    let result:import('./drawing/types').DrawingCommitResult
    try{result=await commitDrawing({kind:'create',logicalId:id,after:snapshot,source:'drawing-bar'})}catch(error){if(widget!.getOverlays({id})[0]===finishingPreview){applyingDrawing=true;try{widget!.removeOverlay({id});ownedDrawingIds.delete(id);completedDrawingIds.delete(id)}finally{applyingDrawing=false}}throw error}
    if(result.status==='confirmed'){drawingController.completed(tool.toolId);void drawingController.execute({type:'select',ids:[id]})}
    return {status:result.status==='confirmed'?'completed':result.status,items:[{logicalId:id,status:result.status,...(result.status==='confirmed'?{}:{message:result.message})}]}
  }
  const drawingPreferences=new DrawingPreferencesManager({catalog:drawingCatalog,initial:props.drawingPreferences,store:props.drawingPreferencesStore,scope:props.drawingPreferencesScope,changed:()=>drawingController?.refresh()})
  drawingController=new DrawingController({analytics:drawings=>drawingAnalytics.summaries(drawings),history:drawingHistory,coordinator:drawingCoordinator,finish:finishDrawing,translate:translateDrawing,translateNudge:nudgeDrawing,translatePoint:(before,index,dx,dy)=>{const point=projectDrawingPoints(before)[index];if(!point)throw Error('控制点不存在');const pixel=drawingToPixel(point,before);if(isVolumeDrawing(before.overlay.name)){if(!dx)return structuredClone(before);const bars=widget!.getDataList(),target=Math.round(marketIndex(point.timestamp!,bars))+dx,bar=bars[target];if(!bar)throw Error('量价控制点只能移动到已加载历史');return controlPointProposal(before,index,drawingToPixel({timestamp:bar.timestamp,dataIndex:target,value:point.value},before))}return controlPointProposal(before,index,{x:pixel.x+dx,y:pixel.y+dy})},preferences:drawingPreferences,catalog:drawingCatalog,
    editable:value=>editable(value.overlay),validate:value=>drawingCoordinator.validate(value),validateBatch:values=>drawingCoordinator.validateBatch(values),
    create:tool=>{const preferences=drawingPreferences.getState().value,preset=preferences.lastStyles?.[tool.toolId]??preferences.defaults[tool.toolId];createDrawing({name:tool.overlayName,groupId:'drawing_tools',styles:preset?.styles,extendData:preset?.parameters?{drawingParameters:preset.parameters}:undefined})},cancel:cancelDrawing,
    owner:value=>props.drawingOwner?.(value.overlay)??'local',
    coordinates:(value,patch)=>{if(!widget)throw Error('图表尚未就绪');if(patch.anchors)return {...value,overlay:{...value.overlay,points:projectDrawingPoints(value)}};return {...value,anchors:anchorsFromPoints(value.overlay.points,widget.getDataList(),period(),'interaction')}},
    project:()=>{drawingHistory.reproject();drawingCoordinator.project()},
    changed:state=>{setWorkbenchState(state);setDrawingState(state.history);props.onDrawingStateChange?.(state);props.onDrawingHistoryChange?.(state.history);queueMicrotask(refreshDrawingHandles)},
    selected:ids=>{props.onDrawingSelect?.(ids.length===1?ids[0]:null)}
  })

  drawingController.refresh()
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
    bindDrawingWorkspace:async(registry,resolve)=>{
      settleWorkspaceBinding(new DOMException('共享绑定请求已被替换','AbortError'))
      workspaceSessions=registry;if(resolve)shareResolver=resolve
      if(!analysis.getContext()&&shareResolver){
        const error=dataState()?.error;if(error)throw Error(error)
        await new Promise<void>((resolve,reject)=>{waitingWorkspaceBinding={resolve,reject}})
      }else await bindSharedDrawings()
    },
    getDrawings:()=>drawingCoordinator.getDrawings(),
    getDrawingHistoryState:()=>drawingController.getHistoryState(),
    restoreDrawings:(owner,values)=>{validateRestore(owner,values);drawingHistory.reconcile(owner,values)},
    resetDrawingHistory:()=>drawingHistory.reset(),
    undoDrawing:()=>drawingController.travel('undo'),
    redoDrawing:()=>drawingController.travel('redo'),
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
    setSymbol: (s: SymbolInfo) => { if (!replayEngine) {assertDrawingTransition();++indicatorGeneration;setSymbol(s)} },
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

  // Backspace/Delete 删除选中的绘图
  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return
    if(e.isComposing||e.getModifierState?.('AltGraph')||e.defaultPrevented)return
    if(target.closest('button,a,[role=button]')&&!target.closest('.tc-drawing-handle'))return
    if(e.code==='Space'){beginTemporaryPan();if(activeDrawingId&&!spaceDrawing){const overlay=widget?.getOverlays({id:activeDrawingId})[0];if(overlay){spaceDrawing={overlay:{...snapshotOverlay(overlay),lock:temporaryPanLocks.get(overlay.id)?.lock??overlay.lock},points:structuredClone(overlay.points),step:overlay.currentStep};applyingDrawing=true;try{widget?.removeOverlay({id:activeDrawingId})}finally{applyingDrawing=false};activeDrawingId=null}}e.preventDefault();e.stopPropagation();return}
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if(e.key==='Enter'&&activeDrawingId){void drawingController.execute({type:'finish'});e.preventDefault();e.stopPropagation();return}
    if(temporaryPan()){e.preventDefault();return}
    const ids=drawingController.getSelectedIds(),directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}
    if(ids.length&&directions[e.key]){const [x,y]=directions[e.key],distance=e.shiftKey?10:1;if(x||ids.some(id=>!isVolumeDrawing(drawingCoordinator.getDrawing(id)?.overlay.name??'')))void drawingController.nudgeSelection(ids,x*distance,y*distance);e.preventDefault();e.stopPropagation();return}
    if (e.key === 'Backspace' || e.key === 'Delete') {
      deleteSelectedDrawing()
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'Escape') {
      void drawingController.execute({type:'cancel'})
      e.preventDefault()
      e.stopPropagation()
    }
  }

  onMount(() => {
    // 绑定到 container 而非 window，避免图表外的按键误触发
    widgetRef!.addEventListener('keydown', handleKeyDown)
    widgetRef!.addEventListener('keydown',drawingModifierKey,true)
    widgetRef!.parentElement!.addEventListener('pointerdown',temporaryPanPointerStart,true)
    widgetRef!.addEventListener('pointerdown',drawingPointerStart,true)
    widgetRef!.addEventListener('pointermove',drawingPointerMove,true)
    widgetRef!.addEventListener('pointerup',drawingPointerEnd,true)
    widgetRef!.addEventListener('pointercancel',drawingPointerEnd,true)
    widgetRef!.addEventListener('contextmenu',drawingContext,true)
    window.addEventListener('keyup',drawingKeyUp)
    window.addEventListener('blur',drawingInputBlur)
    widgetRef!.addEventListener('click',analysisClick,true)
    widgetRef!.tabIndex=0
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

    if(widget)drawingBindings.set(widget,{history:drawingHistory,validateRestore,captureSharedReferences:()=>drawingCoordinator.references(),prepareSharedReferences:async references=>{
      if(!props.drawingHostSessions||!shareResolver)throw Error('请先启用原共享存储适配器，引用已保留')
      const context=analysis.getContext();if(!context)throw Error('请先加载行情再恢复共享引用')
      const resolution=shareResolver(context);if('reason' in resolution)throw Error(resolution.reason)
      const key=drawingShareKey(resolution.identity),ids=new Set(references.map(r=>r.documentId)),epoch=sharingEpoch
      if(ids.size!==1||references.some(r=>drawingShareKey(r.identity)!==key||r.namespace!==resolution.identity.namespace))throw Error('共享引用的标的、口径或文档不兼容')
      const workspace=await workspaceSessions?.bind(resolution)
      const host=await props.drawingHostSessions.bind({identity:resolution.identity,documentId:references[0].documentId})
      if(disposed||epoch!==sharingEpoch)throw Error('共享上下文已改变，请重试恢复')
      const old=drawingCoordinator.checkpointBinding();let applied=false,releaseRetention:(()=>void)|undefined
      const validateLocal=(values:DrawingSnapshot[])=>assertDrawingRestoreAuthority(values,[...workspace?.history.getDrawingIds()??[],...host.history.getDrawingIds()])
      return {validateLocal,apply:()=>{if(disposed||epoch!==sharingEpoch)throw Error('共享上下文已改变，不能采用旧引用');validateLocal(drawingHistory.getDrawings());releaseRetention=drawingCoordinator.retainBinding(old);applied=true;drawingCoordinator.bind(workspace,host);drawingCoordinator.acceptReferences(references);if(references.some(r=>!host.history.getDrawing(r.logicalId)))drawingCoordinator.reason='部分共享引用已缺失，请刷新原文档；不会用旧内容复活'},rollback:()=>{if(applied&&!disposed&&epoch===sharingEpoch)drawingCoordinator.rollbackBinding(old)},release:()=>releaseRetention?.()}
    }})
    let drawingAlignment=''
    if(widget)drawingAnalyticsRuntimes.set(widget,drawingAnalytics)
    if (widget) loader = new EngineDataLoader(widget, props.datafeed, {
      committed:state=>{
        const old=analysis.getContext()?.token;analysis.sync(state)
        setDrawingContextEpoch(state.epoch)
        const analyticsChanged=drawingAnalytics.sync(state,loader?.getConfirmedBars()??[])
        if(analyticsChanged&&drawingCoordinator.getDrawings().some(d=>isVolumeDrawing(d.overlay.name))){drawingController.refresh();widget?.resize()}
        untrack(()=>{
          if(old!==analysis.getContext()?.token)refreshSharedDrawings()
          if(!state.confirmed){drawingAlignment='';return}
          const bars=widget!.getDataList(),alignment=JSON.stringify([state.epoch,state.basis,state.revision,state.replay,state.cutoff,bars.length,bars[0]?.timestamp,bars.at(-1)?.timestamp])
          // Reproject on confirmed alignment changes, never on same-bar OHLC quotes.
          if(alignment!==drawingAlignment){
            drawingAlignment=alignment
            if(drawingHistory.getDrawingIds().length)drawingHistory.reproject()
            if(drawingCoordinator.hasSharedDrawings())drawingCoordinator.project()
          }
        })
      },
      state: state=>{if(drawingAnalytics.setDataState(state)&&drawingCoordinator.getDrawings().some(d=>isVolumeDrawing(d.overlay.name))){drawingController.refresh();widget?.resize()}if(state.error)settleWorkspaceBinding(Error(state.error));setDataState(state);setLoadError(state.error?`${state.errorCode??state.operation??'data'}: ${state.error}`:'');comparisons.mainChanged();props.onDataState?.(state)},
      loading: active => {setLoading(active);setLoadingVisible(active)},
      ready: identity => {setLoadError('');refreshSharedDrawings();if(!resuming())props.onDataReady?.(identity)},
      error: error => {settleWorkspaceBinding(Error(error.message));setLoadError(error.message);props.onError?.(error)},
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
      })().catch(error=>{settleWorkspaceBinding(error);if(!disposed){setLoadError(i18n('indicator_initialization_retry',locale()));setLoadingVisible(false);props.onError?.({type:'indicator-init',message:i18n('indicator_initialization_failed',locale()),raw:error})}}).finally(()=>{initializing=false})
    }
    retryInitialization()
    for(const action of ['onZoom','onScroll','onVisibleRangeChange','onPaneDrag'] as const)widget?.subscribeAction(action,refreshDrawingHandleLayout)
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
    settleWorkspaceBinding(new DOMException('图表已关闭，共享绑定已取消','AbortError'));cancelSharedBinding()
    handleDrag=undefined;nativeDrawingDrag=undefined;temporaryPanGesture=undefined;drawingPreviews.clear()
    if(drawingPresentationFrame!==undefined)cancelAnimationFrame(drawingPresentationFrame)
    ++indicatorGeneration
    if(comparisonResizeFrame!==undefined)cancelAnimationFrame(comparisonResizeFrame)
    analysis.dispose()
    widgetRef!.removeEventListener('click',analysisClick,true)
    ++factoryGeneration;comparisons.dispose()
    if(widget)drawingBindings.delete(widget)
    if(handleLayoutFrame!==undefined)cancelAnimationFrame(handleLayoutFrame)
    for(const action of ['onZoom','onScroll','onVisibleRangeChange','onPaneDrag'] as const)widget?.unsubscribeAction(action,refreshDrawingHandleLayout)
    ++sharingEpoch;drawingCoordinator.dispose();drawingPreferences.dispose();drawingController.dispose();drawingHistory.dispose()
    projectedDrawingDefinitions.clear();projectedDrawingObjects.clear()
    projectionInventory?.dispose();projectionInventory=undefined
    loader?.dispose()
    if(widget)drawingAnalyticsRuntimes.delete(widget)
    drawingAnalytics.dispose()
    widgetRef!.removeEventListener('keydown', handleKeyDown)
    widgetRef!.removeEventListener('keydown',drawingModifierKey,true)
    widgetRef!.parentElement!.removeEventListener('pointerdown',temporaryPanPointerStart,true)
    widgetRef!.removeEventListener('pointerdown',drawingPointerStart,true)
    widgetRef!.removeEventListener('pointermove',drawingPointerMove,true)
    widgetRef!.removeEventListener('pointerup',drawingPointerEnd,true)
    widgetRef!.removeEventListener('pointercancel',drawingPointerEnd,true)
    widgetRef!.removeEventListener('contextmenu',drawingContext,true)
    clearDrawingHold();spaceDrawing=undefined;temporaryPanLocks.clear();cancelSelectionBox()
    window.removeEventListener('keyup',drawingKeyUp)
    window.removeEventListener('blur',drawingInputBlur)
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
    if (prev) untrack(()=>{settleWorkspaceBinding(new DOMException('图表身份已改变，共享绑定已取消','AbortError'));analysis.clear();++indicatorGeneration;++factoryGeneration;comparisons.clear();cancelDrawing();cancelSharedBinding();drawingCoordinator.detach();const retained=JSON.stringify(prev.symbol)===JSON.stringify(s)?drawingHistory.getDrawings().filter(d=>d.owner==='local'):[];drawingHistory.reset(true);if(retained.length)drawingHistory.reconcile('local',retained);setSelectedOverlay(null);props.onDataReset?.(s)})
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
          onSymbolSelected={symbol => {try{assertDrawingTransition();setSymbol(symbol)}catch(error){setLoadError(error instanceof Error?error.message:String(error))}}}
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
        <button aria-label={i18n('drawing_undo',locale())} disabled={!drawingState().canUndo||drawingState().pending>0} onClick={()=>void drawingController.execute({type:'undo'})}>{workbenchState()?.historyScope&&workbenchState()?.historyScope!=='chart'?(locale()==='en-US'?'Undo shared drawing':'撤销共享绘图'):i18n('drawing_undo',locale())}</button>
        <button aria-label={i18n('drawing_redo',locale())} disabled={!drawingState().canRedo||drawingState().pending>0} onClick={()=>void drawingController.execute({type:'redo'})}>{workbenchState()?.historyScope&&workbenchState()?.historyScope!=='chart'?(locale()==='en-US'?'Redo shared drawing':'重做共享绘图'):i18n('drawing_redo',locale())}</button>
        <button aria-expanded={workbenchOpen()} onClick={()=>setWorkbenchOpen(!workbenchOpen())}>{locale()==='en-US'?'Drawing manager':'绘图管理'}</button>
        <Show when={drawingState().pending>0}><span role="status">{i18n('drawing_pending',locale())}: {drawingState().pending}</span></Show>
        <Show when={drawingState().error}><span role="alert">{drawingState().error}</span></Show>
      </div>
      <For each={workbenchState()?.selectedIds.filter(id=>workbenchState()?.analytics?.[id])??[]}>{id=><AnalyticsSummary state={workbenchState()!.analytics![id]} locale={locale()}/>}</For>
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
        onPeriodChange={value=>{try{setChartPeriod(value)}catch(error){setLoadError(error instanceof Error?error.message:String(error))}}}
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
      <div class="tc-chart-status-row">
        <Show when={dataState()}>{state=><div role="status" class="klinecharts-pro-data-state">
          {i18n(`data_${state().dataStatus}`,locale())} · {i18n(`connection_${state().connection}`,locale())}
          <Show when={state().lastRead?.metadata?.state==='partial'}> · {i18n('data_partial',locale())}</Show>
          <Show when={state().lastRead}>{read=><span> · {i18n('data_last_read',locale())}: {read().query.kind==='before'?i18n('data_before',locale()):i18n('data_range',locale())} · {i18n('data_observed',locale())}: {read().metadata?.sourceTimestamp===undefined?i18n('data_unknown',locale()):new Date(read().metadata!.sourceTimestamp!).toISOString()} · {i18n('data_delay',locale())}: {read().metadata?.delayMs===undefined?i18n('data_unknown',locale()):`${read().metadata!.delayMs}ms`}</span>}</Show>
          <Show when={state().revisionRequired}><button onClick={()=>void loader?.reload(true).catch(()=>{})}>{i18n('data_revision',locale())}</button></Show>
        </div>}</Show>
        <For each={Object.entries(drawingState().projectionErrors??{})}>{([id,message])=><div role="alert" class="klinecharts-pro-data-error">{id}: {message} <button onClick={()=>{drawingHistory.reproject();drawingCoordinator.project()}}>{i18n('retry',locale())}</button></div>}</For>
        <Show when={workbenchState()?.lastResult?.message}><div role="alert" class="klinecharts-pro-data-error">{workbenchState()?.lastResult?.message}</div></Show>
        <Show when={loadError()}><div role="alert" class="klinecharts-pro-data-error">{loadError()} <button onClick={() => {!engineReady() ? retryInitialization?.() : replayEngine ? stopReplay() : void loader?.retryError().catch(()=>{})}}>{i18n('retry',locale())}</button></div></Show>
      </div>
      <div
        class="klinecharts-pro-content" onKeyDown={handleKeyDown}>
        <Show when={loadingVisible()}>
          <Loading/>
        </Show>
        <Show when={drawingBarVisible()}>
          <DrawingBar
            locale={locale()}
            catalog={drawingCatalog}
            state={workbenchState()}
            onDrawingItemClick={overlay => {
              const tool=drawingCatalog.find(t=>t.overlayName===overlay.name);if(tool)void drawingController.execute({type:'tool',toolId:tool.toolId})
            }}
            onModeChange={magnet => {void drawingController.execute({type:'view',magnet:magnet as import('./drawing/snap').DrawingMagnetMode})}}
            onLockChange={lock => {void drawingController.execute({type:'view',preventDragging:lock})}}
            onVisibleChange={visible => {void drawingController.execute({type:'view',hidden:!visible})}}
            onRemoveClick={(groupId) => { for(const id of [...ownedDrawingIds]){const overlay=widget?.getOverlays({id})[0];if(overlay&&(!groupId||overlay.groupId===groupId))widget?.removeOverlay({id})} }}/>
        </Show>
        <Show when={drawingBarVisible()&&workbenchState()}>{state=><DrawingFavorites state={state()} catalog={drawingCatalog} locale={locale()} execute={command=>drawingController.execute(command)}/>}</Show>
        <Show when={workbenchOpen()&&workbenchState()}>{state=><DrawingWorkbench contextKey={JSON.stringify([drawingContextEpoch(),symbol(),period(),dataState()?.basis,workbenchState()?.sharing?.workspace?.key,workbenchState()?.sharing?.host?.key])} locale={locale()} state={state()} catalog={drawingCatalog} period={period()} periods={props.periods} tickSize={symbol().tickSize} rotation={{read:object=>{const points=projectDrawingPoints(object).map(point=>drawingToPixel(point,object));return points.length>1?Math.atan2(points[0].y-points[1].y,points[1].x-points[0].x)*180/Math.PI:0},apply:(object,degrees)=>rotatedDrawing(object,degrees,{bars:widget?.getDataList()??[],period:period(),size:drawingSize,toPixel:drawingToPixel,fromPixel:drawingFromPixel,project:projectDrawingPoints})}} editId={workbenchEditing()} axes={object=>widget?.getYAxes({paneId:object.overlay.paneId??'candle_pane'}).map(axis=>({id:axis.id,name:axis.name}))??[]} execute={command=>drawingController.execute(command)} convertAnchor={convertDrawingAnchor} locate={object=>{const point=projectDrawingPoints(object)[0];if(point?.timestamp!==undefined){const index=widget?.getDataList().findIndex(bar=>bar.timestamp===point.timestamp);if(index!==undefined&&index>=0)widget?.scrollToDataIndex(index,0)}const rendered=widget?.getOverlays({id:object.logicalId})[0];if(rendered)markSelectedOverlay(rendered,false)}} onClose={()=>setWorkbenchOpen(false)}/>}</Show>
        <div
          ref={widgetRef}
          class='klinecharts-pro-widget'
          data-drawing-bar-visible={drawingBarVisible()}/>
        <Show when={snapHint()||workbenchState()?.toolId}><div class="tc-drawing-input-status"><Show when={snapHint()}><span role="status">{snapHint()}</span></Show><Show when={workbenchState()?.toolId}><div role="status" class="tc-drawing-progress">{locale()==='en-US'?'Drawing step':'绘制步骤'} {workbenchState()?.step}<Show when={drawingCatalog.find(tool=>tool.toolId===workbenchState()?.toolId)?.mode==='variable'}><button onClick={()=>void drawingController.execute({type:'finish'})}>{locale()==='en-US'?'Finish (Enter)':'完成绘制（Enter）'}</button></Show><button onClick={()=>void drawingController.execute({type:'cancel'})}>{locale()==='en-US'?'Cancel (Esc)':'取消（Esc）'}</button></div></Show></div></Show>
        <DrawingHandles locale={locale()} handles={drawingHandles()} suspended={temporaryPan()||!!workbenchState()?.toolId} start={startDrawingHandle} move={moveDrawingHandle} end={endDrawingHandle} nudge={nudgeDrawingHandle}/>
        <DrawingAxisLabels labels={drawingAxisLabels()}/>
        <Show when={selectionBox()}>{box=><div class="tc-drawing-box" style={{left:`${box().x}px`,top:`${box().y}px`,width:`${box().width}px`,height:`${box().height}px`}}/>}</Show>
        <Show when={drawingMenu()}>{menu=><DrawingContextMenu x={menu().x} y={menu().y} label={locale()==='en-US'?'Drawing actions':'绘图操作'} close={()=>setDrawingMenu(undefined)} items={[
          {label:locale()==='en-US'?'Copy':'复制',run:()=>void drawingController.execute({type:'copy',ids:drawingController.getSelectedIds()})},
          {label:locale()==='en-US'?'Paste':'粘贴',run:()=>void drawingController.execute({type:'paste'})},
          {label:locale()==='en-US'?'Duplicate':'克隆',run:()=>void drawingController.execute({type:'duplicate',ids:drawingController.getSelectedIds()})},
          {label:locale()==='en-US'?'Settings':'设置',run:()=>{setWorkbenchEditing(drawingController.getSelectedIds()[0]);setWorkbenchOpen(true)}},
          {label:locale()==='en-US'?'Delete':'删除',run:deleteSelectedDrawing},
          {label:locale()==='en-US'?'Clear selection':'清空选择',run:()=>void drawingController.execute({type:'select',ids:[]})}
        ]}/>}</Show>
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
