import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const sockets=vi.hoisted(()=>[] as any[])
vi.mock('../ReconnectingWebSocket',()=>({ReconnectingWebSocket:class {
  send=vi.fn();close=vi.fn();onopen:any;onmessage:any;onclose:any;onerror:any;onreconnect:any;
  constructor(public url:string){sockets.push(this)}
}}))
import DefaultDatafeed from '../../DefaultDatafeed'
const s={ticker:'A',market:'stocks'},p={multiplier:1,timespan:'minute',text:'1m'}
const emit=(socket:any,messages:unknown)=>socket.onmessage({data:JSON.stringify(messages)})
const agg=(sym='A',time=60000)=>({ev:'AM',sym,s:time,o:10,h:12,l:8,c:11,v:2,vw:10.5})
beforeEach(()=>{sockets.length=0})
afterEach(()=>vi.unstubAllGlobals())
describe('default demo protocol boundaries',()=>{
  it('authenticates before AM subscription and consumes every aggregate in a batch',()=>{
    const feed=new DefaultDatafeed('fixture',{adjusted:false});const callback=vi.fn()
    feed.subscribe(s,p,callback);const ws=sockets[0];ws.onopen()
    expect(ws.send.mock.calls.map((x:any)=>JSON.parse(x[0]).action)).toEqual(['auth'])
    emit(ws,[{ev:'status',status:'auth_success'},agg(),agg('A',120000)])
    expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({action:'subscribe',params:'AM.A'})
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback.mock.calls[0][0]).toMatchObject({volume:2,providerVwap:10.5})
    expect(callback.mock.calls[0][0].turnover).toBeUndefined()
  })
  it('ignores trade events and other tickers; a pre-auth switch subscribes only the latest ticker',()=>{
    const feed=new DefaultDatafeed('fixture',{adjusted:false});const a=vi.fn(),b=vi.fn()
    feed.subscribe(s,p,a);feed.subscribe({...s,ticker:'B'},p,b)
    const ws=sockets[0];ws.onopen();emit(ws,[{ev:'status',status:'auth_success'}])
    expect(JSON.parse(ws.send.mock.calls[1][0]).params).toBe('AM.B')
    emit(ws,[agg('A'),{...agg('B'),ev:'T'},agg('B')])
    expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledTimes(1)
  })
  it('reauthenticates and resubscribes the current ticker after reconnect',()=>{
    const feed=new DefaultDatafeed('fixture',{adjusted:false});feed.subscribe(s,p,vi.fn())
    const ws=sockets[0];ws.onopen();emit(ws,[{ev:'status',status:'auth_success'}])
    feed.subscribe({...s,ticker:'B'},p,vi.fn());ws.onclose();ws.send.mockClear();ws.onopen()
    expect(ws.send).toHaveBeenCalledTimes(1);emit(ws,[{ev:'status',status:'auth_success'}])
    expect(JSON.parse(ws.send.mock.calls[1][0]).params).toBe('AM.B')
  })
  it('explicitly refuses unsupported periods/markets/adjustment',()=>{
    for(const [symbol,period,adjusted] of [[s,{...p,multiplier:5},false],[{...s,market:'crypto'},p,false],[s,p,true]] as const){
      const state=vi.fn();new DefaultDatafeed('fixture',{adjusted,onConnectionStateChange:state}).subscribe(symbol,period,vi.fn())
      expect(state).toHaveBeenLastCalledWith('failed',expect.any(Object))
    }
    expect(sockets).toHaveLength(0)
  })
  it('does not deliver after unsubscribe/dispose or authentication failure',()=>{
    const feed=new DefaultDatafeed('fixture',{adjusted:false});const callback=vi.fn();feed.subscribe(s,p,callback)
    const ws=sockets[0];ws.onopen();emit(ws,[{ev:'status',status:'auth_success'}]);feed.unsubscribe(s,p);emit(ws,[agg()])
    expect(callback).not.toHaveBeenCalled();feed.subscribe(s,p,callback);emit(ws,[{ev:'status',status:'auth_failed'},agg()])
    expect(callback).not.toHaveBeenCalled();feed.dispose();emit(ws,[{ev:'status',status:'auth_success'},agg()]);expect(callback).not.toHaveBeenCalled()
    expect(ws.close).toHaveBeenCalledTimes(1)
  })
  it('requests explicit historical adjustment and never interprets vw as turnover',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({results:[{t:1,o:10,h:12,l:8,c:11,v:2,vw:10.5}]})})
    vi.stubGlobal('fetch',fetch)
    const result=await new DefaultDatafeed('fixture',{adjusted:false}).getHistoryKLineData(s,p,0,10)
    expect(fetch.mock.calls[0][0]).toContain('adjusted=false&sort=asc')
    expect(result[0].providerVwap).toBe(10.5);expect(result[0].turnover).toBeUndefined()
  })
  it('does not disguise HTTP/permission/pagination errors as an empty market',async()=>{
    for(const response of [{ok:false,status:403},{ok:true,json:async()=>({status:'NOT_AUTHORIZED'})},{ok:true,json:async()=>({results:[],next_url:'unused'})}]){
      vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response))
      await expect(new DefaultDatafeed('fixture').getHistoryKLineData(s,p,0,10)).rejects.toThrow()
    }
  })
})
