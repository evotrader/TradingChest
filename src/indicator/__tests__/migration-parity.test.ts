import {describe,it,expect} from 'vitest'
import oracle from './fixtures/v9-oracle.json'
import {indicatorLoaders} from '../loaders'
import chartTypes from '../../chartType'
import trade from '../trade/tradeVisualization'
import {oracleInputs} from '../../../tests/browser/syntheticBars'

const normalized = (value: unknown) => JSON.parse(JSON.stringify(value))
describe('v9 recorded custom algorithm parity',()=>{
  const inputs=oracleInputs(),bars=inputs.full
  const templates={...indicatorLoaders,...Object.fromEntries([...chartTypes,trade].map(t=>[t.name,async()=>t]))}
  for(const [name,load] of Object.entries(templates))it(name,async()=>{
    const expected=oracle.indicators[name as keyof typeof oracle.indicators]
    expect(expected,`v9 oracle missing ${name}`).toBeDefined()
    const template=await load()
    for(const parameter of ['default','alternate'] as const)for(const [scenario,input] of Object.entries(inputs)) {
      const instance={...template,calcParams:expected[parameter==='default'?'defaults':'alternate'],extendData:{trades:[{entryTs:bars[5].timestamp,exitTs:bars[12].timestamp,entryPrice:bars[5].close,exitPrice:bars[12].close,pnl:1,direction:'long'}],_instanceId:'migration-oracle'}}
      const actual=await template.calc(input,instance as any)
      expect(normalized(actual),`${name} ${parameter}/${scenario}`).toEqual(expected.cases[`${parameter}/${scenario}` as keyof typeof expected.cases])
    }
  })
})
