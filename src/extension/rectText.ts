import { type FigureTemplate, type TextAttrs, type TextStyle, utils } from 'klinecharts'

// KLineCharts 9.x registers its former rectText template only under the name text.
// Share its measured bounds for both drawing and pointer hit testing.
const rectText: FigureTemplate<TextAttrs | TextAttrs[], Partial<TextStyle>> = {
  name: 'rectText',
  checkEventOn: utils.checkCoordinateOnText,
  draw: utils.drawText
}

export default rectText
