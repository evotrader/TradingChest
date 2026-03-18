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

import { Component, createEffect, For, createSignal } from 'solid-js'
import { Styles, utils, DeepPartial } from 'klinecharts'

import lodashSet from 'lodash/set'

import { Modal, Select, Switch, ColorInput } from '../../component'
import type { SelectDataSourceItem } from '../../component'

import i18n from '../../i18n'
import { getOptions } from './data'
import type { SettingOption } from './data'

export interface SettingModalProps {
  locale: string
  currentStyles: Styles
  onClose: () => void
  onChange: (style: DeepPartial<Styles>) => void
  onRestoreDefault: (options: SelectDataSourceItem[]) => void
}

const SettingModal: Component<SettingModalProps> = props => {
  const [styles, setStyles] = createSignal(props.currentStyles)
  const [groups, setGroups] = createSignal(getOptions(props.locale))

  createEffect(() => {
    setGroups(getOptions(props.locale))
  })

  const update = (option: SettingOption, newValue: any) => {
    const style = {}
    lodashSet(style, option.key, newValue)
    const ss = utils.clone(styles())
    lodashSet(ss, option.key, newValue)
    setStyles(ss)
    setGroups(getOptions(props.locale))
    props.onChange(style)
  }

  // 将所有分组中的选项展开为扁平数组，用于恢复默认
  const flatOptions = () => {
    return groups().flatMap(group => group.options)
  }

  return (
    <Modal
      title={i18n('setting', props.locale)}
      width={560}
      buttons={[
        {
          children: i18n('restore_default', props.locale),
          onClick: () => {
            props.onRestoreDefault(flatOptions())
            props.onClose()
          }
        }
      ]}
      onClose={props.onClose}>
      <For each={groups()}>
        {
          group => (
            <>
              <div class="klinecharts-pro-setting-modal-group-label">{group.label}</div>
              <div class="klinecharts-pro-setting-modal-content">
                <For each={group.options}>
                  {
                    option => {
                      let component
                      const value = utils.formatValue(styles(), option.key)
                      switch (option.component) {
                        case 'select': {
                          component = (
                            <Select
                              style={{ width: '120px' }}
                              value={i18n(value as string, props.locale)}
                              dataSource={option.dataSource}
                              onSelected={(data) => {
                                const newValue = (data as SelectDataSourceItem).key
                                update(option, newValue)
                              }}/>
                          )
                          break
                        }
                        case 'switch': {
                          const open = !!value
                          component = (
                            <Switch
                              open={open}
                              onChange={() => {
                                const newValue = !open
                                update(option, newValue)
                              }}/>
                          )
                          break
                        }
                        case 'color': {
                          component = (
                            <ColorInput
                              value={(value as string) ?? '#000000'}
                              onChange={(color) => {
                                update(option, color)
                              }}/>
                          )
                          break
                        }
                      }
                      return (
                        <>
                          <span>{option.text}</span>
                          {component}
                        </>
                      )
                    }
                  }
                </For>
              </div>
            </>
          )
        }
      </For>
    </Modal>
  )
}

export default SettingModal
