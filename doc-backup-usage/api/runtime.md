# @fusion-module/runtime

框架无关的运行时：加载远程 ESM、管理生命周期、提供事件总线与共享状态。

## 安装

```bash
pnpm add @fusion-module/runtime @fusion-module/contracts
```

## 导出一览

| 导出 | 类型 | 说明 |
|---|---|---|
| `mountModule` | 函数 | 加载样式 + 动态 import + 挂载，返回 `ModuleInstance`。 |
| `unmountModule` | 函数 | 调用模块的 `unmount`。 |
| `createModuleEventBus` | 函数 | 创建 `ModuleEventBus`。 |
| `createModuleState` | 函数 | 创建 `ModuleState`（底层 zustand/vanilla）。 |
| `ModuleInstance` | 类型 | 一次挂载的句柄。 |
| `MountModuleOptions` | 类型 | `mountModule` 的入参。 |

> `loadRemoteModule` / `loadStyle` 是内部实现，不在公共导出中。`mountModule` 会在内部调用它们。

## mountModule

```ts
interface MountModuleOptions {
  manifest: ModuleManifest
  container: HTMLElement
  context: ModuleRuntimeContext
}

function mountModule(options: MountModuleOptions): Promise<ModuleInstance>
```

依次执行：

1. `loadStyle(manifest.style)` —— 若有样式，注入 `<link>` 并等待加载完成（按 URL 去重）。
2. 动态 `import(manifest.entry)` —— 加载远程 ESM，校验默认导出实现了 `mount`/`unmount`（按 entry 去重缓存）。
3. `remoteModule.mount(container, context)`。
4. 返回 `ModuleInstance`。

```ts
import { mountModule } from '@fusion-module/runtime'

const instance = await mountModule({
  manifest,            // 已含绝对 entry/style
  container: el,
  context,
})
```

## unmountModule

```ts
function unmountModule(instance: ModuleInstance): Promise<void>
```

调用 `instance.remoteModule.unmount()`。`instance` 为空时抛错。运行时不替模块猜测如何清理资源——由模块自己在 `unmount` 里完成。

```ts
import { unmountModule } from '@fusion-module/runtime'
await unmountModule(instance)
```

## ModuleInstance

```ts
interface ModuleInstance {
  manifest: ModuleManifest
  remoteModule: RemoteModule
  container: HTMLElement
  context: ModuleRuntimeContext
}
```

`mountModule` 的返回值，持有它即可在之后 `unmountModule`。

## createModuleEventBus

```ts
function createModuleEventBus(): ModuleEventBus
```

创建一个进程内事件总线。`emit` 同步派发；`on` 返回取消订阅函数，最后一个订阅者移除后会清理该事件条目。用法见 [事件总线](/communication/events)。

```ts
import { createModuleEventBus } from '@fusion-module/runtime'

const event = createModuleEventBus()
const off = event.on('ping', (p) => console.log(p))
event.emit('ping', { at: Date.now() })
off()
```

## createModuleState

```ts
function createModuleState(): ModuleState
```

创建一个键值状态容器，底层 `zustand/vanilla`。`subscribe` 仅在值变化（`Object.is`）时触发 handler，并回传旧值。用法见 [共享状态](/communication/state)。

```ts
import { createModuleState } from '@fusion-module/runtime'

const state = createModuleState()
state.set('tab', 'overview')
const off = state.subscribe('tab', (v, old) => console.log(old, '→', v))
```

## 缓存与去重行为

- **样式**：同一 style URL 只注入一次 `<link>`；并发调用复用同一 Promise；加载失败会从缓存移除以便重试。
- **模块**：同一 `entry` 只 `import` 一次；并发加载复用同一 Promise；失败会从缓存移除以便重试。
