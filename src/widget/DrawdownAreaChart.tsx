'use client';

import * as React from 'react'

export interface DrawdownPoint {
  timestamp: string
  drawdown_pct?: number | null
}

export interface DrawdownAreaChartProps {
  series: ReadonlyArray<DrawdownPoint>
  height?: number
  className?: string
}

const WIDTH = 720
const DEFAULT_HEIGHT = 220
const PAD_X = 44
const PAD_Y = 24

const finite = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value)
)

const pathFromPoints = (points: ReadonlyArray<[number, number]>): string => (
  points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
)

export function DrawdownAreaChart (props: DrawdownAreaChartProps): React.ReactElement {
  const height = props.height ?? DEFAULT_HEIGHT
  const usableWidth = WIDTH - PAD_X * 2
  const usableHeight = height - PAD_Y * 2
  const values = props.series.map(point => point.drawdown_pct).filter(finite)
  const minValue = Math.min(...values, -0.01)
  const maxValue = Math.max(...values, 0)
  const range = Math.max(maxValue - minValue, 0.01)
  const yFor = (value: number) => PAD_Y + (maxValue - value) / range * usableHeight
  const xFor = (index: number) => {
    if (props.series.length <= 1) {
      return PAD_X + usableWidth / 2
    }
    return PAD_X + index / (props.series.length - 1) * usableWidth
  }
  const points = props.series
    .map((point, index): [number, number] | null => (
      finite(point.drawdown_pct) ? [xFor(index), yFor(point.drawdown_pct)] : null
    ))
    .filter((point): point is [number, number] => point !== null)
  const zeroY = yFor(0)
  const linePath = points.length > 0 ? pathFromPoints(points) : ''
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1][0].toFixed(2)} ${zeroY.toFixed(2)} L ${points[0][0].toFixed(2)} ${zeroY.toFixed(2)} Z`
    : ''
  const latest = values.at(-1)

  return React.createElement(
    'div',
    {
      className: props.className,
      'data-testid': 'drawdown-area-chart',
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
      React.createElement('strong', { style: { fontSize: 14, color: '#172033' } }, 'Drawdown Trajectory'),
      React.createElement(
        'span',
        { style: { fontSize: 12, color: '#b42318' } },
        latest !== undefined ? `当前 ${(latest * 100).toFixed(2)}%` : '暂无数据'
      )
    ),
    React.createElement(
      'svg',
      {
        role: 'img',
        'aria-label': 'drawdown underwater area chart',
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
        fill: '#fff7f7',
        stroke: '#fee4e2'
      }),
      React.createElement('line', {
        x1: PAD_X,
        x2: WIDTH - PAD_X,
        y1: zeroY,
        y2: zeroY,
        stroke: '#667085',
        strokeWidth: 1
      }),
      areaPath
        ? React.createElement('path', {
          d: areaPath,
          fill: 'rgba(217, 45, 32, 0.22)',
          stroke: 'none'
        })
        : null,
      linePath
        ? React.createElement('path', {
          d: linePath,
          fill: 'none',
          stroke: '#d92d20',
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
        }, '暂无 drawdown 数据'),
      points.map(([x, y], index) => React.createElement('circle', {
        key: `${props.series[index]?.timestamp ?? index}-${index}`,
        cx: x,
        cy: y,
        r: 3.5,
        fill: '#d92d20'
      }))
    )
  )
}
