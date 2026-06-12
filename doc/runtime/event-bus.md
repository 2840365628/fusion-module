# 事件总线实现（event/create-module-event-bus.ts）

单文件，导出一个工厂函数 `createModuleEventBus`，返回满足 contracts [`ModuleEventBus`](/contracts#moduleeventbus) 协议的对象。对 contracts 仅 `import type`，无其它依赖。

## 整体结构

```ts
export const createModuleEventBus = (): ModuleEventBus => {
  const listeners = new Map<string, Set<ModuleEventHandler>>()
  const on = ...
  const emit = ...
  return { emit, on }
}
```

闭包式实现：每次调用工厂都创建一个**独立的** `listeners` 表，返回的 `emit`/`on` 经闭包捕获它。没有模块级共享状态——总线之间完全隔离，宿主可按需创建任意多条（全局一条、每模块一条等，运行时不做规定）。

## 内部数据结构：`listeners`

```ts
const listeners = new Map<string, Set<ModuleEventHandler>>()
```

- 外层 `Map`：事件类型字符串 → 处理器集合。
- 内层 `Set`：天然去重——同一 handler 引用对同一 type 重复 `on`，只会存在一份，emit 时只触发一次；对应地，一次退订即完全移除。
- 存储时 handler 被擦除为 `ModuleEventHandler`（即 `(payload: unknown) => void`），泛型只存在于 `on`/`emit` 的签名层。

## `on<T>(type, handler): () => void`

```ts
const on = <T = unknown>(type: string, handler: ModuleEventHandler<T>) => {
  const handlers = listeners.get(type) ?? new Set<ModuleEventHandler>()

  handlers.add(handler as ModuleEventHandler)
  listeners.set(type, handlers)                     // ①

  return () => {                                    // ② 取消订阅闭包
    handlers.delete(handler as ModuleEventHandler)

    if (handlers.size === 0) {
      listeners.delete(type)                        // ③
    }
  }
}
```

① **惰性建集 + 幂等回写**：type 首次订阅时新建 `Set`；`listeners.set` 在集合已存在时是幂等覆盖（同一引用），代码因此无需区分两种情况。

② **返回取消函数**：闭包捕获的是 `handlers` 这个 **Set 引用**与 `handler` 引用，而非再次按 type 查表。这带来一个值得注意的细节：若该 type 的条目曾因 ③ 被整体删除、之后又有新订阅创建了**新的 Set**，旧的取消函数操作的仍是旧 Set，不影响新集合——退订函数严格只退自己当时注册的那一份，无误伤。取消函数可安全多次调用（`Set.delete` 幂等）。

③ **空集回收**：集合清空时把整个 type 条目从 Map 删除，避免长生命周期总线累积空 Set（订阅类型很多且频繁退订的场景下的内存卫生）。

## `emit<T>(type, payload?): void`

```ts
const emit = <T = unknown>(type: string, payload?: T) => {
  listeners.get(type)?.forEach((handler) => {
    handler(payload)
  })
}
```

- **同步派发**：直接 `forEach` 调用，emit 返回时所有 handler 已执行完毕。无微任务调度、无队列。
- **无订阅静默**：type 不存在时经可选链短路，emit 是 no-op。
- **无错误隔离**：某个 handler 抛错会中断本次 `forEach`，**后续 handler 不再执行**，错误向 emit 调用方传播。这是当前实现的明确语义（非 try/catch 包裹的容错派发）。
- **派发期间增删订阅**：`Set.forEach` 的语义是——遍历期间被删除且尚未访问的条目不会被访问；遍历期间新增的条目**会**在本轮被访问。即 emit 过程中 `on` 同 type 的新 handler 可能立即收到本次事件。

## 类型层面的约定

`on<T>` 与 `emit<T>` 的 `T` 互相独立，运行时不存在任何 type→payload 类型注册表；同一 `type` 在两端声明不一致时编译器无法发现。类型安全程度等同于常见的轻量 mitt 风格总线，靠调用方自律或在宿主侧用封装层收紧。
