import type {OverlayTemplate} from 'klinecharts'
import {fibonacciLevelFigures} from './fibonacciLevels'

const fibonacciLine:OverlayTemplate={name:'fibonacciLine',totalStep:3,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,
  createPointFigures:args=>fibonacciLevelFigures(args,'fibonacciLine')}
export default fibonacciLine
