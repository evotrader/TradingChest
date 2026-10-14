import { describe, expect, it } from 'vitest'
import { calculateSessionVwap, sessionVwap, sessionVwapApprox, type SessionKLineData } from '../volume/sessionVwap'
const bar = (timestamp: string, id: string, start = false, extra: Partial<SessionKLineData> = {}): SessionKLineData => ({
  timestamp: Date.parse(timestamp), open: 10, high: 12, low: 8, close: 10, volume: 2, turnover: 20,
  session: {seriesId:'X/TEST/1m/raw/CNY/regular',id,start,complete:true}, ...extra
})
const values = (data: SessionKLineData[]) => calculateSessionVwap(data).map(x => x.vwap)
describe('explicit provider session VWAP', () => {
  it('uses cumulative amount / cumulative volume, not the mean of bar VWAPs', () => {
    expect(values([bar('2026-10-13T01:30Z','CN13',true),bar('2026-10-13T01:31Z','CN13',false,{volume:6,turnover:120})])).toEqual([10,17.5])
  })
  it('keeps the same session across a lunch break', () => {
    expect(values([bar('2026-10-13T03:29Z','CN13',true),bar('2026-10-13T05:00Z','CN13',false,{turnover:40})])).toEqual([10,15])
  })
  it('keeps an overnight session across UTC and local midnight', () => {
    expect(values([bar('2026-10-13T15:59Z','NIGHT14',true),bar('2026-10-14T00:01Z','NIGHT14',false,{turnover:40})])).toEqual([10,15])
  })
  it('resets on exchange sessions across daylight-saving changes', () => {
    expect(values([bar('2026-10-30T13:30Z','US30',true),bar('2026-11-02T14:30Z','US02',true,{turnover:40})])).toEqual([10,20])
  })
  it('does not pretend a mid-session loaded window is a full-session VWAP', () => {
    expect(values([bar('2026-10-13T02:00Z','CN13'),bar('2026-10-13T02:01Z','CN13')])).toEqual([undefined,undefined])
  })
  it('recovers only at a known next session after a coverage gap', () => {
    const a=bar('2026-10-13T01:30Z','CN13',true)
    const gap=bar('2026-10-13T01:31Z','CN13'); gap.session!.complete=false
    expect(values([a,gap,bar('2026-10-13T01:32Z','CN13'),bar('2026-10-14T01:30Z','CN14',true)])).toEqual([10,undefined,undefined,10])
  })
  it('does not fall back to typical price when turnover is missing', () => {
    expect(values([bar('2026-10-13T01:30Z','CN13',true,{turnover:undefined})])).toEqual([undefined])
  })
  it('requires explicit approximation and labels it', () => {
    const data=[bar('2026-10-13T01:30Z','CN13',true,{turnover:undefined})]
    expect(calculateSessionVwap(data,'typical-price')).toEqual([{vwap:10,quality:'approximate'}])
    expect(sessionVwap.name).not.toBe(sessionVwapApprox.name)
    expect(sessionVwapApprox.shortName).toContain('approx')
  })
  it('treats leading zero volume as unavailable but allows later trading', () => {
    expect(values([bar('2026-10-13T01:30Z','CN13',true,{volume:0,turnover:0}),bar('2026-10-13T01:31Z','CN13')])).toEqual([undefined,10])
  })
  it('does not change a valid weighted value for a zero-volume bar', () => {
    expect(values([bar('2026-10-13T01:30Z','CN13',true),bar('2026-10-13T01:31Z','CN13',false,{volume:0,turnover:0})])).toEqual([10,10])
  })
  it.each([NaN,Infinity,-1])('invalid volume %s taints the session', volume => {
    expect(values([bar('2026-10-13T01:30Z','CN13',true,{volume}),bar('2026-10-13T01:31Z','CN13')])).toEqual([undefined,undefined])
  })
  it('preserves finite negative prices instead of treating them as missing', () => {
    const data=[bar('2026-10-13T01:30Z','FUT13',true,{open:-10,high:-8,low:-12,close:-10,turnover:-20})]
    expect(values(data)).toEqual([-10])
    expect(calculateSessionVwap(data,'typical-price')[0].vwap).toBe(-10)
  })
  it('does not double count duplicate bars or infer identity for bare OHLCV', () => {
    const a=bar('2026-10-13T01:30Z','CN13',true)
    expect(values([a,a])).toEqual([10,undefined])
    expect(values([{...a,session:undefined}])).toEqual([undefined])
  })
})
