import * as React from 'react'
import type {ChartPro,ChartProOptions,Datafeed} from '../types'
import {errorOf,initializationStatus,loadChartCore,useInstanceRef,useLatest} from './lifecycle'

type EventKey=Extract<keyof ChartProOptions,`on${string}`>
export type TradingChartEvents=Pick<ChartProOptions,EventKey>
export type TradingChartInitialOptions=Omit<ChartProOptions,EventKey|'container'|'datafeed'|'theme'|'locale'|'timezone'|'styles'>
export interface TradingChartProps {
  initialOptions:TradingChartInitialOptions
  createDatafeed:(signal:AbortSignal)=>Datafeed|Promise<Datafeed>
  height:number|'100%'
  theme?:string
  locale?:string
  timezone?:string
  styles?:ChartProOptions['styles']
  events?:TradingChartEvents
  onReady?:(chart:ChartPro)=>void
  className?:string
  style?:React.CSSProperties
  'aria-label'?:string
}

// Always install every notification, even when its first React callback is absent.
const eventKeys:EventKey[]=['onDrawingAlertStateChange','onDrawingAlertTrigger','onReplayDrawingAlertTrigger','onDrawingStateChange','onComparisonChange','onDrawingSelect','onDrawingHistoryChange','onDataState','onDataReady','onPeriodChange','onIndicatorClick','onOverlayCreate','onOverlayUpdate','onOverlayDelete','onAlertTrigger','onReplayAlertTrigger','onError','onAnalysisLayerChange','onAnalysisEventClick','onAnalysisPointSelect']

export const TradingChart=React.forwardRef<ChartPro,TradingChartProps>(function TradingChart(props,ref){
  const container=React.useRef<HTMLDivElement>(null),instance=React.useRef<ChartPro|null>(null)
  const latest=useLatest(props),publish=useInstanceRef(ref)
  const [attempt,retry]=React.useReducer((value:number)=>value+1,0)
  const [state,setState]=React.useState<{loading:boolean;error:Error|null}>({loading:true,error:null})
  React.useEffect(()=>{
    const controller=new AbortController(),snapshot=latest.current
    let chart:ChartPro|undefined,unownedFeed:Datafeed|undefined
    setState({loading:true,error:null})
    void (async()=>{
      // Start with the framework boundary; never initialize Canvas during SSR.
      const core=await loadChartCore()
      if(controller.signal.aborted)return
      const feed=await snapshot.createDatafeed(controller.signal)
      unownedFeed=feed
      if(controller.signal.aborted){unownedFeed=undefined;feed.dispose?.();return}
      const notifications:TradingChartEvents={}
      for(const key of eventKeys)(notifications as Record<string,unknown>)[key]=(...args:unknown[])=>{
        if(!controller.signal.aborted)(latest.current.events?.[key] as ((...values:unknown[])=>void)|undefined)?.(...args)
      }
      chart=new core.KLineChartPro({...snapshot.initialOptions,...notifications,container:container.current!,datafeed:feed,
        theme:latest.current.theme,locale:latest.current.locale,timezone:latest.current.timezone,styles:latest.current.styles})
      unownedFeed=undefined
      instance.current=chart
      publish(chart)
      setState({loading:false,error:null})
      latest.current.onReady?.(chart)
    })().catch(reason=>{
      const failedChart=chart;chart=undefined;failedChart?.dispose()
      unownedFeed?.dispose?.();unownedFeed=undefined
      if(controller.signal.aborted)return
      instance.current=null;publish(null)
      const error=errorOf(reason)
      setState({loading:false,error})
      latest.current.events?.onError?.({type:'initialization',message:error.message,raw:reason})
    })
    return()=>{
      controller.abort()
      instance.current=null;publish(null)
      const retiredChart=chart;chart=undefined;retiredChart?.dispose()
    }
  },[attempt,publish,latest])
  React.useEffect(()=>{instance.current?.getChart()?.resize()},[props.height])
  React.useEffect(()=>{if(props.theme!==undefined)instance.current?.setTheme(props.theme)},[props.theme])
  React.useEffect(()=>{if(props.locale!==undefined)instance.current?.setLocale(props.locale)},[props.locale])
  React.useEffect(()=>{if(props.timezone!==undefined)instance.current?.setTimezone(props.timezone)},[props.timezone])
  React.useEffect(()=>{if(props.styles!==undefined)instance.current?.setStyles(props.styles)},[props.styles])
  return React.createElement('div',{className:props.className,style:{position:'relative',...props.style,height:props.height},'data-testid':'trading-chart','aria-label':props['aria-label']??'TradingChest'},
    React.createElement('div',{ref:container,style:{height:'100%',width:'100%'}}),
    React.createElement('div',{style:{position:'absolute',top:0,left:0}},initializationStatus(state.error,state.loading,retry,props.locale)))
})
