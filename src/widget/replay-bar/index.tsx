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

import { Component, Show } from 'solid-js'
import type { ReplayState, ReplaySpeed } from '../../replay/types'
import i18n from '../../i18n'
import './index.less'

export interface ReplayControlBarProps {
  locale: string
  state: ReplayState
  onPlay: () => void
  onPause: () => void
  onStepForward: () => void
  onStepBackward: () => void
  onSpeedChange: (speed: ReplaySpeed) => void
  onPositionChange: (position: number) => void
  onStop: () => void
}

const SPEEDS: ReplaySpeed[] = [1, 2, 4, 8, 16]

const ReplayControlBar: Component<ReplayControlBarProps> = (props) => {
  const nextSpeed = () => {
    const idx = SPEEDS.indexOf(props.state.speed)
    return SPEEDS[(idx + 1) % SPEEDS.length]
  }

  return (
    <Show when={props.state.active}>
      <div class="klinecharts-pro-replay-bar">
        <div class="replay-btn" onClick={props.onStepBackward} title={i18n('replay_back', props.locale)}>
          <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" transform="scale(-1,1) translate(-24,0)"/></svg>
        </div>
        <div class="replay-btn" onClick={() => props.state.playing ? props.onPause() : props.onPlay()}>
          {props.state.playing ? (
            <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </div>
        <div class="replay-btn" onClick={props.onStepForward} title={i18n('replay_forward', props.locale)}>
          <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </div>
        <span class="replay-speed" onClick={() => props.onSpeedChange(nextSpeed())} title={i18n('replay_speed', props.locale)}>
          {props.state.speed}x
        </span>
        <div class="replay-progress">
          <span>{props.state.position}</span>
          <input type="range" min={1} max={props.state.totalBars} value={props.state.position}
            onInput={(e) => props.onPositionChange(parseInt((e.target as HTMLInputElement).value))} />
          <span>{props.state.totalBars}</span>
        </div>
        <span class="replay-exit" onClick={props.onStop}>
          {i18n('replay_exit', props.locale)}
        </span>
      </div>
    </Show>
  )
}

export default ReplayControlBar
