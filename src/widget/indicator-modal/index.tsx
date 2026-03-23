/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Component, createSignal, createMemo, For, Show, onMount } from 'solid-js'

import { Modal, List, Checkbox } from '../../component'

import i18n from '../../i18n'

import { indicatorCategories } from '../../indicator'

type OnIndicatorChange = (
  params: {
    name: string
    paneId: string
    added: boolean
  }
) => void

export interface IndicatorModalProps {
  locale: string
  mainIndicators: string[]
  subIndicators: Record<string, string>
  onMainIndicatorChange: OnIndicatorChange
  onSubIndicatorChange: OnIndicatorChange
  onClose: () => void
}

// 主图指标（叠加在蜡烛图上）
// 名称必须与 IndicatorTemplate.name 完全一致
const MAIN_INDICATORS = [
  'MA', 'EMA', 'SMA', 'BOLL', 'SAR', 'BBI',
  'DEMA', 'TEMA', 'WMA', 'HMA', 'KAMA', 'VWMA',
  'ZLEMA', 'MCGINLEY', 'ENVELOPES', 'T3',
  'ICHIMOKU', 'ALLIGATOR', 'LINEARREGRESSION',
  'KC', 'DC', 'PIVOTPOINTS'
]

// 副图指标（独立面板）
const SUB_INDICATORS = [
  'MA', 'EMA', 'VOL', 'MACD', 'BOLL', 'KDJ',
  'RSI', 'BIAS', 'BRAR', 'CCI', 'DMI',
  'CR', 'PSY', 'DMA', 'TRIX', 'OBV',
  'VR', 'WR', 'MTM', 'EMV', 'SAR',
  'SMA', 'ROC', 'PVT', 'BBI', 'AO',
  // 新增指标
  'ATR', 'SUPERTREND',
  'HV', 'STDDEV', 'CV', 'MI', 'UI', 'BBW',
  'VWAP', 'MFI', 'CMF', 'AD', 'VROC', 'KVO', 'FI', 'ELDER_RAY',
  'StochRSI', 'ADX', 'AROON', 'UO', 'FISHER',
  'COPPOCK', 'PPO', 'DPO', 'KST', 'TMF',
  'ZIGZAG'
]

// 分类 Tab 列表
const CATEGORY_KEYS = ['all', 'trend', 'volatility', 'volume', 'momentum', 'other'] as const

const IndicatorModal: Component<IndicatorModalProps> = props => {
  const [searchText, setSearchText] = createSignal('')
  const [activeCategory, setActiveCategory] = createSignal<string>('all')
  let searchInputRef!: HTMLInputElement

  onMount(() => { searchInputRef?.focus() })

  // 根据分类和搜索筛选指标
  const filteredMainIndicators = createMemo(() => {
    const search = searchText().toLowerCase()
    const cat = activeCategory()
    return MAIN_INDICATORS.filter(name => {
      if (search && !name.toLowerCase().includes(search) && !i18n(name.toLowerCase(), props.locale).toLowerCase().includes(search)) {
        return false
      }
      if (cat === 'all') return true
      const category = indicatorCategories[cat]
      return category?.names.includes(name) ?? false
    })
  })

  const filteredSubIndicators = createMemo(() => {
    const search = searchText().toLowerCase()
    const cat = activeCategory()
    return SUB_INDICATORS.filter(name => {
      if (search && !name.toLowerCase().includes(search) && !i18n(name.toLowerCase(), props.locale).toLowerCase().includes(search)) {
        return false
      }
      if (cat === 'all') return true
      const category = indicatorCategories[cat]
      return category?.names.includes(name) ?? false
    })
  })

  const getCategoryLabel = (key: string): string => {
    if (key === 'all') {
      return props.locale === 'zh-CN' ? '全部' : 'All'
    }
    const cat = indicatorCategories[key]
    return props.locale === 'zh-CN' ? cat?.label_zh ?? key : cat?.label_en ?? key
  }

  return (
    <Modal
      title={i18n('indicator', props.locale)}
      width={480}
      onClose={props.onClose}>
      {/* 搜索栏 */}
      <div class="klinecharts-pro-indicator-modal-search">
        <div class="klinecharts-pro-input">
          <input
            ref={(el) => { searchInputRef = el }}
            class="value"
            placeholder={i18n('indicator_search', props.locale)}
            value={searchText()}
            onInput={(e) => setSearchText((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>
      {/* 分类 Tab */}
      <div class="klinecharts-pro-indicator-modal-tabs">
        <For each={[...CATEGORY_KEYS]}>
          {(key) => (
            <span
              class={`klinecharts-pro-indicator-modal-tab${activeCategory() === key ? ' active' : ''}`}
              onClick={() => setActiveCategory(key)}>
              {getCategoryLabel(key)}
            </span>
          )}
        </For>
      </div>
      <List
        class="klinecharts-pro-indicator-modal-list">
        <Show when={filteredMainIndicators().length > 0}>
          <li class="title">{i18n('main_indicator', props.locale)}</li>
        </Show>
        <For each={filteredMainIndicators()}>
          {(name) => {
            const checked = () => props.mainIndicators.includes(name)
            return (
              <li
                class="row"
                onClick={() => {
                  props.onMainIndicatorChange({ name, paneId: 'candle_pane', added: !checked() })
                }}>
                <Checkbox checked={checked()} label={i18n(name.toLowerCase(), props.locale) || name}/>
              </li>
            )
          }}
        </For>
        <Show when={filteredSubIndicators().length > 0}>
          <li class="title">{i18n('sub_indicator', props.locale)}</li>
        </Show>
        <For each={filteredSubIndicators()}>
          {(name) => {
            const checked = () => name in props.subIndicators
            return (
              <li
                class="row"
                onClick={() => {
                  props.onSubIndicatorChange({ name, paneId: props.subIndicators[name] ?? '', added: !checked() })
                }}>
                <Checkbox checked={checked()} label={i18n(name.toLowerCase(), props.locale) || name}/>
              </li>
            )
          }}
        </For>
        <Show when={filteredMainIndicators().length === 0 && filteredSubIndicators().length === 0}>
          <li class="klinecharts-pro-indicator-modal-empty">
            {i18n('no_indicators_found', props.locale)}
          </li>
        </Show>
      </List>
    </Modal>
  )
}

export default IndicatorModal
