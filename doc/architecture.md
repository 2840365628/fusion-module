# 总体架构与依赖关系

本仓库是一个 pnpm workspace monorepo，包含五个可发布包，按职责分为三层：**协议层**、**运行时层**、**构建期插件层**。

## 包依赖图

```
                    ┌──────────────────────────┐
                    │  @fusion-module/contracts │   纯类型，零运行时代码
                    └──────────────────────────┘
                       ▲          ▲          ▲
            (types)    │          │          │    (types)
        ┌──────────────┘          │          └───────────────────┐
        │                         │                              │
┌───────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
│ @fusion-module/    │   │ @fusion-module/      │   │ @fusion-module/          │
│ runtime            │◄──│ runtime-vue          │   │ vite-plugin-module-      │
│ (dep: zustand)     │   │ (peer: vue ^3.4)     │   │ manifest (peer: vite>=5) │
└───────────────────┘   └──────────────────────┘   └──────────────────────────┘

┌──────────────────────────────┐
│ @fusion-module/              │   不依赖任何 workspace 包
│ vite-plugin-module-shared    │
│ (peer: vite>=5)              │
└──────────────────────────────┘
```

依赖关系的精确事实（来自各包 `package.json`）：

| 包 | dependencies | peerDependencies | 对 contracts 的依赖性质 |
|---|---|---|---|
| `@fusion-module/contracts` | 无 | 无 | — |
| `@fusion-module/runtime` | `@fusion-module/contracts`、`zustand ^5` | 无 | 仅 `import type`，运行时不引入任何 contracts 代码 |
| `@fusion-module/runtime-vue` | `@fusion-module/contracts`、`@fusion-module/runtime` | `vue ^3.4.0` | 仅 `import type` |
| `@fusion-module/vite-plugin-module-manifest` | `@fusion-module/contracts` | `vite >=5` | 仅 `import type` |
| `@fusion-module/vite-plugin-module-shared` | 无 | `vite >=5` | 无（自带选项类型） |

要点：

- **contracts 没有任何实现**，全部导出为 `interface` / `type`。所有下游对它的引用都是 `import type`，编译产物中不存在对 contracts 的运行时导入。因此 contracts 的"依赖"本质是**编译期契约共享**。
- **runtime 唯一的第三方运行时依赖是 `zustand`**，且只用其 `zustand/vanilla` 入口（无 React/Vue 绑定），用于实现状态容器。
- **runtime-vue 是唯一同时依赖 contracts 与 runtime 的包**，它把 runtime 的命令式 API（`mountModule` / `unmountModule`）包装成 Vue 组件与组合式函数。`vue` 是 peer 依赖，由宿主提供。
- **两个 Vite 插件与运行时层完全解耦**：它们运行在 Node 构建进程中，而 runtime/runtime-vue 运行在浏览器中，两者唯一的交集是 `ModuleManifest` 类型——manifest 插件按该类型**生成** JSON，runtime 按该类型**消费** JSON。

## 构建与产物形态

- 除 runtime-vue 外的四个包用 **tsup** 构建，runtime-vue 因含 `.vue` SFC 用 **vite build**（`@vitejs/plugin-vue` + `vite-plugin-dts`）构建。
- 所有包仅发布 ESM（`"type": "module"`，产物在 `build/esm/`），`exports` 映射 `import` + `types` 双条件。
- runtime-vue 额外导出 `./style.css`（SFC scoped 样式抽取产物 `runtime-vue.css`），并将 `sideEffects` 声明为 `["**/*.css"]`；其余包均 `"sideEffects": false`。
- 三个核心包（contracts / runtime / runtime-vue）由 Changesets 管理且**版本锁定**（linked，同步升版）。

## 运行期数据流

一次完整的远程模块装载，各包代码按以下顺序协作：

```
宿主 Vue 应用
  │ 渲染 <RemoteModuleSlot :module-code :resolve-manifest :context>
  ▼
runtime-vue / remote-module-slot.vue
  │ scheduleLoad(): loadVersion 自增 → 排入 loadQueue 串行队列
  │ cleanup(): 卸载上一个 ModuleInstance、清空容器 DOM
  │ loadAndMount():
  │   ① props.resolveManifest(moduleCode) → ModuleManifest
  ▼
runtime / mount-module.ts  ── mountModule({ manifest, container, context })
  │   ② loadStyle(manifest.style)        → <link> 注入 + 去重缓存
  │   ③ loadRemoteModule(manifest.entry) → 动态 import + 默认导出校验 + Promise 缓存
  │   ④ remoteModule.mount(container, context)
  │   ⑤ 返回 ModuleInstance
  ▼
远程模块（满足 contracts 的 RemoteModule 协议）
  │ 在 container 内自行渲染，经 context.event / context.state 与宿主通信
  ▼
runtime / event & store
  │ createModuleEventBus(): Map<type, Set<handler>> 发布订阅
  │ createModuleState():    zustand vanilla store 键值容器
  ▼
卸载：unmountModule(instance) → remoteModule.unmount() → Slot 清空容器
```

`context` 对象由宿主构造后**原样透传**：runtime-vue 不读取、不修改它，runtime 仅把它作为 `mount` 的第二参数传给远程模块。事件总线与状态容器是否放进 context、放几个实例，完全由宿主决定——runtime 只提供工厂函数。

## 构建期协作

两个 Vite 插件分别服务于链路的两端：

- **模块侧**：`vite-plugin-module-manifest` 在模块构建结束（`closeBundle`）时，把 `ModuleManifestMeta`（code/name/version/runtime）与产物相对路径（entry/style/previewImage）合并为 `ModuleManifest`，写出 `manifest.json`。其中 style 与 previewImage 仅在对应产物文件确实存在时才写入字段。
- **宿主侧**：`vite-plugin-module-shared` 在宿主 HTML 生成（`transformIndexHtml`）时，向 `<head>` 头部注入 `<script type="importmap">`。开发模式（`serve`）使用 `devImports` 表，生产构建使用 `imports` 表，使远程模块产物中 external 掉的裸模块说明符（如 `vue`）在运行时解析到宿主提供的副本。

两者不互相通信，也不与 runtime 通信；协作完全通过**约定的产物形态**完成：manifest 插件产出的 JSON 形状 = contracts 的 `ModuleManifest` = runtime `mountModule` 的输入；shared 插件产出的 import map = 浏览器原生机制，使 runtime 中的 `import(entry)` 能解析模块产物内部的裸说明符。

## 关键设计点索引

| 设计点 | 位置 | 说明 |
|---|---|---|
| 模块加载并发去重 | [loader](/runtime/loader#loadremotemodule) | 以 entry URL 为键缓存 Promise，失败时从缓存删除以允许重试 |
| 样式加载幂等 | [loader](/runtime/loader#loadstyle) | Promise 缓存 + DOM 标记（`data-platform-runtime-style` / `data-loaded`）双层去重 |
| 切换竞态控制 | [RemoteModuleSlot](/runtime-vue/remote-module-slot#竞态控制) | `loadVersion` 单调递增版本号 + `disposed` 标志 + `isCurrentLoad` 三处校验点 |
| 加载串行化 | [RemoteModuleSlot](/runtime-vue/remote-module-slot#loadqueue-串行队列) | `loadQueue` Promise 链保证 cleanup→mount 不交错 |
| 状态变更通知 | [store](/runtime/store#subscribe) | 订阅整库、按 key 过滤、`Object.is` 判等、闭包追踪 oldValue |
| 退订即清理 | [event-bus](/runtime/event-bus#on) | `on` 返回的取消函数在 Set 清空时删除整个 type 条目 |
