/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Period } from '../types'

/**
 * Calculates an aligned [from, to] timestamp pair for a given period and bar count.
 *
 * The returned `to` is snapped to the period boundary (e.g. minute, hour) and
 * `from` is calculated by stepping back `count * period.multiplier` units from `to`.
 *
 * @param period       - The chart period descriptor (timespan + multiplier).
 * @param toTimestamp  - The raw upper-bound timestamp in milliseconds (epoch).
 * @param count        - Number of bars to include in the range.
 * @returns A tuple `[from, alignedTo]` both in milliseconds since epoch.
 */
export function adjustFromTo(period: Period, toTimestamp: number, count: number): [number, number] {
  let to = toTimestamp
  let from = to
  switch (period.timespan) {
    case 'minute': {
      to = to - (to % (60 * 1000))
      from = to - count * period.multiplier * 60 * 1000
      break
    }
    case 'hour': {
      to = to - (to % (60 * 60 * 1000))
      from = to - count * period.multiplier * 60 * 60 * 1000
      break
    }
    case 'day': {
      const d = new Date(to)
      to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      from = to - count * period.multiplier * 24 * 60 * 60 * 1000
      break
    }
    case 'week': {
      const date = new Date(to)
      const day = date.getUTCDay()
      const dif = day === 0 ? 6 : day - 1
      to = to - dif * 24 * 60 * 60 * 1000
      const d = new Date(to)
      to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      from = to - count * period.multiplier * 7 * 24 * 60 * 60 * 1000
      break
    }
    case 'month': {
      const date = new Date(to)
      to = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
      const fromDate = new Date(to)
      fromDate.setUTCMonth(fromDate.getUTCMonth() - count * period.multiplier)
      from = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1)
      break
    }
    case 'year': {
      const date = new Date(to)
      to = Date.UTC(date.getUTCFullYear(), 0, 1)
      const fromDate = new Date(to)
      fromDate.setUTCFullYear(fromDate.getUTCFullYear() - count * period.multiplier)
      from = Date.UTC(fromDate.getUTCFullYear(), 0, 1)
      break
    }
  }
  return [from, to]
}
