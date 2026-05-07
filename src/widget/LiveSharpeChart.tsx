'use client';

import * as React from 'react'

export interface LiveSharpePoint {
  timestamp: string
  live_sharpe?: number | null
  backtest_sharpe?: number | null
  ratio?: number | null
  sample_days?: number | null
}

export interface LiveSharpeChartProps {
  series: ReadonlyArray<LiveSharpePoint>
  threshold?: number
  height?: number
  className?: string
}

const WIDTH = 720
const DEFAULT_HEIGHT = 240
const PAD_X = 44
const PAD_Y = 26

const finite = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value)
)

const formatValue = (value: number): string => value.toFixed(2)

const pathFromPoints = (points: ReadonlyArray<[number, number]>): string => (
  points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
)

export function LiveSharpeChart (props: LiveSharpeChartProps): React.ReactElement {
  // charter D-03 + L-25 — DO NOT change the default M+1 threshold to mask bad live evidence.
  const threshold = props.threshold ?? 0.7
  const height = props.height ?? DEFAULT_HEIGHT
  const usableWidth = WIDTH - PAD_X * 2
  const usableHeight = height - PAD_Y * 2
  const values = props.series
    .map(point => point.ratio ?? point.live_sharpe)
    .filter(finite)
  const minValue = Math.min(threshold, ...values, 0)
  const maxValue = Math.max(threshold, ...values, 1)
  const range = Math.max(maxValue - minValue, 0.01)
  const yFor = (value: number) => PAD_Y + (maxValue - value) / range * usableHeight
  const xFor = (index: number) => {
    if (props.series.length <= 1) {
      return PAD_X + usableWidth / 2
    }
    return PAD_X + index / (props.series.length - 1) * usableWidth
  }
  const points = props.series
    .map((point, index): [number, number] | null => {
      const value = point.ratio ?? point.live_sharpe
      return finite(value) ? [xFor(index), yFor(value)] : null
    })
    .filter((point): point is [number, number] => point !== null)
  const linePath = points.length > 0 ? pathFromPoints(points) : ''
  const thresholdY = yFor(threshold)
  const latest = values.at(-1)

  return React.createElement(
    'div',
    {
      className: props.className,
      'data-testid': 'live-sharpe-chart',
      style: {
        border: '1px solid #d7dde8',
        borderRadius: 8,
        background: '#ffffff',
        padding: 12,
        minHeight: height + 24
      }
    },
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8
        }
      },
      React.createElement('strong', { style: { fontSize: 14, color: '#172033' } }, 'Rolling 60D Sharpe / Ratio'),
      React.createElement(
        'span',
        { style: { fontSize: 12, color: latest !== undefined && latest >= threshold ? '#0f766e' : '#b42318' } },
        latest !== undefined ? `当前 ${formatValue(latest)} / 阈值 ${formatValue(threshold)}` : '暂无数据'
      )
    ),
    React.createElement(
      'svg',
      {
        role: 'img',
        'aria-label': 'rolling 60 day sharpe ratio chart',
        viewBox: `0 0 ${WIDTH} ${height}`,
        width: '100%',
        height,
        preserveAspectRatio: 'none'
      },
      React.createElement('rect', {
        x: PAD_X,
        y: PAD_Y,
        width: usableWidth,
        height: usableHeight,
        fill: '#f8fafc',
        stroke: '#e2e8f0'
      }),
      React.createElement('line', {
        x1: PAD_X,
        x2: WIDTH - PAD_X,
        y1: thresholdY,
        y2: thresholdY,
        stroke: '#d92d20',
        strokeDasharray: '5 5',
        strokeWidth: 2
      }),
      React.createElement('text', {
        x: WIDTH - PAD_X,
        y: Math.max(14, thresholdY - 8),
        textAnchor: 'end',
        fill: '#b42318',
        fontSize: 12
      }, `M+1 ${formatValue(threshold)}`),
      linePath
        ? React.createElement('path', {
          d: linePath,
          fill: 'none',
          stroke: '#2563eb',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeWidth: 3
        })
        : React.createElement('text', {
          x: WIDTH / 2,
          y: height / 2,
          textAnchor: 'middle',
          fill: '#667085',
          fontSize: 13
        }, '暂无 LIVE 观察数据'),
      points.map(([x, y], index) => React.createElement('circle', {
        key: `${props.series[index]?.timestamp ?? index}-${index}`,
        cx: x,
        cy: y,
        r: 3.5,
        fill: '#2563eb'
      }))
    )
  )
}
