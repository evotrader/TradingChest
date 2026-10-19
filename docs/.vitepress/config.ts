import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'TradingChest',
  description: '通用行情、分析与多图工作台组件，基于 KLineChart',
  base: '/TradingChest/',
  outDir: '../website',
  // Keep implementation plans and historical acceptance notes in the repository.
  srcExclude: ['superpowers/**', 'upgrade/STATUS.md', 'upgrade/STAGE*.md'],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/TradingChest/logo.svg' }],
  ],
  // docs:site adds this generated demo index to the same deployment artifact.
  ignoreDeadLinks: [/^\/demos\/(?:index)?$/],
  markdown: {
    theme: { dark: 'material-theme-palenight', light: 'github-light' }
  },
  locales: {
    root: {
      label: '简体中文', lang: 'zh-CN', link: '/',
      themeConfig: {
        nav: [
          { text: '接入指南', link: '/getting-started' },
          { text: '演示', link: '/demos/' }
        ],
        sidebar: [
          { text: '介绍', link: '/introduction' },
          { text: '快速开始', link: '/getting-started' },
          { text: 'React / Next / Vue', link: '/frameworks' },
          { text: '数据说明', link: '/data-description' },
          { text: '数据接入', link: '/data-access' },
          { text: 'API', link: '/api' },
          { text: '绘图文档与共享', link: '/drawings' },
          { text: '升级到 0.10.0', link: '/upgrade/0.10.0' },
          { text: '工具覆盖与差距', link: '/drawings-coverage' },
          { text: '升级到 0.9.0', link: '/upgrade/0.9.0' },
          { text: '升级到 0.8.0', link: '/upgrade/0.8.0' },
          { text: '定制主题', link: '/theme' },
          { text: '国际化', link: '/i18n' }
        ],
        docFooter: { prev: '上一篇', next: '下一篇' },
        sidebarMenuLabel: '菜单', darkModeSwitchLabel: '主题', outlineTitle: '本页目录'
      }
    },
    'en-US': {
      label: 'English', lang: 'en-US', link: '/en-US/',
      themeConfig: {
        nav: [
          { text: 'Getting started', link: '/en-US/getting-started' },
          { text: 'Demos', link: '/demos/' }
        ],
        sidebar: [
          { text: 'Introduction', link: '/en-US/introduction' },
          { text: 'Getting started', link: '/en-US/getting-started' },
          { text: 'React / Next / Vue', link: '/en-US/frameworks' },
          { text: 'Data description', link: '/en-US/data-description' },
          { text: 'Data access', link: '/en-US/data-access' },
          { text: 'API', link: '/en-US/api' },
          { text: 'Drawing documents', link: '/en-US/drawings' },
          { text: 'Upgrade to 0.10.0', link: '/en-US/upgrade/0.10.0' },
          { text: 'Drawing coverage', link: '/en-US/drawings-coverage' },
          { text: 'Upgrade to 0.9.0', link: '/en-US/upgrade/0.9.0' },
          { text: 'Upgrade to 0.8.0', link: '/en-US/upgrade/0.8.0' },
          { text: 'Theme', link: '/en-US/theme' },
          { text: 'Internationalization', link: '/en-US/i18n' }
        ]
      }
    }
  },
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: 'https://github.com/evotrader/TradingChest' }],
    footer: {
      message: 'Apache License 2.0 · Derived from KLineChart Pro',
      copyright: 'TradingChest contributors · Upstream copyright © 2018-present liihuu'
    }
  }
})
