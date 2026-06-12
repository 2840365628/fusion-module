# 什么是 fusion-module

fusion-module 是一套**在宿主应用中运行时加载、编排远程 ES 模块**的轻量协议与运行时。

它的目标不是把一个 Vue 组件从宿主挪到另一个目录，而是让业务能力变成可以**独立开发、独立构建、独立发布**、再由宿主在运行时装载的模块。

## 一句话理解

> 模块只声明自己（manifest + mount/unmount），宿主只消费协议（解析 manifest、动态 import、注入 context），中间不需要构建期耦合。

## 模块与宿主之间只通过协议协作

- 模块用 [`ModuleManifest`](/api/contracts#modulemanifest) 描述自己是谁、入口在哪里、样式在哪里。
- 宿主在运行时根据 `moduleCode` 解析出 manifest（怎么解析由宿主决定）。
- 运行时通过 `entry` 动态 `import` 远程 ESM 模块。
- 模块暴露统一的 [`mount` / `unmount`](/api/contracts#remotemodule) 生命周期。
- 宿主把事件总线、共享状态，以及自定义的 axios、queryClient、用户信息等能力，通过 [`context`](/api/contracts#moduleruntimecontext) 注入给模块。
- 公共依赖通过 [import map](/host/shared-deps) 统一指向宿主，避免模块各自打包一份 Vue、Element Plus。

## 它适合什么场景

适合：

- 一个宿主系统中需要嵌入多个业务能力模块。
- 模块和宿主需要共享同一套用户态、请求态、缓存态。
- 模块粒度偏页面局部区域，而不是完整独立应用。
- 希望未来支持模块 registry、模块市场、运行时装配。
- 技术栈基本一致，主要是 Vue + Vite。

不适合（更适合用 qiankun / micro-app 等完整微前端）：

- 子系统是完整应用，需要独立路由、独立布局。
- 团队或技术栈差异很大。
- 隔离要求高，需要 JS 沙箱、样式隔离。

## 与微前端的区别

| | fusion-module | 完整微前端（qiankun/micro-app） |
|---|---|---|
| 模块契约 | `mount`/`unmount` + manifest | HTML entry + 生命周期 |
| 隔离 | 无沙箱，同页面上下文 | JS 沙箱 + 样式隔离 |
| 共享上下文 | 通过 `context` 显式注入 | 需自行设计通信桥 |
| 模块粒度 | 页面级业务区域 | 完整子应用 |
| 复杂度 | 轻 | 重 |

fusion-module 更像是面向**同技术栈、同宿主业务上下文**的轻量模块运行时；微前端更像是面向完整子应用自治的应用编排框架。两者不是绝对替代关系。

## 接下来

- [核心概念](/guide/concepts)：manifest、context、RemoteModule、runtime、共享依赖之间的关系。
- [架构与加载链路](/guide/architecture)：从 `moduleCode` 到模块挂载的完整链路。
- [快速开始](/guide/getting-started)：动手集成宿主并写第一个模块。
