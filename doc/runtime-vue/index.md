# @fusion-module/runtime-vue 概览

Vue 3 绑定层。把 runtime 的命令式装载 API 包装为声明式组件 `RemoteModuleSlot`，并提供把 `ModuleState` 桥接为 Vue 响应式引用的 `useModuleState`。

依赖：`@fusion-module/contracts`（仅类型）、`@fusion-module/runtime`（值依赖：`mountModule`/`unmountModule`）、`vue ^3.4`（peer，由宿主提供）。

构建：因包含 `.vue` SFC，本包是 monorepo 中唯一用 **vite build** 而非 tsup 构建的包（`@vitejs/plugin-vue` 编译 SFC，`vite-plugin-dts` 产出类型）。SFC 的 scoped 样式被抽取为独立产物 `runtime-vue.css`，经 `exports["./style.css"]` 暴露，`sideEffects: ["**/*.css"]` 防止打包器摇掉样式导入。

## 源码结构

```
packages/runtime-vue/src/
├── index.ts                              # 聚合导出
├── components/
│   ├── remote-module-slot.vue            # 核心组件：装载编排 + 竞态控制
│   ├── remote-module-loading.vue         # 默认 loading 兜底 UI（纯模板+CSS 动画）
│   ├── remote-module-error.vue           # 默认 error 兜底 UI（纯模板+CSS）
│   └── resolve-manifest.ts               # 已弃用的 fetchJson / normalizeManifestAssetUrl
└── hooks/
    └── use-module-state.ts               # useModuleState
```

## 导出面

```ts
// index.ts
export { default as RemoteModuleSlot } from './components/remote-module-slot.vue'
export { fetchJson, normalizeManifestAssetUrl } from './components/resolve-manifest'
export * from './hooks/use-module-state'
```

| 符号 | 状态 | 文档 |
|---|---|---|
| `RemoteModuleSlot` | 核心组件 | [RemoteModuleSlot](/runtime-vue/remote-module-slot) |
| `useModuleState` | 组合式函数 | [useModuleState](/runtime-vue/use-module-state) |
| `fetchJson` | **@deprecated**，仅兼容保留 | [内部组件与弃用 API](/runtime-vue/internals#弃用api) |
| `normalizeManifestAssetUrl` | **@deprecated**，仅兼容保留 | 同上 |

`remote-module-loading.vue` 与 `remote-module-error.vue` **不导出**：它们是 Slot 的私有兜底组件，外部通过 Slot 的 `#loading` / `#error` 插槽替换，而非直接引用。

## 内部依赖关系

```
index.ts
 ├── remote-module-slot.vue
 │     ├── vue（nextTick / onBeforeUnmount / onMounted / ref / shallowRef / useTemplateRef / watch）
 │     ├── @fusion-module/runtime（mountModule / unmountModule / type ModuleInstance）
 │     ├── @fusion-module/contracts（type ModuleManifest / ModuleRuntimeContext / RemoteModule）
 │     ├── remote-module-loading.vue（默认插槽内容）
 │     └── remote-module-error.vue（默认插槽内容）
 ├── resolve-manifest.ts（import type ← contracts；自身仅用 fetch / URL）
 └── hooks/use-module-state.ts
       ├── vue（onBeforeUnmount / ref）
       └── import type ← contracts（ModuleRuntimeContext）
```

注意 `useModuleState` **不依赖 runtime**：它面向协议接口 `ModuleState` 编程，与 runtime 的 `createModuleState` 实现解耦。整个包对 runtime 的值依赖只有 Slot 中的 `mountModule`/`unmountModule` 两个函数。
