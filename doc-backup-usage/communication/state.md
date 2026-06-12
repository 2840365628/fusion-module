# 共享状态

`ModuleState` 是宿主提供的跨模块键值状态容器，适合保存**跨模块共享的小状态**：当前患者、当前 tab、当前筛选条件等。

## 接口

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

`subscribe` 返回取消订阅函数；只有当某个 key 的值真正变化（`Object.is` 比较）时才触发 handler。

## 创建（宿主侧）

宿主用 `createModuleState()` 创建一份（底层是 `zustand/vanilla`），放进 [context](/host/context)：

```ts
import { createModuleState } from '@fusion-module/runtime'

const state = createModuleState()
const context = { state, /* event, ... */ }
```

::: warning 全局只建一份
和事件总线一样，共享状态必须全局唯一，所有模块共享同一份才有意义。
:::

## 在模块里读写

```ts
// 写
context.state?.set('currentPatient', { id: '1024', name: '张三' })

// 读
const patient = context.state?.get<{ id: string; name: string }>('currentPatient')

// 订阅变化
const off = context.state?.subscribe('currentPatient', (value, oldValue) => {
  console.log('患者从', oldValue, '变为', value)
})

// 删除 / 清空
context.state?.delete('currentPatient')
context.state?.clear()
```

订阅记得在 `unmount` 时调用 `off()`。

## Vue 侧：useModuleState

`@fusion-module/runtime-vue` 提供 `useModuleState`，把某个 key 包装成响应式 `ref`，并自动在组件卸载时取消订阅：

```ts
import { useModuleState } from '@fusion-module/runtime-vue'

const patient = useModuleState<{ id: string; name: string }>(
  context,            // 模块拿到的 ModuleRuntimeContext
  'currentPatient',   // key
  null,               // 默认值（可选）
)

// patient 是一个 Ref，值会随 state 变化自动更新
watch(patient, (p) => {
  // ...
})
```

签名：

```ts
useModuleState<T>(
  context: ModuleRuntimeContext,
  key: string,
  defaultValue?: T | null,
): Ref<T | null>
```

- 初始值取 `context.state?.get(key)`，没有则用 `defaultValue`。
- 内部 `subscribe` 该 key，值变化时更新 ref；值为 `undefined` 时回落到 `defaultValue`。
- 组件 `onBeforeUnmount` 时自动取消订阅，无需手动清理。

::: tip useModuleState 只读不写
`useModuleState` 返回的 ref 反映 state 的当前值。要更新共享状态，仍然调用 `context.state?.set(key, value)`——这样所有订阅该 key 的模块都会收到更新。直接改 ref 的 `.value` 不会写回 state。
:::

## state vs 事件 vs queryClient

| 场景 | 用什么 |
|---|---|
| 跨模块共享"当前是什么"（持续值 + 变更通知） | `state` / `useModuleState` |
| 跨模块通知"发生了一件事"（瞬时） | [事件总线](/communication/events) |
| 跨模块共享**服务端数据**（缓存、请求去重、失效） | 同一个 Vue Query `queryClient` |

不要把大块服务端数据塞进 `state`——那是 queryClient 的职责。`state` 适合轻量的 UI/业务联动状态。
