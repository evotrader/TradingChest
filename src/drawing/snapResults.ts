import type {Chart,Indicator} from 'klinecharts'

type Calculation=Indicator['calc']
interface ResultState {delegate:Calculation;wrapper:Calculation;generation:number;pending:boolean;key?:string;result?:Indicator['result']}

/** Observe actual native calculations, without calculating or publishing a second result. */
export class DrawingSnapResults {
 private chart:Chart|undefined
 private readKey:(()=>string|undefined)|undefined
 private states=new WeakMap<Indicator,ResultState>()
 private originalCreate:Chart['createIndicator']|undefined
 private originalOverride:Chart['overrideIndicator']|undefined
 private wrappedCreate:Chart['createIndicator']|undefined
 private wrappedOverride:Chart['overrideIndicator']|undefined
 constructor(chart:Chart,readKey:()=>string|undefined){
  this.chart=chart;this.readKey=readKey
  const owner=this,create=chart.createIndicator,override=chart.overrideIndicator
  this.originalCreate=create;this.originalOverride=override
  this.wrappedCreate=function(...args){const result=create.apply(this,args);owner.observe();return result}
  this.wrappedOverride=function(...args){const result=override.apply(this,args);owner.observe();return result}
  chart.createIndicator=this.wrappedCreate;chart.overrideIndicator=this.wrappedOverride
  this.observe()
 }
 private observe():void {
  for(const indicator of this.chart?.getIndicators()??[]){
   if(this.states.get(indicator)?.wrapper===indicator.calc)continue
   const owner=this,delegate=indicator.calc
   const state:ResultState={delegate,wrapper:undefined!,generation:0,pending:true}
   const wrapper:Calculation=function(this:Indicator,...args){
    const generation=++state.generation,key=owner.readKey?.();state.pending=true;state.result=undefined;state.key=undefined
    const accept=(result:Indicator['result'])=>{if(owner.chart&&generation===state.generation){state.pending=false;state.result=result;state.key=key}return result}
    const reject=(error:unknown):never=>{if(generation===state.generation){state.pending=false;state.result=undefined;state.key=undefined}throw error}
    try{
     const result=delegate.apply(this,args)
     return result&&typeof (result as Promise<Indicator['result']>).then==='function'?Promise.resolve(result).then(accept,reject):accept(result as Indicator['result'])
    }catch(error){return reject(error)}
   }
   state.wrapper=wrapper;this.states.set(indicator,state);indicator.calc=wrapper
  }
 }
 getCurrent(indicator:Indicator):Indicator['result']|undefined {
  const state=this.states.get(indicator),key=this.readKey?.()
  return key!==undefined&&state&&!state.pending&&state.key===key&&indicator.calc===state.wrapper&&indicator.result===state.result?state.result:undefined
 }
 dispose():void {
  const chart=this.chart
  if(chart){
   if(chart.createIndicator===this.wrappedCreate)chart.createIndicator=this.originalCreate!
   if(chart.overrideIndicator===this.wrappedOverride)chart.overrideIndicator=this.originalOverride!
   for(const indicator of chart.getIndicators()){const state=this.states.get(indicator);if(state&&indicator.calc===state.wrapper)indicator.calc=state.delegate}
  }
  this.chart=undefined;this.readKey=undefined;this.states=new WeakMap();this.originalCreate=undefined;this.originalOverride=undefined;this.wrappedCreate=undefined;this.wrappedOverride=undefined
 }
}
