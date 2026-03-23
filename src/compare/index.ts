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

import { KLineData } from 'klinecharts'

/**
 * Normalizes a K-line data series into percentage change values relative to
 * the first bar's close price.
 *
 * @param data - Array of KLineData entries to normalize.
 * @returns Array of percentage change values where index 0 is always 0.
 */
export function normalizeToPercent(data: KLineData[]): number[] {
  if (data.length === 0) return []
  const basePrice = data[0].close
  if (basePrice === 0) return data.map(() => 0)
  return data.map(d => ((d.close - basePrice) / basePrice) * 100)
}
