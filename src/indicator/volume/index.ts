/**
 * 成交量类技术指标集合
 * 包含 VWAP、MFI、CMF、AD、VROC、KVO、FI、Elder Ray
 */
import vwap from './vwap'
import mfi from './mfi'
import chaikinMoneyFlow from './chaikinMoneyFlow'
import adLine from './adLine'
import vroc from './vroc'
import klingerOscillator from './klingerOscillator'
import forceIndex from './forceIndex'
import elderRay from './elderRay'

const volumeIndicators = [
  vwap,
  mfi,
  chaikinMoneyFlow,
  adLine,
  vroc,
  klingerOscillator,
  forceIndex,
  elderRay
]

export default volumeIndicators
