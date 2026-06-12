---
layout: home

hero:
  name: "fusion-module"
  text: "技术实现文档"
  tagline: 运行时加载远程 ES 模块的协议层、运行时内核、Vue 绑定与构建期 Vite 插件的完整实现说明。
  actions:
    - theme: brand
      text: 总体架构与依赖关系
      link: /architecture
    - theme: alt
      text: 协议层 contracts
      link: /contracts
    - theme: alt
      text: 运行时内核 runtime
      link: /runtime/

features:
  - title: "@fusion-module/contracts"
    details: 纯类型协议层，零运行时代码。定义 RemoteModule、ModuleManifest、ModuleRuntimeContext、ModuleEventBus、ModuleState 五组接口。
  - title: "@fusion-module/runtime"
    details: 框架无关运行时内核。实现远程模块加载器（含并发去重缓存）、样式加载器、mount/unmount 生命周期、事件总线、基于 zustand/vanilla 的键值状态容器。
  - title: "@fusion-module/runtime-vue"
    details: Vue 3 绑定层。RemoteModuleSlot 组件实现加载状态机与三重竞态控制（loadVersion / loadQueue / disposed），useModuleState 将 ModuleState 桥接为 Vue ref。
  - title: "@fusion-module/vite-plugin-module-manifest"
    details: 构建期插件。在 closeBundle 钩子中探测产物文件存在性，于 outDir 写出 manifest.json。
  - title: "@fusion-module/vite-plugin-module-shared"
    details: 构建期插件。在 transformIndexHtml 钩子中按 serve/build 命令选择导入表，向 HTML head 头部注入 import map script 标签。
  - title: 单向依赖分层
    details: contracts ← runtime ← runtime-vue 严格单向依赖；两个 Vite 插件仅依赖 contracts 的类型，与运行时完全解耦。
---

## 文档范围

本文档**仅描述技术实现**：每个包的源码结构、每个函数的签名与逐行为说明、内部状态、并发与竞态处理、包之间的依赖与协作方式。不包含使用教程、业务背景与集成指引。

## 阅读入口

| 页面 | 内容 |
|---|---|
| [总体架构](/architecture) | 包依赖图、运行时数据流、构建期与运行期的协作关系 |
| [contracts](/contracts) | 全部协议类型的逐字段说明 |
| [runtime 概览](/runtime/) | 内核包的文件结构与导出面 |
| [模块加载器](/runtime/loader) | `loadRemoteModule` / `loadStyle` 的缓存与失败回收实现 |
| [生命周期](/runtime/lifecycle) | `mountModule` / `unmountModule` / `ModuleInstance` |
| [事件总线](/runtime/event-bus) | `createModuleEventBus` 的 Map+Set 实现 |
| [状态容器](/runtime/store) | `createModuleState` 基于 zustand/vanilla 的实现 |
| [runtime-vue 概览](/runtime-vue/) | Vue 绑定包的文件结构与导出面 |
| [RemoteModuleSlot](/runtime-vue/remote-module-slot) | 状态机、竞态控制、串行加载队列的完整实现分析 |
| [useModuleState](/runtime-vue/use-module-state) | ModuleState → Vue ref 桥接实现 |
| [内部组件与弃用 API](/runtime-vue/internals) | loading/error 兜底组件、已弃用的 resolve-manifest 工具 |
| [vite-plugin-module-manifest](/vite-plugin-module-manifest) | manifest.json 生成插件实现 |
| [vite-plugin-module-shared](/vite-plugin-module-shared) | import map 注入插件实现 |
