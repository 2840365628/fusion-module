import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'fusion-module 使用指南',
  description:
    'fusion-module 技术使用文档：模块开发、独立打包、宿主集成、门户动态配置，跨系统嵌入业务模块的完整实践',
  lang: 'zh-CN',
  base: '/module-develop-doc/',
  themeConfig: {
    nav: [
      { text: '总览', link: '/overview' },
      { text: '开发模块', link: '/module/develop', activeMatch: '/module/' },
      { text: '宿主接入', link: '/host/integrate', activeMatch: '/host/' },
      { text: '门户配置', link: '/portal/market', activeMatch: '/portal/' },
      { text: '技术实现文档', link: 'https://www.lcydaily.cloud/fusion-modules-doc/' },
    ],

    sidebar: [
      {
        text: '总览',
        items: [{ text: '整体协作模型', link: '/overview' }],
      },
      {
        text: '开发模块',
        items: [
          { text: '开发一个模块', link: '/module/develop' },
          { text: '使用全局 store（共享状态）', link: '/module/global-state' },
          { text: '模块配置详解', link: '/module/config' },
          { text: '独立打包与交付', link: '/module/build' },
        ],
      },
      {
        text: '宿主接入',
        items: [
          { text: '宿主接入', link: '/host/integrate' },
          { text: '共享依赖与 import map', link: '/host/shared-deps' },
        ],
      },
      {
        text: '门户',
        items: [{ text: '动态配置模块（插件市场）', link: '/portal/market' }],
      },
      {
        text: '迁移',
        items: [{ text: '旧链路迁移注意', link: '/migration-notes' }],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/' }],

    outline: { level: [2, 3], label: '本页目录' },

    docFooter: { prev: '上一篇', next: '下一篇' },
  },
})
