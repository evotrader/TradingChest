import {describe,it,expect} from 'vitest'
import {ellipseCoordinates,rotatedRectangle,screenAngle,default as tools} from '../workbenchTools'
describe('drawing geometry uses independent screen-space expectations',()=>{
  it('projects rectangle width perpendicular to its chosen edge',()=>{
    expect(rotatedRectangle({x:0,y:0},{x:4,y:0},{x:7,y:3})).toEqual([{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}])
    expect(rotatedRectangle({x:0,y:0},{x:0,y:4},{x:-3,y:7})).toEqual([{x:0,y:0},{x:0,y:4},{x:-3,y:4},{x:-3,y:0}])
    expect(rotatedRectangle({x:1,y:1},{x:1,y:1},{x:2,y:2})).toEqual([])
  })
  it('keeps an ellipse inside its two-point bounds with four exact extrema',()=>{
    const points=ellipseCoordinates({x:2,y:4},{x:10,y:8})
    expect(points[0]).toEqual({x:10,y:6});expect(points[16].x).toBeCloseTo(6);expect(points[16].y).toBe(8)
    expect(points[32].x).toBe(2);expect(points[48].y).toBe(4)
  })
  it('reports screen angles without pretending to measure financial slopes',()=>{
    expect(screenAngle({x:0,y:0},{x:4,y:-4})).toBe(45)
    expect(screenAngle({x:0,y:0},{x:4,y:4})).toBe(-45)
  })
  it('registers eight real distinct templates including continuous highlighting',()=>{
    expect(new Set(tools.map(t=>t.name)).size).toBe(8)
    expect(tools.find(t=>t.name==='highlighter')).toMatchObject({drawingMode:'continuous',totalStep:2})
    for(const tool of tools)expect(tool.createPointFigures).toBeTypeOf('function')
  })
})
