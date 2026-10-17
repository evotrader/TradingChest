import type {Chart,IndicatorCreateTooltipDataSourceCallback,Indicator} from 'klinecharts'
import type {IndicatorDescriptor} from './catalog'
const originalTooltip=Symbol('trading-chest-original-tooltip')
type OwnedTooltip=IndicatorCreateTooltipDataSourceCallback<unknown>&{[originalTooltip]?:IndicatorCreateTooltipDataSourceCallback<unknown>|null}
/** Preserve template legends/units and install the same instance controls after add or restore. */
export function configureIndicatorTooltip(chart:Chart,indicator:Indicator,descriptor:IndicatorDescriptor):void {
  const existing=indicator.createTooltipDataSource as OwnedTooltip|null
  const original=existing&&originalTooltip in existing?existing[originalTooltip]??null:existing
  const allowSettings=!!descriptor.parameters
  const wrapped=((params:Parameters<IndicatorCreateTooltipDataSourceCallback<unknown>>[0])=>{
    const content=original?.(params),defaults=params.chart.getStyles().indicator.tooltip.features
    const features=[defaults[params.indicator.visible?1:0],...(allowSettings?[defaults[2]]:[]),defaults[3]].filter(Boolean)
    return {...content,features:[...(content?.features??[]).filter(f=>!['visible','invisible','setting','close'].includes(f.id)),...features]}
  }) as OwnedTooltip
  wrapped[originalTooltip]=original
  chart.overrideIndicator({id:indicator.id,name:indicator.name,createTooltipDataSource:wrapped})
}
