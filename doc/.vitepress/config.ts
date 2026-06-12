import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'fusion-module',
  description: 'fusion-module 核心包的技术实现文档：协议层、运行时内核、Vue 绑定与构建期 Vite 插件',
  lang: 'zh-CN',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '架构', link: '/architecture' },
      { text: 'contracts', link: '/contracts' },
      { text: 'runtime', link: '/runtime/', activeMatch: '/runtime/' },
      { text: 'runtime-vue', link: '/runtime-vue/', activeMatch: '/runtime-vue/' },
      {
        text: 'Vite 插件',
        items: [
          { text: 'vite-plugin-module-manifest', link: '/vite-plugin-module-manifest' },
          { text: 'vite-plugin-module-shared', link: '/vite-plugin-module-shared' },
        ],
      },
    ],

    sidebar: [
      {
        text: '总览',
        items: [
          { text: '总体架构与依赖关系', link: '/architecture' },
        ],
      },
      {
        text: '@fusion-module/contracts',
        items: [
          { text: '协议类型实现说明', link: '/contracts' },
        ],
      },
      {
        text: '@fusion-module/runtime',
        items: [
          { text: '包概览与导出面', link: '/runtime/' },
          { text: '模块加载器（loader）', link: '/runtime/loader' },
          { text: '生命周期（lifecycle）', link: '/runtime/lifecycle' },
          { text: '事件总线（event）', link: '/runtime/event-bus' },
          { text: '状态容器（store）', link: '/runtime/store' },
        ],
      },
      {
        text: '@fusion-module/runtime-vue',
        items: [
          { text: '包概览与导出面', link: '/runtime-vue/' },
          { text: 'RemoteModuleSlot', link: '/runtime-vue/remote-module-slot' },
          { text: 'useModuleState', link: '/runtime-vue/use-module-state' },
          { text: '内部组件与弃用 API', link: '/runtime-vue/internals' },
        ],
      },
      {
        text: 'Vite 插件',
        items: [
          { text: 'vite-plugin-module-manifest', link: '/vite-plugin-module-manifest' },
          { text: 'vite-plugin-module-shared', link: '/vite-plugin-module-shared' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/' }],

    outline: { level: [2, 3], label: '本页目录' },

    docFooter: { prev: '上一篇', next: '下一篇' },
  },
})
