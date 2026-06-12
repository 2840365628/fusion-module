# mount / unmount 生命周期

每个模块都必须默认导出一个实现了 `RemoteModule` 的对象：

```ts
export interface RemoteModule {
  mount(container: HTMLElement, context: ModuleRuntimeContext): void | Promise<void>
  unmount(): void | Promise<void>
}
```

运行时只认这个契约，不关心模块内部用什么框架。

## mount(container, context)

- `container`：宿主给的 DOM 容器（来自 `RemoteModuleSlot` 内部的 `remote_module_container`）。模块把自己的 UI 挂到这里。
- `context`：宿主注入的 [运行时上下文](/host/context)，包含 `event`、`state`，以及宿主扩展的 axios、queryClient 等。

`mount` 可以是异步的，运行时会 `await` 它。

```ts
import { createApp, h, type App } from 'vue'
import type { ModuleRuntimeContext, RemoteModule } from '@fusion-module/contracts'
import Root from './App.vue'
import { setHttp } from './apis/http'

let app: App<Element> | null = null

const remoteModule: RemoteModule = {
  mount(container: HTMLElement, context: ModuleRuntimeContext) {
    if (app) this.unmount() // 防御：重复挂载先清理

    // 复用宿主能力
    if (context.axios) setHttp(context.axios)

    app = createApp({
      render: () => h(Root, { context }),
    })

    // 复用宿主的 queryClient，让缓存跨模块共享
    app.use(VueQueryPlugin, { queryClient: context.queryClient })

    app.mount(container)
  },

  unmount() {
    app?.unmount()
    app = null
  },
}

export default remoteModule
```

::: tip 把 context 透传给业务组件
模块内部组件需要 `event`/`state`/`axios` 时，最简单的做法是把 `context` 作为 prop（或 `provide`）往下传，避免在多处重复取。
:::

## unmount()

`unmount` 负责释放模块占用的所有资源。运行时会在以下时机调用它：

- `RemoteModuleSlot` 的 `moduleCode` 切换到别的模块；
- 承载它的宿主组件被卸载；
- 加载过程中模块已被切走（运行时会立即 `unmount` 丢弃半挂载的实例）。

```ts
unmount() {
  app?.unmount()  // 销毁 Vue app
  app = null      // 必须置空！
}
```

::: warning 为什么必须把 app 置空
如果不置空，下一次 `mount` 时 `if (app) this.unmount()` 的判断会基于一个已销毁的引用，或者复用旧实例，导致状态与 DOM 错乱。其它有状态的资源（事件订阅、定时器、`ResizeObserver` 等）同理，都要在 `unmount` 里清理并复位。
:::

清理订阅的例子：

```ts
let offEvent: (() => void) | undefined

const remoteModule: RemoteModule = {
  mount(container, context) {
    offEvent = context.event?.on('patient:selected', (p) => { /* ... */ })
    // ...
  },
  unmount() {
    offEvent?.()
    offEvent = undefined
    app?.unmount()
    app = null
  },
}
```

## 运行时如何校验

模块被动态 import 后，运行时会检查默认导出：

```ts
const isRemoteModule = (value: unknown): value is RemoteModule =>
  !!value && typeof value === 'object'
  && typeof (value as any).mount === 'function'
  && typeof (value as any).unmount === 'function'
```

不满足就抛 `Invalid remote module export from entry: ...`。所以务必是 `export default { mount, unmount }`，而不是命名导出。

## 容器边界

运行时只会清空模块容器（`replaceChildren()`），不会动宿主的其它 DOM。模块也不应越界操作容器之外的 DOM、或往 `document.body` 上挂不清理的全局节点（如 teleport 到 body 的弹窗，要在 `unmount` 时一并销毁）。

## 加载去重

同一个 `entry` 在运行时层面有 import 去重缓存：并发加载同一模块只会 import 一次。但**实例**不是单例——同一模块在不同 slot 各自 `mount`，会各自调用一次 `mount`/`unmount`。模块内的模块级变量（如上面的 `app`）若要支持多实例并存，需改成每次 `mount` 独立的闭包/实例，而不是模块级单例。
