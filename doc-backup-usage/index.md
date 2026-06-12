---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "fusion-module"
  text: "运行时加载的前端模块协议"
  tagline: 宿主不在构建期静态 import 业务模块，而是在运行时按需加载远程 ES 模块、注入共享上下文、统一治理公共依赖。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 了解核心概念
      link: /guide/
    - theme: alt
      text: API 参考
      link: /api/contracts

features:
  - title: 运行时加载
    details: 通过动态 import 加载远程 ESM 模块。模块独立开发、独立构建、独立部署，宿主在运行时按 moduleCode 装载。
  - title: 宿主自管模块发现
    details: 加载方式不再绑定 registry/manifest.json。宿主用 resolveManifest 返回拼好的 manifest，或用 loadModule 直接返回模块。
  - title: 统一生命周期
    details: 每个模块只需默认导出 mount / unmount。运行时负责加载样式、动态 import、挂载、卸载，并处理切换竞态。
  - title: 共享运行时上下文
    details: event、state，以及由宿主扩展的 axios、queryClient、用户信息等能力，通过 context 注入；模块只消费协议。
  - title: 公共依赖治理
    details: Vue、Element Plus 等公共依赖由宿主提供。生产用 import map，开发用 devImports，避免模块各自打包一份。
  - title: 框架无关内核
    details: runtime 与具体框架解耦。runtime-vue 提供 Vue 3 的 RemoteModuleSlot 与组合式函数，其它框架可在内核之上自行封装。
---

## 它解决什么问题

当一个宿主系统需要动态接入多个业务模块时，传统做法是把模块作为源码静态 `import` 进宿主，构建期强耦合。fusion-module 把这层关系改成**运行时协议**：

- 模块用 `manifest` 描述自己（编码、入口、样式、版本）。
- 宿主在运行时拿到 `moduleCode`，解析出 `manifest`，动态 `import` 模块入口。
- 模块暴露统一的 `mount(container, context)` / `unmount()` 生命周期。
- 宿主通过 `context` 注入公共能力（事件总线、共享状态，以及自定义的 axios、queryClient 等）。
- 公共第三方依赖由宿主提供，模块产物保持轻量。

这套方案比完整微前端更轻：没有 HTML entry 解析、JS 沙箱、样式隔离、路由劫持。它面向的是**同技术栈、同宿主业务上下文下的页面级业务模块编排**。

## 包一览

| 包 | 作用 |
|---|---|
| [`@fusion-module/contracts`](/api/contracts) | 协议与类型定义，无运行时代码。 |
| [`@fusion-module/runtime`](/api/runtime) | 框架无关运行时：远程模块加载、生命周期、事件总线、共享状态。 |
| [`@fusion-module/runtime-vue`](/api/runtime-vue) | Vue 3 绑定：`RemoteModuleSlot` 组件与 `useModuleState`。 |
| [`@fusion-module/vite-plugin-module-manifest`](/api/vite-plugin-module-manifest) | 模块构建时在产物旁生成 `manifest.json`。 |
| [`@fusion-module/vite-plugin-module-shared`](/api/vite-plugin-module-shared) | 宿主向 HTML 注入共享依赖 import map。 |

## 下一步

- 第一次接触，请从 [核心概念](/guide/concepts) 和 [架构与加载链路](/guide/architecture) 开始。
- 想动手，请看 [快速开始](/guide/getting-started)。
- 已有项目从旧的 registry/manifest 拉取方式升级，请看 [迁移指南](/migration)。
