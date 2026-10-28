export type FibonacciKind='fibonacciLine'|'fibonacciExtension'
export function fibonacciLevelPrice(kind:FibonacciKind,values:readonly number[],ratio:number,mode:'linear'|'log',reverse:boolean):number {
 if(values.length!==(kind==='fibonacciLine'?2:3))throw Error('级别锚点数量无效')
 if(!Number.isFinite(ratio)||values.some(value=>!Number.isFinite(value)))throw Error('级别比例或锚点不是有限数值')
 const [a,b,c]=values
 if(mode==='log'&&values.some(value=>value<=0))throw Error('对数计算需要所有价格锚点大于零')
 const start=reverse?b:a,end=reverse?a:b
 const result=kind==='fibonacciLine'
  ?mode==='log'?Math.exp(Math.log(end)+(Math.log(start)-Math.log(end))*ratio):end+(start-end)*ratio
  :mode==='log'?Math.exp(Math.log(c)+(Math.log(b)-Math.log(a))*ratio*(reverse?-1:1)):c+(b-a)*ratio*(reverse?-1:1)
 if(!Number.isFinite(result)||mode==='log'&&result<=0)throw Error('级别结果超出有限数值范围')
 return result
}

/** Closed market-time domain; omitted boundaries extend to infinity. */
export function fibonacciLevelDomain(kind:FibonacciKind,timestamps:readonly number[],extendLeft:boolean,extendRight:boolean):{from?:number;to?:number} {
 if(timestamps.length!==(kind==='fibonacciLine'?2:3)||timestamps.some(value=>!Number.isFinite(value)))throw Error('级别时间锚点无效')
 const endpoints=kind==='fibonacciLine'?timestamps.slice(0,2):timestamps.slice(1,3)
 return {...(extendLeft?{}:{from:Math.min(...endpoints)}),...(extendRight?{}:{to:Math.max(...endpoints)})}
}
