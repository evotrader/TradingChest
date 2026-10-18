import * as React from 'react'

export function useLatest<T>(value:T):React.MutableRefObject<T> {
  const latest=React.useRef(value)
  // Publish only on commit, before descendant layout effects can emit events.
  React.useInsertionEffect(()=>{latest.current=value},[value])
  return latest
}

function assignRef<T>(ref:React.ForwardedRef<T>,value:T|null):void {
  if(typeof ref==='function')ref(value)
  else if(ref)ref.current=value
}

/** Publish synchronously before ready callbacks, including asynchronous creation. */
export function useInstanceRef<T>(ref:React.ForwardedRef<T>) {
  const instance=React.useRef<T|null>(null)
  const currentRef=React.useRef(ref)
  React.useEffect(()=>{
    if(currentRef.current!==ref){assignRef(currentRef.current,null);currentRef.current=ref;assignRef(ref,instance.current)}
  },[ref])
  return React.useCallback((value:T|null)=>{instance.current=value;assignRef(currentRef.current,value)},[])
}

export function errorOf(reason:unknown):Error {return reason instanceof Error?reason:new Error(String(reason))}

export function initializationStatus(error:Error|null,loading:boolean,retry:()=>void,locale?:string):React.ReactNode {
  const english=locale!==undefined&&locale!=='zh-CN'
  if(error)return React.createElement('div',{role:'alert'},error.message,' ',React.createElement('button',{type:'button',onClick:retry},english?'Retry':'重试'))
  return loading?React.createElement('div',{role:'status'},english?'Loading…':'加载中…'):null
}

let core:Promise<typeof import('../chart')>|undefined
/** Share the module load, never the chart or datafeed instance. Failed imports can retry. */
export function loadChartCore():Promise<typeof import('../chart')> {
  return core??=import('../chart').catch(reason=>{core=undefined;throw reason})
}
