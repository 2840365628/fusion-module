# 状态容器实现（store/index.ts）

单文件，导出工厂函数 `createModuleState`，返回满足 contracts [`ModuleState`](/contracts#modulestate) 协议的对象。这是 runtime 包中唯一引入第三方运行时依赖的位置：`zustand/vanilla` 的 `createStore`（框架无关入口，不含任何 React/Vue 绑定）。

## 内部数据模型

```ts
type StateData = Record<string, unknown>

interface StoreState {
  data: StateData
}

const store = createStore<StoreState>(() => ({ data: {} }))
```

zustand store 的状态形状是 `{ data: Record<string, unknown> }`——所有键值都收在单一 `data` 字典下，而不是直接把键铺在 store 顶层。原因：zustand 的 `setState` 默认对**顶层**做浅合并，把用户数据收进 `data` 一层后，每次写操作都整体替换 `data` 对象（新引用），从而：

1. `delete`/`clear` 可以表达"键消失"（顶层浅合并模式下无法删除顶层键）；
2. 订阅端可以用 `data` 内的值做精确比较，而不依赖 zustand 的相等性配置。

与事件总线一样是闭包式工厂：每次调用创建独立 store，无模块级共享。

## `get<T>(key): T | undefined`

```ts
get<T>(key: string) {
  return store.getState().data[key] as T | undefined
}
```

直接读当前快照的 `data[key]`。键不存在返回 `undefined`。`as T` 是纯编译期断言，无运行时校验——类型正确性由调用方对 key 的使用约定保证。

## `set<T>(key, value): void`

```ts
set<T>(key: string, value: T) {
  store.setState((state) => ({
    data: { ...state.data, [key]: value },
  }))
}
```

函数式 `setState`：基于当前 `state.data` 展开生成**新字典**，覆盖/新增目标键。不可变更新保证 `data` 引用每次变化，zustand 据此触发所有 store 级订阅者（`subscribe` 的过滤在订阅端做，见下）。注意：即使写入与旧值相同的 value，`data` 引用仍会变化、store 仍会通知——按键过滤层会用 `Object.is` 把这种"无效变更"挡掉。

## `delete(key): void`

```ts
delete(key: string) {
  store.setState((state) => {
    const { [key]: _, ...rest } = state.data
    return { data: rest }
  })
}
```

用**计算属性名解构 + rest 展开**实现不可变删除：`{ [key]: _, ...rest }` 把目标键剥出（绑定到弃用变量 `_`），`rest` 即去掉该键的新字典。键不存在时 `rest` 等于原字典的浅拷贝（引用仍变化，触发一次通知，但订阅端 `Object.is(undefined, undefined)` 过滤后无回调）。被删除键的订阅者收到 `(undefined, oldValue)`。

## `clear(): void`

```ts
clear() {
  store.setState({ data: {} })
}
```

对象式 `setState`（顶层浅合并），将 `data` 整体替换为空字典。所有此前有值的键的订阅者各自收到 `(undefined, oldValue)`。

## `subscribe<T>(key, handler): () => void`

```ts
subscribe<T>(key: string, handler: (value: T | undefined, oldValue: T | undefined) => void) {
  let oldValue = store.getState().data[key] as T | undefined   // ①

  return store.subscribe((state) => {                          // ②
    const value = state.data[key] as T | undefined
    if (Object.is(value, oldValue)) return                     // ③

    const prev = oldValue                                      // ④
    oldValue = value
    handler(value, prev)                                       // ⑤
  })
}
```

这是实现的核心：把 zustand 的**整库订阅**适配成协议要求的**按键订阅**。

① **基线捕获**：订阅建立时立刻读取该键当前值存入闭包变量 `oldValue`。订阅时**不**立即触发 handler（非 immediate 语义），首次回调发生在下一次实际变更。

② **整库订阅 + 退订透传**：`store.subscribe(listener)` 在每次 `setState` 后同步调用 listener。其返回的取消函数被**直接返回**给调用方，符合协议"返回退订函数"的约定。

③ **按键过滤**：从新快照取出本键的值，与闭包中的 `oldValue` 做 `Object.is` 比较，相同则直接返回。因此：
   - 其它键的写入不会打扰本订阅者（本键值引用未变）；
   - 同值重写（`set(k, 同一引用)`）、对不存在键的 `delete`、空 `clear` 都被过滤；
   - 判等是**浅引用判等**——对同一对象做原地修改后重新 `set` 同引用不会触发（必须不可变更新值本身）；`Object.is` 相比 `===` 的差异在 `NaN`（视为相等，正确过滤）与 `±0`（视为不等，会触发）。

④⑤ **先更新基线、后调用 handler**：`prev` 暂存旧值 → `oldValue` 推进到新值 → 再调 `handler(value, prev)`。顺序很重要：若 handler 内部再次 `set` 同一键（同步重入），zustand 会再次同步触发本 listener，此时 `oldValue` 已是最新基线，重入回调拿到的 `(value, oldValue)` 链条保持正确，不会死循环（除非 handler 每次都写入不同值）。

通知时机：zustand vanilla 的 listener 在 `setState` 内**同步**执行，因此 `set()` 返回前所有相关 handler 已完成——与事件总线一致的同步语义。

## 与 runtime-vue 的衔接

`useModuleState`（[实现](/runtime-vue/use-module-state)）即建立在本接口上：`get` 取初值、`subscribe` 推动 Vue ref 更新、组件卸载时调用返回的退订函数。该 hook 只依赖协议接口，宿主放入 `context.state` 的任何符合 `ModuleState` 协议的实现都可替换本实现。
