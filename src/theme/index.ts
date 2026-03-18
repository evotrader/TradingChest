import { DeepPartial, Styles } from 'klinecharts'

/**
 * 预设主题配置
 * 每个主题包含一组 klinecharts Styles 覆盖
 */
export interface ThemePreset {
  name: string
  label_zh: string
  label_en: string
  styles: DeepPartial<Styles>
}

/** 暗色主题（默认） */
const darkTheme: ThemePreset = {
  name: 'dark',
  label_zh: '暗色',
  label_en: 'Dark',
  styles: {}
}

/** 亮色主题 */
const lightTheme: ThemePreset = {
  name: 'light',
  label_zh: '亮色',
  label_en: 'Light',
  styles: {}
}

/** 午夜蓝主题 */
const midnightTheme: ThemePreset = {
  name: 'midnight',
  label_zh: '午夜蓝',
  label_en: 'Midnight Blue',
  styles: {
    grid: {
      horizontal: { color: 'rgba(44, 62, 80, 0.5)' },
      vertical: { color: 'rgba(44, 62, 80, 0.5)' }
    },
    candle: {
      bar: {
        upColor: '#2ecc71',
        downColor: '#e74c3c',
        noChangeColor: '#95a5a6'
      },
      priceMark: {
        last: {
          upColor: '#2ecc71',
          downColor: '#e74c3c',
          noChangeColor: '#95a5a6'
        }
      }
    },
    indicator: {
      bars: [{
        upColor: 'rgba(46, 204, 113, 0.6)',
        downColor: 'rgba(231, 76, 60, 0.6)',
        noChangeColor: 'rgba(149, 165, 166, 0.6)'
      }]
    },
    xAxis: {
      tickText: { color: '#7f8c8d' }
    },
    yAxis: {
      tickText: { color: '#7f8c8d' }
    },
    crosshair: {
      horizontal: {
        line: { color: '#3498db' },
        text: { backgroundColor: '#2c3e50' }
      },
      vertical: {
        line: { color: '#3498db' },
        text: { backgroundColor: '#2c3e50' }
      }
    }
  }
}

/** 经典绿红主题（TradingView 风格） */
const classicTheme: ThemePreset = {
  name: 'classic',
  label_zh: '经典',
  label_en: 'Classic',
  styles: {
    candle: {
      bar: {
        upColor: '#089981',
        downColor: '#F23645',
        noChangeColor: '#888888'
      },
      priceMark: {
        last: {
          upColor: '#089981',
          downColor: '#F23645',
          noChangeColor: '#888888'
        }
      }
    },
    indicator: {
      bars: [{
        upColor: 'rgba(8, 153, 129, 0.6)',
        downColor: 'rgba(242, 54, 69, 0.6)',
        noChangeColor: 'rgba(136, 136, 136, 0.6)'
      }]
    }
  }
}

/** 高对比主题 */
const highContrastTheme: ThemePreset = {
  name: 'highContrast',
  label_zh: '高对比',
  label_en: 'High Contrast',
  styles: {
    grid: {
      horizontal: { color: 'rgba(255, 255, 255, 0.15)' },
      vertical: { color: 'rgba(255, 255, 255, 0.15)' }
    },
    candle: {
      bar: {
        upColor: '#00FF00',
        downColor: '#FF0000',
        noChangeColor: '#FFFFFF'
      }
    },
    xAxis: {
      tickText: { color: '#FFFFFF' }
    },
    yAxis: {
      tickText: { color: '#FFFFFF' }
    }
  }
}

export const themePresets: ThemePreset[] = [
  darkTheme, lightTheme, midnightTheme, classicTheme, highContrastTheme
]

export function getThemeByName(name: string): ThemePreset | undefined {
  return themePresets.find(t => t.name === name)
}

export default themePresets
