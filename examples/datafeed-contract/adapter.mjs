import {validateHistoryQuery,validateHistoryResult} from 'trading-chest/testing'

/** Each chart calls this factory; transport, units, authorization and history truth belong to the host. */
export function createAdapter({readHistory,subscribe,search}) {
  const active=new Map()
  let disposed=false
  const identity=(symbol,period)=>JSON.stringify([symbol.ticker,period.multiplier,period.timespan])
  const assertOpen=()=>{if(disposed)throw Error('Adapter disposed')}
  return {
    searchSymbols:async query=>{assertOpen();return search(query)},
    getHistoryKLineData:async(symbol,period,query,context)=>{
      assertOpen();validateHistoryQuery(query);context?.signal.throwIfAborted()
      const result=await readHistory({symbol,period,query,signal:context?.signal,reason:context?.reason})
      context?.signal.throwIfAborted();assertOpen()
      return validateHistoryResult(result,query)
    },
    subscribe(symbol,period,accept){assertOpen();const key=identity(symbol,period);active.get(key)?.();active.delete(key);const stop=subscribe({symbol,period,accept});active.set(key,stop)},
    unsubscribe(symbol,period){const key=identity(symbol,period),stop=active.get(key);active.delete(key);stop?.()},
    dispose(){if(disposed)return;disposed=true;for(const stop of active.values())stop();active.clear()},
  }
}
