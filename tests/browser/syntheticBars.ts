/** Deterministic, explicitly synthetic inputs; never imported by product code. */
export const makeBars = (count: number) => Array.from({length:count},(_,i)=> {
  const close = 100 + Math.sin(i/7)*10 + i/1000, open = close + Math.cos(i/3)
  return {timestamp:1700000000000+i*60000,open,close,high:Math.max(open,close)+2,low:Math.min(open,close)-2,volume:i%17===0?0:100+i%31,turnover:(100+i%31)*close}
})
export function oracleInputs() {
  const bars=makeBars(160)
  return {short:bars.slice(0,3),full:bars,same:[...bars.slice(0,-1),{...bars.at(-1)!,close:bars.at(-1)!.close+0.1}],append:[...bars,{...bars.at(-1)!,timestamp:bars.at(-1)!.timestamp+60000}],prepend:[...makeBars(20).map(bar=>({...bar,timestamp:bar.timestamp-20*60000})),...bars]}
}
