# 核心概念

fusion-module 的全部协议都定义在 [`@fusion-module/contracts`](/api/contracts) 里，**只有类型、没有运行时代码**。理解这几个概念，就理解了整套方案。

## RemoteModule —— 模块契约

任何模块最终都必须**默认导出**一个满足 `RemoteModule` 的对象：

```ts
export interface RemoteModule {
  mount(container: HTMLElement, context: ModuleRuntimeContext): void | Promise<void>
  unmount(): void | Promise<void>
}
```

- `mount(container, context)`：把模块挂载到宿主给的 DOM 容器里，`context` 是宿主注入的运行时能力。
- `unmount()`：卸载模块，释放 Vue app、事件监听、副作用等资源。

宿主不关心模块内部怎么写页面，只关心它是否满足这个契约。运行时在动态 `import` 之后会校验默认导出是否同时具备 `mount` 和 `unmount`，否则抛错。

详见 [mount / unmount 生命周期](/module/lifecycle)。

## ModuleManifest —— 模块的元信息

manifest 描述模块"是谁、在哪里"：

```ts
export interface ModuleManifestMeta {
  code: string      // 模块唯一编码，宿主通过它加载模块
  name: string      // 模块名称，用于展示或调试
  version: string   // 模块版本
  runtime: string   // 运行时类型，例如 'vue-esm-app'
}

export interface ModuleManifest extends ModuleManifestMeta {
  entry: string          // 模块 ESM 入口（运行时 import 的地址）
  style?: string         // 模块样式文件地址，可选
  previewImage?: string  // 模块预览图地址，可选（用于模块市场/选择器）
}
```

模块本地通常只维护 `ModuleManifestMeta`（code/name/version/runtime）。`entry`、`style`、`previewImage` 这些**资源地址**由构建插件或宿主在装载时补齐。

::: tip 为什么拆成 Meta 和 完整 Manifest？
模块在源码里只知道自己的身份（meta），不知道自己将来被部署到哪个 URL。资源地址是部署/装载阶段的信息，所以由 [构建插件](/module/manifest-plugin) 或宿主补齐。
:::

## ModuleRuntimeContext —— 宿主注入的能力

`context` 是宿主在 `mount` 时传给模块的运行时上下文。内核只定义最小集合：

```ts
export interface ModuleRuntimeContext {
  config?: Record<string, unknown>
  event?: ModuleEventBus
  state?: ModuleState
}
```

模块不应该自己创建一套全新的 axios、QueryClient、事件总线、用户状态——否则宿主和模块、模块 A 和模块 B 之间会出现多份割裂的状态。统一由宿主提供，模块只消费。

需要注入更多能力（axios、queryClient、userInfo……）时，用 TypeScript [声明合并](/host/context#扩展-context) 扩展 `ModuleRuntimeContext`，而不是改内核：

```ts
declare module '@fusion-module/contracts' {
  interface ModuleRuntimeContext {
    axios?: AxiosInstance
    queryClient?: QueryClient
    userInfo?: MyUserType
  }
}
```

详见 [注入运行时上下文](/host/context)。

## ModuleEventBus —— 跨模块事件

模块之间不能直接互相 `import`，否则会变成编译期强耦合。跨模块通信走宿主提供的事件总线：

```ts
export interface ModuleEventBus {
  emit<T = unknown>(type: string, payload?: T): void
  on<T = unknown>(type: string, handler: ModuleEventHandler<T>): () => void
}
```

`on` 返回取消订阅函数，模块卸载时务必调用以避免泄漏。详见 [事件总线](/communication/events)。

## ModuleState —— 跨模块共享状态

适合保存跨模块共享的小状态（当前患者、当前 tab、当前筛选条件）：

```ts
export interface ModuleState {
  get<T = unknown>(key: string): T | undefined
  set<T = unknown>(key: string, value: T): void
  delete(key: string): void
  clear(): void
  subscribe<T = unknown>(
    key: string,
    handler: (value: T | undefined, oldValue: T | undefined) => void,
  ): () => void
}
```

运行时提供 `createModuleState()`（底层 zustand/vanilla）实现；Vue 侧提供 [`useModuleState`](/communication/state) 把某个 key 包装成响应式 `ref`。

## 各概念的关系

```txt
ModuleManifestMeta  ──构建/装载补齐资源地址──▶  ModuleManifest
                                                    │ entry/style
                                                    ▼
宿主 moduleCode ──resolveManifest/loadModule──▶ 运行时动态 import ──▶ RemoteModule
                                                                          │ mount(container, context)
                                  ModuleRuntimeContext ────────────────────┘
                                  （event / state / 宿主扩展能力）
```

理解了这张图，就可以去看 [架构与加载链路](/guide/architecture) 里更完整的运行链路。
