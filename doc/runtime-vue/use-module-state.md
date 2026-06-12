# useModuleState 实现（hooks/use-module-state.ts）

组合式函数，把协议接口 [`ModuleState`](/contracts#modulestate) 中的单个键桥接为 Vue 的响应式 `ref`，供运行在 Vue 中的远程模块（或宿主组件）以响应式方式消费共享状态。

只依赖 `vue`（`ref` / `onBeforeUnmount`）与 contracts 的类型；**不依赖 runtime**——它面向协议编程，宿主放入 `context.state` 的任何 `ModuleState` 实现均可配合。

## 完整源码

```ts
export const useModuleState = <T>(
  context: ModuleRuntimeContext,
  key: string,
  defaultValue: T | null = null,
): Ref<UnwrapRef<T> | null, T | UnwrapRef<T> | null> => {
  const stateValue = ref(
    context.state?.get<T>(key) ?? defaultValue,                  // ①
  ) as Ref<UnwrapRef<T> | null, T | UnwrapRef<T> | null>

  const off = context.state?.subscribe<T>(key, (value) => {      // ②
    stateValue.value = value ?? defaultValue                     // ③
  })

  onBeforeUnmount(() => {
    off?.()                                                      // ④
  })

  return stateValue
}
```

## 签名说明

- `context: ModuleRuntimeContext`：完整上下文对象。函数内部只取 `context.state`，且全程用可选链——**context.state 缺失时函数仍可用**，退化为一个初值为 `defaultValue` 的普通本地 ref（不报错、永不更新）。
- `key: string`：订阅的状态键。
- `defaultValue: T | null = null`：键无值（`undefined`）时的回退值，默认 `null`。
- 返回类型 `Ref<UnwrapRef<T> | null, T | UnwrapRef<T> | null>`：使用了 Vue 3.4+ 的双泛型 `Ref<Get, Set>` 形式——读出的是解包后的 `UnwrapRef<T> | null`，写入时接受 `T | UnwrapRef<T> | null`。`UnwrapRef` 来源于 `ref()` 对嵌套 ref 的解包行为；`as` 断言用于收窄 `ref()` 推导出的宽类型。

## 逐步行为

① **同步取初值**：调用瞬间用 `state.get<T>(key)` 读当前值，`?? defaultValue` 把 `undefined`（键不存在）替换为默认值。注意是 `??` 而非 `||`——`0`/`''`/`false` 等 falsy 有效值不会被错误回退。

② **建立订阅**：`state.subscribe(key, handler)` 注册按键监听，返回的退订函数存入 `off`。runtime 实现下（见 [store](/runtime/store#subscribe)），订阅不会立即触发，且初值已在 ① 同步取得，因此**不存在初值与首次通知之间的空窗**——除非在 ① 与 ② 之间状态恰好变化（同步代码间无 await，单线程下不可能）。

③ **更新回调**：每次该键变更，把新值写入 ref（`undefined` → `defaultValue`）。handler 忽略了协议提供的第二参数 `oldValue`。写入触发 Vue 的响应式传播，依赖该 ref 的组件随之更新。

④ **生命周期清理**：`onBeforeUnmount` 中调用退订函数。本 hook 必须在组件 `setup` 上下文中调用，否则 `onBeforeUnmount` 注册无效、订阅泄漏（Vue 会在开发模式警告）。

## 数据流方向

这是一个**单向桥**：`ModuleState` → `ref`。对返回的 ref 直接赋值**不会**写回共享状态（ref 只是本地副本），下一次该键变更还会把本地修改覆盖掉。写回需显式调用 `context.state.set(key, value)`——写入后经订阅链路 ②③ 同步回流到 ref。实现没有提供 `computed` 双向包装，这是当前刻意保持的最小实现。
