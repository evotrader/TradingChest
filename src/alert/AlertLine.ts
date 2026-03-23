import { OverlayTemplate } from 'klinecharts'

const alertLine: OverlayTemplate = {
  name: 'alertLine',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    const color = (overlay.styles as any)?.line?.color ?? '#ff9800'
    if (coordinates.length < 1) return []
    const y = coordinates[0].y
    return [
      {
        type: 'line',
        attrs: { coordinates: [{ x: 0, y }, { x: 999999, y }] },
        styles: {
          color,
          size: 1,
          style: 'dashed',
          dashedValue: [6, 4]
        }
      }
    ]
  }
}

export default alertLine
