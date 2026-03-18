/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific locale governing permissions and
 * limitations under the License.
 */

import i18n from '../../i18n'

export interface SettingOption {
  key: string
  text: any
  component: 'select' | 'switch' | 'color'
  dataSource?: Array<{ key: string, text: any }>
}

export interface SettingGroup {
  label: any
  options: SettingOption[]
}

export function getOptions (locale: string): SettingGroup[] {
  return [
    {
      label: i18n('group_candle', locale),
      options: [
        {
          key: 'candle.type',
          text: i18n('candle_type', locale),
          component: 'select',
          dataSource: [
            { key: 'candle_solid', text: i18n('candle_solid', locale) },
            { key: 'candle_stroke', text: i18n('candle_stroke', locale) },
            { key: 'candle_up_stroke', text: i18n('candle_up_stroke', locale) },
            { key: 'candle_down_stroke', text: i18n('candle_down_stroke', locale) },
            { key: 'ohlc', text: i18n('ohlc', locale) },
            { key: 'area', text: i18n('area', locale) },
            { key: 'heikin_ashi', text: i18n('heikin_ashi', locale) },
            { key: 'baseline', text: i18n('baseline', locale) }
          ]
        },
        {
          key: 'candle.bar.upColor',
          text: i18n('candle_up_color', locale),
          component: 'color'
        },
        {
          key: 'candle.bar.downColor',
          text: i18n('candle_down_color', locale),
          component: 'color'
        },
        {
          key: 'candle.priceMark.last.show',
          text: i18n('last_price_show', locale),
          component: 'switch'
        },
        {
          key: 'candle.priceMark.high.show',
          text: i18n('high_price_show', locale),
          component: 'switch'
        },
        {
          key: 'candle.priceMark.low.show',
          text: i18n('low_price_show', locale),
          component: 'switch'
        },
        {
          key: 'candle.tooltip.showType',
          text: i18n('tooltip_show_type', locale),
          component: 'select',
          dataSource: [
            { key: 'standard', text: i18n('tooltip_standard', locale) },
            { key: 'rect', text: i18n('tooltip_rect', locale) }
          ]
        }
      ]
    },
    {
      label: i18n('group_axis', locale),
      options: [
        {
          key: 'yAxis.type',
          text: i18n('price_axis_type', locale),
          component: 'select',
          dataSource: [
            { key: 'normal', text: i18n('normal', locale) },
            { key: 'percentage', text: i18n('percentage', locale) },
            { key: 'log', text: i18n('log', locale) }
          ]
        },
        {
          key: 'yAxis.reverse',
          text: i18n('reverse_coordinate', locale),
          component: 'switch'
        },
        {
          key: 'indicator.lastValueMark.show',
          text: i18n('indicator_last_value_show', locale),
          component: 'switch'
        }
      ]
    },
    {
      label: i18n('group_grid_crosshair', locale),
      options: [
        {
          key: 'grid.show',
          text: i18n('grid_show', locale),
          component: 'switch'
        },
        {
          key: 'crosshair.show',
          text: i18n('crosshair_show', locale),
          component: 'switch'
        },
        {
          key: 'crosshair.horizontal.show',
          text: i18n('crosshair_horizontal_show', locale),
          component: 'switch'
        },
        {
          key: 'crosshair.vertical.show',
          text: i18n('crosshair_vertical_show', locale),
          component: 'switch'
        }
      ]
    }
  ]
}
