import { describe, it, expect } from 'vitest'
import { LiveSharpeChart } from '../LiveSharpeChart'
import { DrawdownAreaChart } from '../DrawdownAreaChart'
function nodes(value: any): any[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (value && typeof value === 'object') return [value, ...nodes(value.props?.children)]
  return [value]
}
describe('financial display semantics', () => {
  it('never fills a ratio gap with absolute Sharpe', () => {
    const tree = nodes(LiveSharpeChart({series:[{timestamp:'a',ratio:0.5},{timestamp:'b',live_sharpe:8},{timestamp:'c',ratio:0.8}]}))
    expect(tree.filter(n => n?.type === 'circle')).toHaveLength(2)
    const path = tree.find(n => n?.type === 'path').props.d
    expect(path.match(/M /g)).toHaveLength(2)
    expect(path).not.toContain('L ')
    expect(tree).toContain('Rolling 60D Sharpe Ratio (Live / Backtest)')
  })
  it('supports explicit absolute Sharpe without changing the default threshold', () => {
    const tree = nodes(LiveSharpeChart({mode:'sharpe',series:[{timestamp:'a',ratio:0.5,live_sharpe:2}]}))
    expect(tree).toContain('Rolling 60D Live Sharpe')
    expect(tree).toContain('Threshold 0.70')
    expect(tree).toContain('当前 2.00 / 阈值 0.70')
  })
  it('does not fill drawdown areas across missing samples', () => {
    const tree = nodes(DrawdownAreaChart({series:[{timestamp:'a',drawdown_pct:0},{timestamp:'b',drawdown_pct:null},{timestamp:'c',drawdown_pct:-2}]}))
    const paths = tree.filter(n => n?.type === 'path')
    expect(paths).toHaveLength(2)
    for (const node of paths) expect(node.props.d.match(/M /g)).toHaveLength(2)
  })
  it('does not present an earlier finite sample as the current missing value', () => {
    const tree = nodes(LiveSharpeChart({mode:'ratio',series:[{timestamp:'a',ratio:0.8},{timestamp:'b',ratio:null}]}))
    expect(tree).toContain('暂无数据')
    expect(tree).not.toContain('当前 0.80 / 阈值 0.70')
  })

})
