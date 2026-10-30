'use client';
import React,{createContext,useContext,useRef,useState} from 'react';
import {TradingChart,TradingWorkspace} from 'trading-chest/react';
import {builtinDrawingCatalog,builtinDrawingAlertLevelResolvers} from 'trading-chest/chart';
import 'trading-chest/dist/trading-chest.css';

const Context=createContext('未接入');
const symbols=[{ticker:'SYNTHETIC-A',name:'合成 A'},{ticker:'SYNTHETIC-B',name:'合成 B'}];
const periods=[{multiplier:1,timespan:'day',text:'1d'},{multiplier:1,timespan:'hour',text:'1h'}];
const metrics={created:0,disposed:0,subscriptions:0,ready:0,errors:0,levelResolutions:0};
// Construction-time capabilities stay with the mounted chart across React renders.
const drawingCatalog=builtinDrawingCatalog.map(tool=>tool.toolId==='fibonacciLine'?{...tool,alertLevels:{resolverId:'example/react-level',parameterKey:'levels'}}:tool);
const drawingAlertLevelResolvers=[{id:'example/react-level',resolve:input=>{metrics.levelResolutions++;return builtinDrawingAlertLevelResolvers[0].resolve(input)}}];
const templateBars=Array.from({length:300},(_,i)=>({timestamp:1700000000000+i*3600000,open:100+i/10,high:102+i/10,low:99+i/10,close:101+i/10,volume:1000}));
const barsFor=period=>templateBars.map((bar,i)=>({...bar,timestamp:1700000000000+i*(period.timespan==='day'?86400000:3600000)}));
function createFeed(fail){
  metrics.created++;let disposed=false,subscribed=false;
  return {searchSymbols:async()=>symbols,getHistoryKLineData:async(_s,_p,query,context)=>{
    context?.signal.throwIfAborted();if(fail.current){fail.current=false;throw Error('隔离示例：读取失败，请重试')}
    const selected=barsFor(_p).filter(b=>query.kind==='before'?b.timestamp<query.before:b.timestamp>=query.from&&b.timestamp<query.to);
    return {bars:query.kind==='before'?selected.slice(-query.countBack):selected,basis:'synthetic-only',hasMoreBefore:query.kind==='before'?selected.length>query.countBack:undefined};
  },getReplayHistory:async(symbol,period,query,context)=>{
    context.signal.throwIfAborted();if(fail.current){fail.current=false;throw Error('隔离示例：时钟读取失败')}
    const duration=period.timespan==='day'?86400000:3600000,all=barsFor(period),before=all.filter(b=>b.timestamp+duration<query.from).slice(-query.warmupBars),selected=[...before,...all.filter(b=>b.timestamp+duration>=query.from&&b.timestamp+duration<query.to)];
    return {bars:selected,clocks:selected.map(b=>({timestamp:b.timestamp,completedAt:b.timestamp+duration})),identity:{source:'synthetic',ticker:symbol.ticker,market:'synthetic',exchange:'EXAMPLE',currency:'USD',multiplier:period.multiplier,timespan:period.timespan,adjustment:'none',sessionFilter:'declared-example',timezone:'UTC'},basis:'synthetic-only',historyKind:'current-history',metadata:{state:selected.length?'ready':'empty'},coverage:{from:query.from,to:query.to,warmupBars:before.length}};
  },subscribe:()=>{if(!subscribed){subscribed=true;metrics.subscriptions++}},unsubscribe:()=>{if(subscribed){subscribed=false;metrics.subscriptions--}},dispose:()=>{if(disposed)throw Error('重复释放 feed');disposed=true;metrics.disposed++}};
}
function feedFactory(fail){return async signal=>{signal.throwIfAborted();return createFeed(fail)}}
function Cell({cell,height,onReady,onError,theme,locale}){
  const context=useContext(Context),chart=useRef(null),fail=useRef(false),layer=useRef(null);
  return <div data-context={context}><TradingChart ref={chart} height={height} theme={theme} locale={locale}
    initialOptions={{drawingCatalog,drawingAlertLevelResolvers,symbol:cell.symbol,period:cell.period,periods,drawingBarVisible:false,mainIndicators:[],subIndicators:[],comparisonSymbols:[symbols.find(s=>s.ticker!==cell.symbol.ticker)],createComparisonDatafeed:()=>createFeed({current:false})}}
    createDatafeed={feedFactory(fail)} events={{onDataReady:()=>{if(!chart.current)throw Error('ref 尚未安装');const scope=chart.current.getAnalysisContext();if(scope&&layer.current!==scope.token){layer.current=scope.token;chart.current.addAnalysisLayer(scope,{id:'react-events',type:'events',label:'合成事件',data:barsFor(cell.period).filter((_,i)=>i%30===0).map((b,i)=>({id:String(i),timestamp:b.timestamp,availableAt:b.timestamp+(cell.period.timespan==='day'?86400000:3600000),label:'合成事件 '+i}))})}onReady({chart:chart.current})},onError:error=>onError(Error(error.message))}}/></div>
}
export default function Demo(){
  const [mounted,setMounted]=useState(true),[theme,setTheme]=useState('light'),[locale,setLocale]=useState('zh-CN'),[mode,setMode]=useState('workspace');
  const chart=useRef(null),workspace=useRef(null),fail=useRef(false),[error,setError]=useState('');
  if(typeof window!=='undefined')window.tcExample={metrics,chart,workspace};
  return <Context.Provider value="宿主 Context"><main style={{fontFamily:'sans-serif',padding:16}}><h1>TradingChest 框架接入</h1><p>隔离合成数据演示，不连接市场或 EvoTrader。</p>
    <button onClick={()=>setMounted(v=>!v)}>{mounted?'卸载':'挂载'}</button>{' '}
    <button onClick={()=>setMode(v=>v==='workspace'?'chart':'workspace')}>切换单图／工作台</button>{' '}
    <button onClick={()=>setTheme(v=>v==='light'?'dark':'light')}>切换主题</button>{' '}
    <button onClick={()=>setLocale(v=>v==='zh-CN'?'en-US':'zh-CN')}>切换语言</button>{' '}
    <button onClick={()=>{fail.current=true;void chart.current?.reloadData().catch(e=>setError(e.message))}}>模拟读取失败</button>{' '}
    <button onClick={()=>void chart.current?.retryData().then(()=>setError('')).catch(e=>setError(e.message))}>重试行情</button>
    <p role="status">{error}</p>
    {mounted&&(mode==='chart'?<TradingChart ref={chart} height={560} theme={theme} locale={locale}
      initialOptions={{drawingCatalog,drawingAlertLevelResolvers,symbol:symbols[0],period:periods[0],periods,mainIndicators:[],subIndicators:[]}}
      createDatafeed={feedFactory(fail)} onReady={()=>metrics.ready++} events={{onError:e=>{metrics.errors++;setError(e.message)}}}/>
      :<TradingWorkspace ref={workspace} height={780} theme={theme} locale={locale}
        initialOptions={{context:'synthetic:react-example',symbols,initialSymbol:symbols[0],initialPeriod:periods[0],getPeriods:async()=>periods,replay:{enabled:true}}}
        createStore={async signal=>{const {createIndexedDBWorkspaceStore}=await import('trading-chest/chart');signal.throwIfAborted();return createIndexedDBWorkspaceStore()}}
        onError={e=>setError(e.message)} renderCell={props=><Cell {...props} theme={theme} locale={locale}/>}/>)}
  </main></Context.Provider>
}
