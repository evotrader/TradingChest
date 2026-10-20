import {getFigureClass,type Coordinate,type OverlayFigure,type Overlay} from 'klinecharts'

/** Reuse the exact rendered figures and native hit tests, including custom figures. */
export function drawingFigureHit(point:Coordinate,figures:OverlayFigure[],defaults:Record<string,unknown>,own:Overlay['styles'],event:'onPressedMoveStart'|'onRightClick'):boolean {
  for(const figure of figures){
    if(figure.ignoreEvent===true||Array.isArray(figure.ignoreEvent)&&figure.ignoreEvent.includes(event))continue
    const Figure=getFigureClass(figure.type)
    if(!Figure)continue
    const styles={...(defaults as any)[figure.type],...(own as any)?.[figure.type],...(figure.styles as object)}
    for(const attrs of [figure.attrs].flat()){
      // KLineCharts 10.1 FigureImp exposes the same hit method used by its event router.
      const shape=new Figure({name:figure.type,attrs,styles}) as unknown as {checkEventOn:(coordinate:Coordinate)=>boolean}
      if(shape.checkEventOn(point))return true
    }
  }
  return false
}
