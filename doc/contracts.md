# @fusion-module/contracts 实现说明

协议层。整包只有两个源文件，**不包含任何可执行代码**，构建产物（tsup，ESM）中仅有类型声明与一条空的重导出。

```
packages/contracts/src/
├── index.ts    # export * from './module'
└── module.ts   # 全部协议定义
```

`package.json` 关键事实：无 dependencies、无 peerDependencies、`"sideEffects": false`。所有下游包以 `import type` 引用本包，因此它在下游的运行时产物中**完全消失**，只在编译期起作用。

以下逐一说明 `module.ts` 中的每个导出。

## `ModuleEventHandler<T>`

```ts
export type ModuleEventHandler<T = unknown> = (payload: T) => void
```

事件处理器函数类型。单参数 `payload`，无返回值。泛型 `T` 默认 `unknown`，由 `ModuleEventBus.on` 的调用方指定。它是 `ModuleEventBus` 与 runtime 中 `createModuleEventBus` 内部 `Map<string, Set<ModuleEventHandler>>` 共用的原子类型。

## `ModuleEventBus`

```ts
export interface ModuleEventBus {
  emit<T = unknown>(type: string, payload?: T): void
  on<T = unknown>(type: string, handler: ModuleEventHandler<T>): () => void
}
```

事件总线协议，只规定两个方法：

- `emit(type, payload?)`：同步派发。`payload` 可选——协议层面允许无载荷事件。
- `on(type, handler)`：订阅，**返回值是取消订阅函数** `() => void`。协议刻意不提供 `off(type, handler)` 形式，退订只能通过持有返回的函数完成，从而避免"用不同函数引用退订失败"的经典问题。

泛型 `T` 标注在**方法级**而非接口级：同一条总线上不同 `type` 可以携带不同载荷类型，类型安全由调用点自行声明。

运行时实现见 [`createModuleEventBus`](/runtime/event-bus)。

## `ModuleState`

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

字符串键值状态容器协议：

- `get(key)`：读取，键不存在时返回 `undefined`（类型上体现为 `T | undefined`）。
- `set(key, value)`：写入或覆盖。
- `delete(key)`：删除单键。
- `clear()`：清空全部键。
- `subscribe(key, handler)`：**按键订阅**变更。handler 收到 `(value, oldValue)` 两个参数，均可能为 `undefined`（键被删除或此前不存在）。与 `on` 一致，返回取消订阅函数。

协议不规定通知时机（同步/异步）、判等策略（深/浅），这些是实现细节——runtime 的实现（[`createModuleState`](/runtime/store)）采用同步通知 + `Object.is` 浅判等。

## `ModuleRuntimeContext`

```ts
export interface ModuleRuntimeContext {
  config?: Record<string, unknown>
  event?: ModuleEventBus
  state?: ModuleState
}
```

宿主注入给远程模块的运行时上下文。**三个字段全部可选**——这是协议的核心宽容性设计：

- `config`：任意配置字典，类型仅约束为 `Record<string, unknown>`。
- `event`：满足 `ModuleEventBus` 协议的事件总线实例。
- `state`：满足 `ModuleState` 协议的状态容器实例。

由于是 interface，宿主可以通过声明合并或直接扩展子类型附加任意字段（如 http 客户端等），协议层不限制额外属性。runtime 与 runtime-vue 对该对象的处理都是**不透明透传**：不读取字段、不做默认值合并（runtime-vue 仅在未传时用 `{}` 兜底）。

## `RemoteModule`

```ts
export interface RemoteModule {
  mount(container: HTMLElement, context: ModuleRuntimeContext): void | Promise<void>
  unmount(): void | Promise<void>
}
```

远程模块的生命周期协议，即模块 entry 的**默认导出**必须满足的形状：

- `mount(container, context)`：模块把自己渲染进 `container`。返回 `void | Promise<void>`，运行时统一 `await`，因此同步/异步实现等价。
- `unmount()`：模块销毁自身（解绑事件、卸载框架实例等）。同样允许异步。

注意 `unmount` 不接收参数：协议假定模块自身闭包持有 mount 时创建的资源。运行时对该协议的结构校验（duck typing：`mount`/`unmount` 均为函数）实现在 [`loadRemoteModule.isRemoteModule`](/runtime/loader#isremotemodule)。

## `ModuleManifestMeta`

```ts
export interface ModuleManifestMeta {
  code: string
  name: string
  version: string
  runtime: string
}
```

manifest 的**元信息子集**，四个必填字符串：

- `code`：模块唯一标识，运行时以它定位模块。
- `name`：人类可读名称。
- `version`：模块版本。
- `runtime`：模块所属运行时/技术栈标识。

把元信息独立成接口的原因是构建期协作：`vite-plugin-module-manifest` 的选项只要求用户提供 `ModuleManifestMeta`（人工维护的部分），产物路径字段（机器可推导的部分）由插件补全成完整 `ModuleManifest`。

## `ModuleManifest`

```ts
export interface ModuleManifest extends ModuleManifestMeta {
  entry: string
  style?: string
  previewImage?: string
}
```

完整模块描述 = 元信息 + 产物定位：

- `entry`（必填）：模块 ESM 入口的 URL/路径，最终被 runtime 以 `import(entry)` 加载，因此必须是浏览器可解析的地址。
- `style`（可选）：独立样式文件地址，存在时由 runtime 在 import entry **之前**以 `<link rel="stylesheet">` 注入。
- `previewImage`（可选）：预览图地址。**运行时不消费该字段**，它只由 manifest 插件写入、由宿主侧自行取用（如模块市场缩略图）。

该类型是全仓库的协作枢纽：manifest 插件按它生成 JSON（[实现](/vite-plugin-module-manifest)），`mountModule` 按它消费（[实现](/runtime/lifecycle#mountmodule)），`RemoteModuleSlot` 的 `resolveManifest` prop 按它约束返回值（[实现](/runtime-vue/remote-module-slot)）。

## `index.ts`

```ts
export * from './module'
```

唯一作用是聚合导出，使包入口 `@fusion-module/contracts` 暴露 `module.ts` 的全部类型。
