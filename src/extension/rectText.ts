import { type FigureTemplate, type TextAttrs, type TextStyle, getFigureClass, utils } from 'klinecharts'

// Preserve the serialized name and share v10 text bounds for drawing and hit testing.
const rectText: FigureTemplate<TextAttrs | TextAttrs[], Partial<TextStyle>> = {
  name: 'rectText',
  checkEventOn: utils.checkCoordinateOnText,
  draw: (ctx, attrs, styles) => {
    const Text = getFigureClass<TextAttrs | TextAttrs[], Partial<TextStyle>>('text')!
    new Text({name:'text',attrs,styles}).draw(ctx)
  }
}
export default rectText
