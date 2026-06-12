# 宿主集成总览

宿主是模块的"运行容器"。它负责三件事，缺一不可：

1. **解析模块** —— 把 `moduleCode` 变成可加载的 `ModuleManifest`（或直接变成 `RemoteModule`）。见 [解析模块](/host/resolve-manifest)。
2. **注入上下文** —— 提供事件总线、共享状态，以及自定义的 axios、queryClient、用户信息等公共能力。见 [注入运行时上下文](/host/context)。
3. **治理公共依赖** —— 通过 import map 让所有模块复用宿主那一份 Vue / Element Plus，避免多实例。见 [共享依赖与 import map](/host/shared-deps)。

在 Vue 应用里，这三件事最终都汇集到一个组件上：[`RemoteModuleSlot`](/host/remote-module-slot)。

## 最小集成

```vue
<script setup lang="ts">
import { RemoteModuleSlot } from '@fusion-module/runtime-vue'
import '@fusion-module/runtime-vue/style.css'
import { createModuleEventBus, createModuleState } from '@fusion-module/runtime'
import type { ModuleRuntimeContext } from '@fusion-module/contracts'
import { resolveManifest } from './resolve-manifest'

// 整个宿主通常共用同一份 context，模块之间才能共享 event/state
const context: ModuleRuntimeContext = {
  event: createModuleEventBus(),
  state: createModuleState(),
}
</script>

<template>
  <RemoteModuleSlot
    :module-code="currentModuleCode"
    :resolve-manifest="resolveManifest"
    :context="context"
  />
</template>
```

::: warning 不要忘记样式
`RemoteModuleSlot` 自带 loading / error 占位样式，需要在宿主入口引入一次：

```ts
import '@fusion-module/runtime-vue/style.css'
```
:::

## 一份 context，全局复用

事件总线和共享状态的意义在于**跨模块**。如果每个 slot 各 new 一个 `context`，模块之间就无法通信。所以通常在宿主初始化时创建**唯一一份** context，再传给所有 slot：

```ts
// apps/host/src/runtime-context.ts
import { createModuleEventBus, createModuleState } from '@fusion-module/runtime'
import type { ModuleRuntimeContext } from '@fusion-module/contracts'

export const moduleRuntimeContext: ModuleRuntimeContext = {
  event: createModuleEventBus(),
  state: createModuleState(),
  // 下面这些字段需要先通过声明合并扩展 ModuleRuntimeContext
  // axios: request,
  // queryClient,
  // userInfo: getUserInfo(),
}
```

## 接下来

- [RemoteModuleSlot](/host/remote-module-slot)：props、插槽、生命周期与竞态处理。
- [解析模块](/host/resolve-manifest)：`resolveManifest` 与 `loadModule` 两种路径。
- [注入运行时上下文](/host/context)：用声明合并扩展 `ModuleRuntimeContext`。
- [共享依赖与 import map](/host/shared-deps)：生产 import map 与开发 devImports。
