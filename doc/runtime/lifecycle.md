# 生命周期实现（lifecycle/ 与 module-instance.ts）

生命周期层是 runtime 的对外编排入口，由三个文件组成：`module-instance.ts`（实例类型）、`lifecycle/mount-module.ts`（装载）、`lifecycle/unmount-module.ts`（卸载）。

## `ModuleInstance`

```ts
// module-instance.ts
import type { ModuleManifest, ModuleRuntimeContext, RemoteModule } from '@fusion-module/contracts'

export interface ModuleInstance {
  manifest: ModuleManifest
  remoteModule: RemoteModule
  container: HTMLElement
  context: ModuleRuntimeContext
}
```

一次**成功挂载**的完整快照，四个字段分别是挂载时使用的 manifest、加载得到的模块对象、挂载目标容器、注入的上下文。它是 `mountModule` 的返回值类型与 `unmountModule` 的入参类型，即挂载与卸载之间传递的**句柄**。

设计要点：

- 这是纯数据接口，**没有方法**。卸载逻辑放在独立函数 `unmountModule` 而非实例方法上，保持数据与行为分离，实例可被任意序列化/检查。
- `unmountModule` 当前只用到 `remoteModule` 字段，但句柄保留全部四项，使上层（如 runtime-vue 的 Slot 组件）能在卸载后做容器清理、或对照 manifest 判断实例归属。
- 文件本身仅含 `import type` 与 interface，编译后为空模块。

## `MountModuleOptions`

```ts
export interface MountModuleOptions {
  manifest: ModuleManifest
  container: HTMLElement
  context: ModuleRuntimeContext
}
```

`mountModule` 的入参对象。三个字段均必填（注意 `context` 在此层必填，可选性兜底是 runtime-vue 层用 `props.context || {}` 做的）。`manifest` 中真正被消费的字段只有 `entry` 与 `style`；`code`/`name`/`version`/`runtime`/`previewImage` 在装载过程中不被读取，仅随实例透传。

## `mountModule(options: MountModuleOptions): Promise<ModuleInstance>`

```ts
export const mountModule = async (options: MountModuleOptions) => {
  const { container, context, manifest } = options

  await loadStyle(manifest.style)                       // ①

  const remoteModule = await loadRemoteModule(manifest.entry)  // ②

  await remoteModule.mount(container, context)          // ③

  return { manifest, remoteModule, container, context } // ④
}
```

装载编排器，串行执行四步：

① **样式先行**：`await loadStyle(manifest.style)`。`style` 可选，`loadStyle` 对 `undefined` 直接返回（见 [loader](/runtime/loader#loadstyle)）。样式放在 import 之前且被 await，保证模块 `mount` 执行、首帧渲染时其样式已生效，避免 FOUC。样式加载失败会使整个 `mountModule` reject——样式被视为模块产物的硬依赖。

② **加载模块**：`await loadRemoteModule(manifest.entry)`，得到经结构校验的 `RemoteModule`（默认导出）。该步骤带 Promise 缓存，同 entry 重复装载不重复 import（见 [loader](/runtime/loader#loadremotemodule)）。

③ **执行模块挂载**：调用模块自己的 `mount(container, context)` 并 await。协议允许 `void | Promise<void>`，统一 await 抹平差异。`context` 在此处**原样传递**，运行时不注入、不合并任何默认能力。

④ **返回实例句柄**：把入参三项加上加载结果打包为 `ModuleInstance` 返回。返回的是新建字面量对象，与 options 对象本身无引用关系（但字段值同引用）。

错误语义：三个 await 任意一步 reject 都会使 `mountModule` reject，**没有内部 try/catch、没有部分回滚**——例如 ③ 失败时，①② 的样式与模块缓存仍保留（它们本就设计为跨实例共享），但不会产生 `ModuleInstance`。调用方（如 RemoteModuleSlot）负责失败后的容器清理。

并发语义：函数本身无锁、无去重。同一 container 上并发调用 `mountModule` 会导致两个模块先后挂进同一容器——防止这种情况是上层的职责（runtime-vue 用串行队列 + 版本号实现，见 [RemoteModuleSlot](/runtime-vue/remote-module-slot)）。

## `unmountModule(instance: ModuleInstance): Promise<void>`

```ts
export const unmountModule = async (instance: ModuleInstance) => {
  if (!instance) {
    throw new Error('Module instance is required')   // ①
  }
  await instance.remoteModule.unmount()              // ②
}
```

① **空值防御**：TypeScript 类型上 `instance` 必传，此处是针对 JS 调用方/类型断言漏洞的运行时防御。

② **委托卸载**：调用模块自身的 `unmount()` 并 await。协议中 `unmount` 无参数——模块通过自身闭包持有需要清理的资源。

边界明确：`unmountModule` **不清理容器 DOM、不卸载样式 `<link>`、不清除模块缓存**：

- 容器清理由上层负责（Slot 在 `cleanup` 中调用 `replaceChildren()`），因为容器属于宿主 DOM。
- 样式与模块缓存有意保留：同一模块再次挂载时直接复用，卸载不应使共享缓存失效。
- 若模块的 `unmount` 抛错，错误向上传播，调用方决定是否继续清理容器。

## 装载/卸载与上层的分工总表

| 动作 | runtime（本层） | runtime-vue（上层 Slot） |
|---|---|---|
| 解析 moduleCode → manifest | 不涉及 | `resolveManifest` prop |
| 样式注入 | `loadStyle` | — |
| 动态 import + 校验 | `loadRemoteModule` | —（`loadModule` 模式下由宿主替代） |
| 调用模块 `mount` | `mountModule` 第③步 | `loadModule` 模式下直接调用 |
| 竞态/串行控制 | 无 | `loadVersion` + `loadQueue` + `disposed` |
| 调用模块 `unmount` | `unmountModule` | 经 `cleanup` 调用本层 |
| 容器 DOM 清空 | 不做 | `replaceChildren()` |
| 加载状态 UI | 不涉及 | `loadStatus` 状态机 |
