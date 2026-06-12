# @fusion-module/contracts

协议与共享类型定义。**只有类型，没有运行时代码**——所有包都依赖它来对齐契约。

## 安装

```bash
pnpm add @fusion-module/contracts
```

## RemoteModule

每个模块必须默认导出的契约。

```ts
interface RemoteModule {
  mount(container: HTMLElement, context: ModuleRuntimeContext): void | Promise<void>
  unmount(): void | Promise<void>
}
```

详见 [mount / unmount 生命周期](/module/lifecycle)。

## ModuleManifestMeta

模块身份元信息，由模块在源码里维护。

```ts
interface ModuleManifestMeta {
  code: string      // 模块唯一编码
  name: string      // 模块名称
  version: string   // 模块版本
  runtime: string   // 运行时类型，例如 'vue-esm-app'
}
```

## ModuleManifest

完整 manifest = 元信息 + 资源地址。资源地址由构建插件或宿主补齐。

```ts
interface ModuleManifest extends ModuleManifestMeta {
  entry: string          // 模块 ESM 入口
  style?: string         // 样式文件地址，可选
  previewImage?: string  // 预览图地址，可选
}
```

## ModuleRuntimeContext

宿主注入给模块的运行时上下文。内核只定义最小集合，按需用[声明合并](/host/context#扩展-context)扩展。

```ts
interface ModuleRuntimeContext {
  config?: Record<string, unknown>
  event?: ModuleEventBus
  state?: ModuleState
}
```

## ModuleEventBus

跨模块事件总线。运行时实现见 [`createModuleEventBus`](/api/runtime#createmoduleeventbus)。

```ts
type ModuleEventHandler<T = unknown> = (payload: T) => void

interface ModuleEventBus {
  emit<T = unknown>(type: string, payload?: T): void
  on<T = unknown>(type: string, handler: ModuleEventHandler<T>): () => void  // 返回取消订阅函数
}
```

## ModuleState

跨模块键值状态。运行时实现见 [`createModuleState`](/api/runtime#createmodulestate)。

```ts
interface ModuleState {
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

## 扩展类型（声明合并）

用 TypeScript 声明合并给协议添加项目自己的字段，无需改内核：

```ts
declare module '@fusion-module/contracts' {
  interface ModuleRuntimeContext {
    axios?: AxiosInstance
    userInfo?: MyUserType
  }

  interface ModuleManifestMeta {
    placement?: { defaultSize?: { w: number; h: number } }
  }
}
```
