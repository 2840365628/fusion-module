---
layout: home

hero:
  name: "fusion-module"
  text: "技术使用文档"
  tagline: 跨系统嵌入业务模块的完整实践指南：模块开发、独立打包、宿主集成、门户动态配置。
  actions:
    - theme: brand
      text: 整体协作模型
      link: /overview
    - theme: alt
      text: 开发一个模块
      link: /module/develop
    - theme: alt
      text: 宿主接入
      link: /host/integrate

features:
  - title: 模块提供方
    details: 各业务系统在自己的 monorepo 中开发模块，vite lib 模式独立打包出 index.es.js + style.css + manifest.json，压缩为 zip 即可交付。
  - title: 宿主系统
    details: 任何 Vue 3 宿主通过 RemoteModuleSlot 嵌入模块。开发期用 import.meta.glob 加载本地源码，生产期按 manifest 动态 import 远程产物。
  - title: 门户插件市场
    details: 门户提供模块上传、版本管理、启停控制，首页栅格布局动态渲染各系统的模块，实现跨系统页面级复用。
  - title: 共享依赖治理
    details: Vue、Element Plus 等公共依赖由宿主统一提供，模块构建时 external，运行时经 import map 解析到宿主副本，全局单实例。
  - title: 统一上下文
    details: 宿主把 axios、queryClient、用户信息、事件总线、共享状态经 context 注入；模块只面向协议编程，不感知宿主实现。
  - title: 同栈轻量方案
    details: 没有 JS 沙箱、样式隔离与路由劫持，面向同技术栈（Vue 3 + Element Plus 系）的页面级模块编排，接入与调试成本极低。
---

## 这份文档讲什么

本文档面向**使用** fusion-module 的开发者，讲清楚三个角色各自要做的事：

| 角色 | 典型项目 | 要做的事 | 入口 |
|---|---|---|---|
| **模块提供方** | 各业务系统（如药库、门诊医生站） | 开发模块 → 独立打包 → 交付 zip | [开发一个模块](/module/develop) |
| **宿主系统** | 业务系统自己的 web 应用 | 提供共享依赖与 context，用 Slot 嵌入模块 | [宿主接入](/host/integrate) |
| **门户（插件市场）** | 门户系统 | 上传发布模块、动态配置页面布局 | [门户动态配置](/portal/market) |

各包的内部实现细节（每个函数怎么写的）见另一份[技术实现文档](https://www.lcydaily.cloud/fusion-modules-doc/)。

## 阅读路线

1. 先读 [整体协作模型](/overview)，理解模块、宿主、门户、文件服务器四方如何配合。
2. 写模块：[开发一个模块](/module/develop) → [模块配置详解](/module/config) → [独立打包与交付](/module/build)。
3. 接宿主：[宿主接入](/host/integrate) → [共享依赖与 import map](/host/shared-deps)。
4. 管门户：[门户动态配置模块](/portal/market)。
5. 老项目升级：[旧链路迁移注意](/migration-notes)。
