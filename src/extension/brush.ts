import type {OverlayTemplate} from 'klinecharts'

/** The engine's continuous pipeline preserves sub-bar coordinates and commits on release. */
const brush:OverlayTemplate={name:'brush',totalStep:2,drawingMode:'continuous',needDefaultPointFigure:false,needDefaultXAxisFigure:false,needDefaultYAxisFigure:false,
  createPointFigures:({coordinates})=>coordinates.length<2?[]:[{type:'line',attrs:{coordinates},styles:{smooth:false,lineCap:'round',lineJoin:'round'}}]
}
export default brush
