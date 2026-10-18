import * as React from 'react'
import {createPortal} from 'react-dom'
import type {ChartPro} from '../types'
import type {ChartWorkspace} from '../workspace/ChartWorkspace'
import type {ChartWorkspaceOptions,WorkspaceBinding,WorkspaceCell} from '../workspace/types'
import type {WorkspaceStore} from '../workspace/store'
import {errorOf,initializationStatus,loadChartCore,useInstanceRef,useLatest} from './lifecycle'

export interface ReactWorkspaceCellReady {chart:ChartPro;captureOptions?:WorkspaceBinding['captureOptions']}
export interface ReactWorkspaceCellProps {
  cell:WorkspaceCell
  height:number
  signal:AbortSignal
  onReady:(value:ReactWorkspaceCellReady)=>void
  onError:(error:Error)=>void
}
export type TradingWorkspaceInitialOptions=Omit<ChartWorkspaceOptions,'container'|'mountCell'|'store'|'height'|'locale'|'theme'|Extract<keyof ChartWorkspaceOptions,`on${string}`>>
export type OwnedWorkspaceStore=WorkspaceStore & {dispose():void}
type StoreProps=
  | {store:WorkspaceStore;createStore?:never}
  | {store?:never;createStore:(signal:AbortSignal)=>OwnedWorkspaceStore|Promise<OwnedWorkspaceStore>}
  | {store?:undefined;createStore?:undefined}
export type TradingWorkspaceProps=StoreProps & {
  initialOptions:TradingWorkspaceInitialOptions
  renderCell:(props:ReactWorkspaceCellProps)=>React.ReactNode
  height:number|'100%'
  locale?:string
  theme?:string
  onReady?:(workspace:ChartWorkspace)=>void
  onActiveCell?:ChartWorkspaceOptions['onActiveCell']
  onLayoutChange?:ChartWorkspaceOptions['onLayoutChange']
  onError?:ChartWorkspaceOptions['onError']
  className?:string
  style?:React.CSSProperties
  'aria-label'?:string
}
interface PortalBinding {id:number;container:HTMLElement;props:ReactWorkspaceCellProps;dispose:()=>void}
let nextBinding=0

export const TradingWorkspace=React.forwardRef<ChartWorkspace,TradingWorkspaceProps>(function TradingWorkspace(props,ref){
  const host=React.useRef<HTMLDivElement>(null),instance=React.useRef<ChartWorkspace|null>(null)
  const latest=useLatest(props),publish=useInstanceRef(ref)
  const [bindings,setBindings]=React.useState<PortalBinding[]>([])
  const [attempt,retry]=React.useReducer((value:number)=>value+1,0)
  const [state,setState]=React.useState<{loading:boolean;error:Error|null}>({loading:true,error:null})
  // Closing owned storage follows the React commit that removes its portals.
  const retired=React.useRef<Array<()=>void>>([])
  React.useEffect(()=>{for(const close of retired.current.splice(0))close()})
  React.useEffect(()=>{
    const controller=new AbortController(),snapshot=latest.current,ownedBindings=new Set<PortalBinding>()
    let workspace:ChartWorkspace|undefined,ownedStore:OwnedWorkspaceStore|undefined
    setState({loading:true,error:null})
    void (async()=>{
      const {ChartWorkspace}=await loadChartCore()
      if(controller.signal.aborted)return
      const store=snapshot.createStore?await snapshot.createStore(controller.signal):snapshot.store
      if(snapshot.createStore)ownedStore=store as OwnedWorkspaceStore
      if(controller.signal.aborted){ownedStore?.dispose();ownedStore=undefined;return}
      workspace=new ChartWorkspace({...snapshot.initialOptions,container:host.current!,store,height:latest.current.height,
        locale:latest.current.locale,theme:latest.current.theme,
        onActiveCell:cell=>{if(!controller.signal.aborted)latest.current.onActiveCell?.(cell)},
        onLayoutChange:layout=>{if(!controller.signal.aborted)latest.current.onLayoutChange?.(layout)},
        onError:error=>{if(!controller.signal.aborted)latest.current.onError?.(error)},
        mountCell:(container,cell,signal)=>{
          let disposed=false,readyState:ReactWorkspaceCellReady|undefined
          let resolve!:(chart:ChartPro)=>void,reject!:(error:Error)=>void
          const listeners=new Set<(chart:ChartPro)=>void>()
          const ready=new Promise<ChartPro>((yes,no)=>{resolve=yes;reject=no})
          const binding:PortalBinding={id:++nextBinding,container,props:{cell,height:Math.max(1,container.clientHeight),signal,
            onReady:value=>{if(!disposed&&!signal.aborted&&!controller.signal.aborted){readyState=value;resolve(value.chart);for(const accept of listeners)accept(value.chart)}},
            onError:error=>{if(!disposed&&!signal.aborted)reject(error)}},
            dispose:()=>{
              if(disposed)return
              disposed=true;observer.disconnect();listeners.clear();signal.removeEventListener('abort',binding.dispose)
              reject(new DOMException('Workspace cell cancelled','AbortError'))
              ownedBindings.delete(binding)
              setBindings(values=>values.filter(value=>value!==binding))
            }}
          const observer=new ResizeObserver(()=>{if(!disposed){binding.props={...binding.props,height:Math.max(1,container.clientHeight)};setBindings(values=>[...values])}})
          observer.observe(container)
          signal.addEventListener('abort',binding.dispose,{once:true})
          ownedBindings.add(binding);setBindings(values=>[...values,binding])
          return {ready,dispose:binding.dispose,subscribeReady:accept=>{listeners.add(accept);if(readyState)accept(readyState.chart);return()=>listeners.delete(accept)},captureOptions:()=>readyState?.captureOptions?.()??{}}
        }})
      instance.current=workspace;publish(workspace)
      setState({loading:false,error:null})
      latest.current.onReady?.(workspace)
    })().catch(reason=>{
      const failedWorkspace=workspace;workspace=undefined;failedWorkspace?.dispose();for(const binding of ownedBindings)binding.dispose()
      if(ownedStore){const store=ownedStore;ownedStore=undefined;retired.current.push(()=>store.dispose());setBindings(values=>[...values])}
      if(controller.signal.aborted)return
      instance.current=null;publish(null)
      const error=errorOf(reason);setState({loading:false,error});latest.current.onError?.(error)
    })
    return()=>{
      controller.abort();instance.current=null;publish(null)
      const retiredWorkspace=workspace;workspace=undefined;retiredWorkspace?.dispose();for(const binding of ownedBindings)binding.dispose()
      if(ownedStore){const store=ownedStore;ownedStore=undefined;retired.current.push(()=>store.dispose())}
      // On final unmount React completes all child cleanups before this microtask.
      queueMicrotask(()=>{for(const close of retired.current.splice(0))close()})
    }
  },[attempt,publish,latest])
  React.useEffect(()=>{if(props.locale!==undefined)instance.current?.setLocale(props.locale)},[props.locale])
  React.useEffect(()=>{if(props.theme!==undefined)instance.current?.setTheme(props.theme)},[props.theme])
  React.useEffect(()=>{instance.current?.resize(props.height)},[props.height])
  return React.createElement(React.Fragment,null,
    React.createElement('div',{className:props.className,style:{...props.style,height:props.height},'aria-label':props['aria-label']??'TradingChest workspace','data-testid':'trading-workspace'},
      initializationStatus(state.error,state.loading,retry,props.locale),React.createElement('div',{ref:host,style:{height:'100%',minWidth:0,minHeight:0}})),
    bindings.map(binding=>createPortal(props.renderCell(binding.props),binding.container,String(binding.id))))
})
