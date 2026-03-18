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

import { Component, createSignal, Show } from 'solid-js'

export interface OverlayPropertyBarProps {
  locale: string
  visible: boolean
  position: { x: number, y: number }
  overlayId: string
  currentColor: string
  currentLineWidth: number
  currentLineStyle: string
  locked: boolean
  onColorChange: (color: string) => void
  onLineWidthChange: (width: number) => void
  onLineStyleChange: (style: string) => void
  onLockChange: (locked: boolean) => void
  onDelete: () => void
  onClose: () => void
}

// 预设调色板颜色（TradingView 风格 8x9 色板）
const PALETTE_COLORS = [
  // 灰度行
  '#ffffff', '#d1d4dc', '#b2b5be', '#787b86', '#434651', '#363a45', '#2a2e39', '#1e222d', '#131722',
  // 红色行
  '#f44336', '#ff5252', '#ff8a80', '#ef5350', '#e53935', '#c62828', '#b71c1c', '#880e4f', '#ad1457',
  // 橙色行
  '#ff9800', '#ffb74d', '#ffe0b2', '#ff6d00', '#f57c00', '#e65100', '#bf360c', '#ff6f00', '#ff8f00',
  // 黄色行
  '#ffeb3b', '#fff176', '#fff9c4', '#fdd835', '#f9a825', '#f57f17', '#fbc02d', '#ffd600', '#ffea00',
  // 绿色行
  '#4caf50', '#66bb6a', '#a5d6a7', '#00c853', '#00e676', '#2e7d32', '#1b5e20', '#33691e', '#00bfa5',
  // 青色行
  '#00bcd4', '#4dd0e1', '#80deea', '#00acc1', '#0097a7', '#00838f', '#006064', '#00897b', '#009688',
  // 蓝色行
  '#2196f3', '#42a5f5', '#90caf9', '#1e88e5', '#1565c0', '#0d47a1', '#01579b', '#0277bd', '#1677ff',
  // 紫色行
  '#9c27b0', '#ab47bc', '#ce93d8', '#8e24aa', '#6a1b9a', '#4a148c', '#7b1fa2', '#6200ea', '#651fff',
]

const LINE_WIDTHS = [1, 2, 3, 4]
const LINE_STYLES: { key: string, label_zh: string, label_en: string }[] = [
  { key: 'solid', label_zh: '实线', label_en: 'Solid' },
  { key: 'dashed', label_zh: '虚线', label_en: 'Dashed' },
  { key: 'dotted', label_zh: '点线', label_en: 'Dotted' },
]

const OverlayPropertyBar: Component<OverlayPropertyBarProps> = props => {
  const [showColorPalette, setShowColorPalette] = createSignal(false)
  const [showWidthPicker, setShowWidthPicker] = createSignal(false)
  const [showStylePicker, setShowStylePicker] = createSignal(false)

  // 关闭所有子弹出层
  const closeAllPopups = () => {
    setShowColorPalette(false)
    setShowWidthPicker(false)
    setShowStylePicker(false)
  }

  return (
    <Show when={props.visible}>
      <div
        class="klinecharts-pro-overlay-property-bar"
        style={{
          left: `${props.position.x}px`,
          top: `${props.position.y}px`,
        }}>
        {/* 颜色选择 */}
        <div class="klinecharts-pro-overlay-property-bar-item"
          onClick={() => { const next = !showColorPalette(); closeAllPopups(); setShowColorPalette(next) }}>
          <div class="klinecharts-pro-overlay-property-bar-color-swatch"
            style={{ 'background-color': props.currentColor }} />
          <Show when={showColorPalette()}>
            <div class="klinecharts-pro-overlay-property-bar-palette">
              {PALETTE_COLORS.map(color => (
                <div
                  class={`klinecharts-pro-overlay-property-bar-palette-item${color === props.currentColor ? ' active' : ''}`}
                  style={{ 'background-color': color }}
                  onClick={(e) => { e.stopPropagation(); props.onColorChange(color); setShowColorPalette(false) }}
                />
              ))}
            </div>
          </Show>
        </div>

        <span class="klinecharts-pro-overlay-property-bar-separator" />

        {/* 线宽选择 */}
        <div class="klinecharts-pro-overlay-property-bar-item"
          onClick={() => { const next = !showWidthPicker(); closeAllPopups(); setShowWidthPicker(next) }}>
          <svg width="20" height="14" viewBox="0 0 20 14">
            <line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" stroke-width={props.currentLineWidth} />
          </svg>
          <span class="klinecharts-pro-overlay-property-bar-label">{props.currentLineWidth}px</span>
          <Show when={showWidthPicker()}>
            <div class="klinecharts-pro-overlay-property-bar-dropdown">
              {LINE_WIDTHS.map(w => (
                <div
                  class={`klinecharts-pro-overlay-property-bar-dropdown-item${w === props.currentLineWidth ? ' active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); props.onLineWidthChange(w); setShowWidthPicker(false) }}>
                  <svg width="40" height="14" viewBox="0 0 40 14">
                    <line x1="4" y1="7" x2="36" y2="7" stroke="currentColor" stroke-width={w} />
                  </svg>
                  <span>{w}px</span>
                </div>
              ))}
            </div>
          </Show>
        </div>

        <span class="klinecharts-pro-overlay-property-bar-separator" />

        {/* 线型选择 */}
        <div class="klinecharts-pro-overlay-property-bar-item"
          onClick={() => { const next = !showStylePicker(); closeAllPopups(); setShowStylePicker(next) }}>
          <svg width="20" height="14" viewBox="0 0 20 14">
            <line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" stroke-width="2"
              stroke-dasharray={props.currentLineStyle === 'dashed' ? '4,3' : props.currentLineStyle === 'dotted' ? '1,3' : 'none'} />
          </svg>
          <Show when={showStylePicker()}>
            <div class="klinecharts-pro-overlay-property-bar-dropdown">
              {LINE_STYLES.map(s => (
                <div
                  class={`klinecharts-pro-overlay-property-bar-dropdown-item${s.key === props.currentLineStyle ? ' active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); props.onLineStyleChange(s.key); setShowStylePicker(false) }}>
                  <svg width="40" height="14" viewBox="0 0 40 14">
                    <line x1="4" y1="7" x2="36" y2="7" stroke="currentColor" stroke-width="2"
                      stroke-dasharray={s.key === 'dashed' ? '6,4' : s.key === 'dotted' ? '2,4' : 'none'} />
                  </svg>
                  <span>{props.locale === 'zh-CN' ? s.label_zh : s.label_en}</span>
                </div>
              ))}
            </div>
          </Show>
        </div>

        <span class="klinecharts-pro-overlay-property-bar-separator" />

        {/* 锁定切换 */}
        <div
          class={`klinecharts-pro-overlay-property-bar-item${props.locked ? ' active' : ''}`}
          onClick={() => props.onLockChange(!props.locked)}
          title={props.locale === 'zh-CN' ? '锁定' : 'Lock'}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            {props.locked
              ? <path d="M11,7V5A3,3,0,0,0,5,5V7a2,2,0,0,0-2,2v4a2,2,0,0,0,2,2h6a2,2,0,0,0,2-2V9A2,2,0,0,0,11,7ZM6,5A2,2,0,0,1,10,5V7H6ZM12,13a1,1,0,0,1-1,1H5a1,1,0,0,1-1-1V9A1,1,0,0,1,5,8h6a1,1,0,0,1,1,1Z" fill="currentColor"/>
              : <path d="M11,7H6V5A2,2,0,0,1,10,5h1A3,3,0,0,0,5,5V7a2,2,0,0,0-2,2v4a2,2,0,0,0,2,2h6a2,2,0,0,0,2-2V9A2,2,0,0,0,11,7Zm1,6a1,1,0,0,1-1,1H5a1,1,0,0,1-1-1V9A1,1,0,0,1,5,8h6a1,1,0,0,1,1,1Z" fill="currentColor"/>
            }
          </svg>
        </div>

        {/* 删除 */}
        <div
          class="klinecharts-pro-overlay-property-bar-item danger"
          onClick={() => props.onDelete()}
          title={props.locale === 'zh-CN' ? '删除' : 'Delete'}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M11,3H8.5l-.5-1h-3l-.5,1H2v1h1v9a1,1,0,0,0,1,1h7a1,1,0,0,0,1-1V4h1V3ZM11,13H4V4h7Zm-5-2V6H7v5Zm3,0V6h1v5Z" fill="currentColor"/>
          </svg>
        </div>
      </div>
    </Show>
  )
}

export default OverlayPropertyBar
