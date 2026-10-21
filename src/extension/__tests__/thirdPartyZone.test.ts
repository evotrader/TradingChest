// @vitest-environment jsdom
import {it as test} from 'vitest'
import assert from 'node:assert/strict'
import {getOverlayClass} from 'klinecharts'
import {analysisZoneDescriptor} from '../../../examples/drawing-workbench/analysis-zone.mjs'
test('peer-registered analysis zone consumes standard geometry, styles and parameters',()=>{
 const Definition=getOverlayClass(analysisZoneDescriptor.overlayName);assert.ok(Definition)
 const overlay=new Definition();overlay.points=[{timestamp:1,value:10},{timestamp:2,value:20}];overlay.extendData={drawingParameters:{label:'支撑区',midline:false}};overlay.styles={polygon:{color:'#f4433620'},text:{color:'#2196f3',size:18}}
 const figures=overlay.createPointFigures({overlay,coordinates:[{x:10,y:20},{x:100,y:80}]})
 assert.equal(overlay.totalStep,3);assert.deepEqual(figures.map(f=>f.type),['polygon','text']);assert.equal(figures[1].attrs.text,'支撑区')
 overlay.extendData.drawingParameters.midline=true;assert.equal(overlay.createPointFigures({overlay,coordinates:[{x:10,y:20},{x:100,y:80}]}).filter(f=>f.type==='line').length,1)
 assert.deepEqual(analysisZoneDescriptor.styleControls,['stroke','fill','lineWidth','lineStyle','textColor','fontSize'])
})
