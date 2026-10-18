import {createApp,defineComponent,h,onMounted,onUnmounted,ref} from 'vue'
import 'trading-chest/dist/trading-chest.css'
const metrics={created:0,disposed:0,subscriptions:0}
const Chart=defineComponent({setup(){
  const host=ref(null),error=ref('');let disposed=false,chart
  onMounted(async()=>{
    try{
      const {KLineChartPro}=await import('trading-chest/chart')
      if(disposed)return
      const bars=Array.from({length:300},(_,i)=>({timestamp:1700000000000+i*86400000,open:100+i,high:102+i,low:99+i,close:101+i,volume:1000}))
      metrics.created++;let subscribed=false
      chart=new KLineChartPro({container:host.value,symbol:{ticker:'SYNTHETIC-VUE'},period:{multiplier:1,timespan:'day',text:'1d'},mainIndicators:[],subIndicators:[],datafeed:{
        searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,q)=>{const all=bars.filter(b=>q.kind==='before'?b.timestamp<q.before:b.timestamp>=q.from&&b.timestamp<q.to);return {bars:q.kind==='before'?all.slice(-q.countBack):all,hasMoreBefore:q.kind==='before'?all.length>q.countBack:undefined}},
        subscribe:()=>{if(!subscribed){subscribed=true;metrics.subscriptions++}},unsubscribe:()=>{if(subscribed){subscribed=false;metrics.subscriptions--}},dispose:()=>{metrics.disposed++}
      },onError:e=>{if(!disposed)error.value=e.message}})
      window.tcVue.chart=chart
    }catch(reason){if(!disposed)error.value=reason.message}
  })
  onUnmounted(()=>{disposed=true;chart?.dispose();window.tcVue.chart=null})
  return()=>h('div',[error.value&&h('p',{role:'alert'},error.value),h('div',{ref:host,style:{height:'520px'}})])
}})
const App=defineComponent({setup(){const mounted=ref(true);window.tcVue={metrics,chart:null};return()=>h('main',[h('h1','TradingChest Vue'),h('p','隔离合成数据，不连接生产服务。'),h('button',{onClick:()=>mounted.value=!mounted.value},mounted.value?'卸载':'挂载'),mounted.value&&h(Chart)])}})
createApp(App).mount('#app')
