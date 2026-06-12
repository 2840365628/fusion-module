# 事件总线

模块之间**不能直接互相 import**，否则会变成编译期强耦合，宿主也失去运行时编排能力。跨模块通信走宿主提供的事件总线 `ModuleEventBus`。

## 接口

```ts
export type ModuleEventHandler<T = unknown> = (payload: T) => void

export interface ModuleEventBus {
  emit<T = unknown>(type: string, payload?: T): void
  on<T = unknown>(type: string, handler: ModuleEventHandler<T>): () => void
}
```

`on` 返回一个**取消订阅函数**。

## 创建（宿主侧）

宿主用 `createModuleEventBus()` 创建一份总线，放进 [context](/host/context) 注入给所有模块：

```ts
import { createModuleEventBus } from '@fusion-module/runtime'

const event = createModuleEventBus()

const context = { event, /* state, ... */ }
```

::: warning 全局只建一份
事件总线必须在宿主里全局唯一，所有模块共享同一份，才能互相收到事件。不要每个 slot 各建一个。
:::

## 发布 / 订阅（模块侧）

模块 A 发布事件：

```ts
context.event?.emit('patient:selected', { patientId: '1024' })
```

模块 B 订阅事件：

```ts
const off = context.event?.on<{ patientId: string }>('patient:selected', (payload) => {
  // 更新自己的状态
  currentPatientId.value = payload.patientId
})
```

## 一定要取消订阅

`on` 返回的 `off` 必须在模块 `unmount`（或组件卸载）时调用，否则模块卸载后监听器还在，造成内存泄漏甚至对已销毁实例的误操作。

```ts
let off: (() => void) | undefined

const remoteModule: RemoteModule = {
  mount(container, context) {
    off = context.event?.on('patient:selected', handlePatient)
    // ...
  },
  unmount() {
    off?.()
    off = undefined
    app?.unmount()
    app = null
  },
}
```

在 Vue 组件里订阅时，配合 `onBeforeUnmount`：

```ts
import { onBeforeUnmount } from 'vue'

const off = context.event?.on('patient:selected', handlePatient)
onBeforeUnmount(() => off?.())
```

## 行为细节

- `emit` 同步遍历当前订阅者调用，无异步队列。
- 同一 `type` 可以有多个订阅者，互不影响。
- 取消订阅后，若该 `type` 再无订阅者，总线内部会清理对应条目。
- `payload` 是可选的；`emit('refresh')` 这种无负载事件也合法。

## 约定事件命名

事件名是模块之间的隐式契约，建议用 `领域:动作` 的命名约定，并集中在共享类型文件里声明负载类型，避免各模块各写各的：

```ts
// shared/module-events.ts
export interface ModuleEvents {
  'patient:selected': { patientId: string }
  'order:created': { orderId: string }
}
```

## 事件 vs 状态

- **事件**适合"发生了一件事"的瞬时通知（选中了患者、提交了表单）。
- **[共享状态](/communication/state)** 适合"当前是什么"的持续值（当前患者、当前 tab）。

需要"最新值 + 变更通知"时用 state；只需要"通知一次"时用 event。服务端数据则优先走共享的 Vue Query `queryClient`。
