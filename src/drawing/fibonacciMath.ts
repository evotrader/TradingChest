import {preciseLogarithmicPrice} from '../core/logarithmicPrice'

export type FibonacciKind='fibonacciLine'|'fibonacciExtension'
export function fibonacciLevelPrice(kind:FibonacciKind,values:readonly number[],ratio:number,mode:'linear'|'log',reverse:boolean):number {
 if(values.length!==(kind==='fibonacciLine'?2:3))throw Error('级别锚点数量无效')
 if(!Number.isFinite(ratio)||values.some(value=>!Number.isFinite(value)))throw Error('级别比例或锚点不是有限数值')
 const [a,b,c]=values
 if(mode==='log'&&values.some(value=>value<=0))throw Error('对数计算需要所有价格锚点大于零')
 const start=reverse?b:a,end=reverse?a:b
 const result=mode==='log'?logarithmicLevel(kind,start,end,a,b,c,ratio,reverse):kind==='fibonacciLine'?end+(start-end)*ratio:c+(b-a)*ratio*(reverse?-1:1)
 if(!Number.isFinite(result)||mode==='log'&&result<=0)throw Error('级别结果超出有限数值范围')
 return result
}

function logarithmicLevel(kind:FibonacciKind,start:number,end:number,a:number,b:number,c:number,ratio:number,reverse:boolean):number {
 if(kind==='fibonacciLine')return ratio===0||start===end?end:ratio===1?start:preciseLogarithmicPrice(end,end,start,ratio)
 return ratio===0||a===b?c:preciseLogarithmicPrice(c,a,b,ratio*(reverse?-1:1))
}

/** Closed market-time domain; omitted boundaries extend to infinity. */
export function fibonacciLevelDomain(kind:FibonacciKind,timestamps:readonly number[],extendLeft:boolean,extendRight:boolean):{from?:number;to?:number} {
 if(timestamps.length!==(kind==='fibonacciLine'?2:3)||timestamps.some(value=>!Number.isFinite(value)))throw Error('级别时间锚点无效')
 const endpoints=kind==='fibonacciLine'?timestamps.slice(0,2):timestamps.slice(1,3)
 return {...(extendLeft?{}:{from:Math.min(...endpoints)}),...(extendRight?{}:{to:Math.max(...endpoints)})}
}
