import {DrawingSession,DrawingSessionRegistry,createIndexedDBDrawingPreferencesStore,createIndexedDBDrawingDocumentStore} from '/src/chart.ts'
import {drawingAnalyticsRuntimes} from '/src/drawing/analyticsRuntime.ts'
import {hasCurveGeometry} from '/src/extension/curves.ts'

/** Weak instrumentation must not keep detached Solid nodes alive by itself. */
export function installDrawingCleanup(){
 const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,timeout=window.setTimeout,clearTimeout=window.clearTimeout,interval=window.setInterval,clearInterval=window.clearInterval,raf=window.requestAnimationFrame,cancelRaf=window.cancelAnimationFrame,Observer=window.ResizeObserver,open=IDBFactory.prototype.open,close=IDBDatabase.prototype.close,subscribe=DrawingSession.prototype.subscribe
 const listeners:any[]=[],timers=new Set(),frames=new Set(),observers=new Set(),connections=new Set<IDBDatabase>();let subscribers=0,resources:any,cycle=0
 const owned=()=>new Error().stack?.split('\n').slice(1).find(line=>!line.includes('/tests/browser/'))?.includes('/src/')??false
 const capture=(options:any)=>typeof options==='boolean'?options:!!options?.capture
 EventTarget.prototype.addEventListener=function(type:any,handler:any,options:any){if(handler&&owned()&&!listeners.some(x=>x.target.deref()===this&&x.type===type&&x.handler.deref()===handler&&x.capture===capture(options)))listeners.push({target:new WeakRef(this),type,handler:new WeakRef(handler),capture:capture(options),source:new Error().stack?.split('\n').find(line=>line.includes('/src/'))});return add.call(this,type,handler,options)}
 EventTarget.prototype.removeEventListener=function(type:any,handler:any,options:any){const index=listeners.findIndex(x=>x.target.deref()===this&&x.type===type&&x.handler.deref()===handler&&x.capture===capture(options));if(index>=0)listeners.splice(index,1);return remove.call(this,type,handler,options)}
 window.setTimeout=((callback:any,delay:any,...args:any[])=>{const track=owned();let id:number;id=timeout.call(window,(...values:any[])=>{timers.delete(id);callback(...values)},delay,...args);if(track)timers.add(id);return id}) as any
 window.clearTimeout=(id:any)=>{timers.delete(id);clearTimeout.call(window,id)}
 window.setInterval=((callback:any,delay:any,...args:any[])=>{const id=interval.call(window,callback,delay,...args);if(owned())timers.add(id);return id}) as any
 window.clearInterval=(id:any)=>{timers.delete(id);clearInterval.call(window,id)}
 window.requestAnimationFrame=callback=>{const track=owned();let id:number;id=raf.call(window,time=>{frames.delete(id);callback(time)});if(track)frames.add(id);return id}
 window.cancelAnimationFrame=id=>{frames.delete(id);cancelRaf.call(window,id)}
 window.ResizeObserver=class extends Observer{constructor(callback:ResizeObserverCallback){super(callback);if(owned())observers.add(this)}disconnect(){observers.delete(this);super.disconnect()}}
 IDBFactory.prototype.open=function(...args:any[]){const request=(open as any).apply(this,args);if(String(args[0]).startsWith('tc-drawing-cleanup-'))request.addEventListener('success',()=>connections.add(request.result));return request}
 IDBDatabase.prototype.close=function(){connections.delete(this);return close.call(this)}
 DrawingSession.prototype.subscribe=function(listener:any){subscribers++;const off=subscribe.call(this,listener);let active=true;return ()=>{if(active){active=false;subscribers--}off()}}
 const bench=(window as any).drawingBench,identity={namespace:'isolated-cleanup',symbol:{ticker:'SYNTHETIC.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'isolated-unadjusted'}
 let analytics:any[]=[],curveCharts:any[]=[],cacheLeaks=0
 return {
  async start(volume=false){
   const databaseName='tc-drawing-cleanup-'+crypto.randomUUID(),preferences=createIndexedDBDrawingPreferencesStore({databaseName}),documents=createIndexedDBDrawingDocumentStore({databaseName}),registry=new DrawingSessionRegistry({scope:'host',store:documents}),resolution={identity,documentId:'fixed'}
   resources={databaseName,preferences,documents,registry,resolution}
   await bench.mount({count:10000,layout:2,n:10,volume,resources:{drawingHostSessions:registry,resolveDrawingShareKey:()=>resolution,drawingPreferencesStore:preferences,drawingPreferencesScope:'isolated-cleanup'}})
   await registry.bind(resolution);const deadline=performance.now()+10000;while(!bench.charts.every((c:any)=>c.getDrawingState().sharing?.host)){if(performance.now()>deadline)throw Error('共享借用绑定未完成');await new Promise(r=>timeout(r,1))}
   await Promise.all(bench.charts.map((c:any)=>c.executeDrawingCommand({type:'preferences-retry'})))
   for(const pro of bench.charts){
    const chart=pro.getChart(),bars=chart.getDataList(),axis=chart.getYAxes({paneId:'candle_pane'})[0],height=chart.getSize('candle_pane','main').height
    const curves=['curve','doubleCurve','arc'].map((name,index)=>{
     const points=(name==='doubleCurve'?[[45,.6],[30,.6],[40,.3],[35,.8]]:[[45,.6],[30,.6],[38,.3]]).map(([offset,y])=>({timestamp:bars.at(-offset).timestamp,value:axis.convertFromPixel(height*y)})),id=`cleanup-${name}`
     return {logicalId:id,owner:'local',anchors:points.map(point=>({kind:'market',...point})),presentation:{name:`清理曲线 ${index}`},overlay:{id,name,paneId:'candle_pane',groupId:'drawing_tools',points,visible:true,lock:false,styles:null,extendData:null}}
    })
    pro.restoreDrawings('local',[...pro.getDrawings().filter((d:any)=>(d.presentation?.scope??'chart')==='chart'),...curves])
    if(volume){const result=await pro.executeDrawingCommand({type:'update',ids:['volume-0'],patch:{parameters:{bandMode:'standard-deviation',bandMultipliers:[1,2,3]}}});if(result.status!=='completed')throw Error('清理验收未启用三组标准差带')}
   }
   await bench.frame();curveCharts=bench.charts.map((pro:any)=>pro.getChart());if(!curveCharts.every(hasCurveGeometry))throw Error('三种曲线未实际进入几何缓存')
   if(volume){
    analytics=bench.charts.map((c:any)=>({chart:c.getChart(),runtime:drawingAnalyticsRuntimes.get(c.getChart())}))
    const result=await bench.charts[1].executeDrawingCommand({type:'delete',ids:['volume-0','volume-1']});if(result.status!=='completed')throw Error('清理验收的第二图本地对象未移除')
    const shared=await bench.charts[0].executeDrawingCommand({type:'transfer',ids:['volume-0','volume-1'],scope:'host'});if(shared.status!=='completed')throw Error('量价工具未实际进入共享文档')
    await bench.frame();if(!bench.charts.every((c:any)=>['volume-0','volume-1'].every(id=>c.getDrawingState().analytics[id]?.status==='ready')))throw Error('共享图未独立计算量价工具')
    bench.charts[1].startReplay(9800);await bench.frame();if(!bench.charts[1].getDrawingState().analytics['volume-1']?.replayPartial)throw Error('清理验收没有进入真实回放前缀')
    bench.charts[1].stopReplay();await bench.frame()
    await bench.charts[0].executeDrawingCommand({type:'select',ids:['bench-0000']})
   }
   return {cycle:++cycle,subscribers,connections:connections.size}
  },
  async releaseFirst(){
   bench.charts[0].dispose();bench.charts.shift();await resources.preferences.read('borrowed-remains',new AbortController().signal);await resources.registry.bind(resources.resolution)
   if(connections.size!==2||subscribers!==1)throw Error('第一个借用者释放影响了所有者资源 '+JSON.stringify({connections:connections.size,subscribers}))
   return {connections:connections.size,subscribers}
  },
  async finish(){const cleanup=await bench.dispose();cacheLeaks=analytics.filter(x=>drawingAnalyticsRuntimes.has(x.chart)||x.runtime?.size!==0).length+curveCharts.filter(hasCurveGeometry).length;analytics=[];curveCharts=[];resources.registry.dispose();resources.preferences.dispose();resources.documents.dispose();await new Promise<void>((resolve,reject)=>{const request=indexedDB.deleteDatabase(resources.databaseName);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('清理存储仍有连接'))});resources=undefined;return cleanup},
  report(hasGC:boolean){for(let i=listeners.length-1;i>=0;i--)if(!listeners[i].target.deref())listeners.splice(i,1);const active=listeners.filter(x=>{const target=x.target.deref();return target&&(hasGC||target===window||target===document||target.isConnected)});return {caches:cacheLeaks,listeners:active.length,timers:timers.size,frames:frames.size,observers:observers.size,subscribers,connections:connections.size,editors:document.querySelectorAll('.tc-drawing-context,.tc-drawing-workbench,.tc-drawing-handle,.tc-drawing-color-palette,[role=dialog]').length,details:active.map(x=>({type:x.type,target:x.target.deref()?.constructor.name,source:x.source}))}},
  restore(){EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;window.setTimeout=timeout;window.clearTimeout=clearTimeout;window.setInterval=interval;window.clearInterval=clearInterval;window.requestAnimationFrame=raf;window.cancelAnimationFrame=cancelRaf;window.ResizeObserver=Observer;IDBFactory.prototype.open=open;IDBDatabase.prototype.close=close;DrawingSession.prototype.subscribe=subscribe}
 }
}
