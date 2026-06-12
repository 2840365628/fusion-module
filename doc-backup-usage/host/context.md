# 注入运行时上下文

`context`（`ModuleRuntimeContext`）是宿主在 `mount` 时传给模块的运行时能力集合。它是 fusion-module 里非常关键的设计：**模块不自己创建公共能力，而是消费宿主注入的能力**，这样宿主和模块、模块与模块之间才共享同一套状态。

## 内核只定义最小集合

```ts
export interface ModuleRuntimeContext {
  config?: Record<string, unknown>
  event?: ModuleEventBus
  state?: ModuleState
}
```

- `config`：任意配置对象，宿主想传什么就传什么。
- `event`：跨模块 [事件总线](/communication/events)。
- `state`：跨模块 [共享状态](/communication/state)。

内核刻意不内置 axios、queryClient、userInfo 这类业务能力——它们因项目而异。需要时由宿主用**声明合并**扩展。

## 扩展 context

用 TypeScript [declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) 给 `ModuleRuntimeContext` 添加项目自己的字段。建议放在宿主和模块都能引用到的共享类型文件里：

```ts
// shared/fusion-augment.d.ts
import type { AxiosInstance } from 'axios'
import type { QueryClient } from '@tanstack/vue-query'

declare module '@fusion-module/contracts' {
  interface ModuleRuntimeContext {
    axios?: AxiosInstance
    queryClient?: QueryClient
    userInfo?: { id: string; name: string } | null
    dicts?: {
      requestFn?: (codes: string[]) => Promise<Record<string, unknown>>
    }
  }
}

export {}
```

扩展后，宿主和模块两侧都会得到带新字段的类型，无需改动内核包。

## 在宿主里构建 context

```ts
// apps/host/src/runtime-context.ts
import { createModuleEventBus, createModuleState } from '@fusion-module/runtime'
import type { ModuleRuntimeContext } from '@fusion-module/contracts'
import { request } from './http'
import { queryClient } from './query-client'
import { getUserInfo } from './auth'

export const moduleRuntimeContext: ModuleRuntimeContext = {
  event: createModuleEventBus(),
  state: createModuleState(),
  axios: request,
  queryClient,
  userInfo: getUserInfo(),
  dicts: { requestFn: getDictsRequest },
}
```

::: warning 全局只建一份
`event` 和 `state` 的意义在于跨模块共享。请在宿主初始化时创建**唯一一份** context，传给所有 `RemoteModuleSlot`；不要每个 slot 各 new 一个，否则模块之间无法通信、无法共享状态。
:::

## 模块如何消费

模块在 `mount(container, context)` 里拿到 context，按需取用：

```ts
const remoteModule: RemoteModule = {
  mount(container, context) {
    // 复用宿主的 axios：模块内的请求自动带上宿主的拦截器、token、错误处理
    if (context.axios) setupHttp(context.axios)

    app = createApp(Root, { context })

    // 复用宿主的 queryClient：缓存可跨模块/宿主共享
    app.use(VueQueryPlugin, { queryClient: context.queryClient })
    app.mount(container)
  },
  unmount() {
    app?.unmount()
    app = null
  },
}
```

这样模块不需要知道宿主系统内部如何登录、如何取 token、如何配请求拦截器，只消费 `context`。

## 该放进 context 的，和不该放的

**适合放进 context：** 公共运行时能力——请求实例、查询缓存、事件总线、共享状态、当前用户/部门、字典请求函数等。这些应当全局唯一、被所有模块复用。

**不要放进 context：** 某个模块私有的业务逻辑或状态。那是模块自己的事，放进 context 只会让协议变脏、让模块互相耦合。

## 服务端数据优先走共享 queryClient

跨模块共享**小状态**（当前患者、当前 tab）用 `state`；跨模块共享**服务端数据**优先用同一个 Vue Query `queryClient`，让缓存、请求去重、失效逻辑天然跨模块复用，而不是把大块服务端数据塞进 `state`。
