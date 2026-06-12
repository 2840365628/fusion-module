# RemoteModuleSlot

`RemoteModuleSlot` 是宿主页面里承载远程模块的 Vue 组件。它本身不做业务展示，职责是**管理模块生命周期**并处理加载竞态。

```ts
import { RemoteModuleSlot } from '@fusion-module/runtime-vue'
import '@fusion-module/runtime-vue/style.css'
```

## Props

| Prop | 类型 | 必填 | 说明 |
|---|---|---|---|
| `moduleCode` | `string` | 是 | 要加载的模块编码。变化时自动卸载旧模块、加载新模块。 |
| `context` | `ModuleRuntimeContext` | 否 | 注入给模块的运行时上下文。缺省为 `{}`。 |
| `resolveManifest` | `(moduleCode: string) => Promise<ModuleManifest>` | 见下 | 把 code 解析成完整 manifest，运行时据此加载样式并动态 import。 |
| `loadModule` | `(moduleCode: string) => Promise<RemoteModule>` | 见下 | 直接返回模块对象，加载逻辑完全自定义。 |

::: tip resolveManifest 与 loadModule
两者**至少提供一个**，推荐按环境选用：

- **开发态用 `loadModule`**：直连模块 dev server 源码入口，享受 HMR、效率更高；运行时只负责 `mount`（样式由 Vite 注入进 JS，不走 `loadStyle`）。
- **生产态用 `resolveManifest`**：解析出构建产物 manifest，运行时帮你 `loadStyle` + 动态 import + 校验导出。

两者都提供时 `loadModule` 优先，所以常见做法是开发态给 `loadModule`、生产态置 `undefined` 自动回落。详见 [解析模块](/host/resolve-manifest)。
:::

## 基本用法

```vue
<template>
  <RemoteModuleSlot
    :module-code="currentCode"
    :resolve-manifest="resolveManifest"
    :context="context"
  />
</template>
```

## 自定义 loading / error

组件内置了 loading 与 error 占位，可用具名插槽覆盖：

```vue
<template>
  <RemoteModuleSlot :module-code="code" :resolve-manifest="resolveManifest" :context="context">
    <template #loading>
      <MySpinner />
    </template>
    <template #error>
      <MyErrorState>模块加载失败，请重试</MyErrorState>
    </template>
  </RemoteModuleSlot>
</template>
```

## 它如何处理生命周期与竞态

模块加载是异步的，用户又可能快速切换 `moduleCode`，所以组件内部有三道保护：

| 机制 | 作用 |
|---|---|
| `loadVersion` | 每次加载自增版本号。异步返回时校验版本是否仍是当前，避免**旧请求覆盖新模块**。 |
| `disposed` | 组件已 `onBeforeUnmount` 时置位，阻止继续挂载。 |
| `loadQueue` | 把"卸载旧模块 → 加载挂载新模块"串行化，避免旧模块没卸完、新模块已挂上。 |

加载流程（简化）：

```txt
moduleCode 变化 / 组件挂载
        ↓ 入 loadQueue 串行
cleanup()           卸载上一个实例、清空容器
        ↓
loadStatus = 'loading'
        ↓
loadModule(code)  或  resolveManifest(code)
        ↓ 校验仍是当前版本
loadStatus = 'success' → nextTick（让容器先进 DOM）
        ↓
mount(container, context)
        ↓ 若期间已切走 → 立刻 unmount 丢弃
moduleInstance = instance
```

失败时容器会被清空、`loadStatus` 置为 `'failed'`，并在控制台打印 `${moduleCode} 模块加载失败` 与原因。

组件卸载时（`onBeforeUnmount`）会等待队列清空再 `cleanup`，保证模块的 `unmount` 一定被调用。

## DOM 结构与样式

组件渲染出一个相对定位的外壳，内部是模块容器 + 覆盖层：

```html
<div class="remote_module_slot">
  <div class="remote_module_container"><!-- 模块挂这里 --></div>
  <div class="remote_module_loading">…</div>  <!-- loading 时 -->
  <div class="remote_module_error">…</div>    <!-- failed 时 -->
</div>
```

容器使用 `display:flex; flex-direction:column; min-height:0`，适合让模块自身撑满高度。如果模块需要固定高度，给 `RemoteModuleSlot` 外层容器一个明确的尺寸即可。

::: warning 容器边界
运行时只会 `replaceChildren()` 清空 `remote_module_container` 这一层，不会触碰宿主自己的 DOM。请不要把宿主的业务 DOM 直接塞进模块容器内。
:::
