# RemoteModuleSlot 实现（components/remote-module-slot.vue）

本组件是整个体系中逻辑密度最高的文件：它把 runtime 的命令式装载流程封装为受 Vue 生命周期驱动的声明式组件，核心难点是**模块切换与组件卸载的竞态控制**。本页按"接口 → 响应式状态 → 竞态原语 → 各函数 → 生命周期接线 → 模板"的顺序完整说明。

## Props 接口

```ts
const props = defineProps<{
  moduleCode: string
  context?: ModuleRuntimeContext
  resolveManifest: (moduleCode: string) => Promise<ModuleManifest>
  loadModule?: (moduleCode: string) => Promise<RemoteModule>
}>()
```

- `moduleCode`：当前要装载的模块标识，是唯一被 `watch` 的响应式输入；变化触发重新装载。
- `context`：透传给模块 `mount` 的运行时上下文；未提供时在调用点以 `{}` 兜底。组件**不会**对 context 变化做响应（未 watch）——切 context 不会触发重挂。
- `resolveManifest`：moduleCode → `ModuleManifest` 的解析函数，由宿主实现（如何获取 manifest 是宿主自由）。
- `loadModule`：可选的高优先级旁路——直接返回 `RemoteModule` 对象，**完全绕开** runtime 的 `mountModule`（即不走 `loadStyle`/`loadRemoteModule`），适用于宿主自己掌握模块获取方式（如 dev 模式 `import.meta.glob` 本地源码）。两者的选择在 `loadAndMount` 中：`loadModule` 存在则优先。

## 响应式状态

```ts
const moduleContainerRef = useTemplateRef('moduleContainerRef')
const moduleInstance = shallowRef<ModuleInstance | null>(null)
const loadStatus = ref<'loading' | 'success' | 'failed'>('loading')
```

- `moduleContainerRef`：模板引用，指向模块挂载的目标 `<div>`。`useTemplateRef`（Vue 3.5+ API）按 ref 名称解析。
- `moduleInstance`：当前**已成功挂载**的实例句柄。用 `shallowRef` 而非 `ref`：实例内含 DOM 元素与外部模块对象，深层响应式代理既无意义又可能破坏模块内部引用，浅引用只需感知"换了一个实例"。
- `loadStatus`：三态状态机，驱动模板里 loading/error 覆盖层的显隐。状态迁移只有三条边：`scheduleLoad→loading`、`loadAndMount 成功路径→success`、`任一失败路径→failed`。

## 竞态原语

三个**非响应式**的普通变量构成竞态控制核心（它们不需要驱动视图，只做逻辑判定）：

```ts
let loadVersion = 0    // 单调递增的装载版本号
let disposed = false   // 组件是否已进入卸载
let loadQueue = Promise.resolve()  // 串行化所有装载轮次的 Promise 链
```

### `isCurrentLoad(version, moduleCode)`

```ts
const isCurrentLoad = (version: number, moduleCode: string) =>
  !disposed && version === loadVersion && moduleCode === props.moduleCode
```

判定"本轮装载是否仍然有效"的谓词，三个条件缺一不可：

1. `!disposed`：组件没有开始卸载；
2. `version === loadVersion`：本轮启动后没有更新的一轮被调度（每次 `scheduleLoad` 都会把 `loadVersion` 自增，旧轮次手里的 version 随即过期）;
3. `moduleCode === props.moduleCode`：prop 没有变到别的模块（对条件 2 的冗余加固——理论上 prop 变化必然伴随版本自增，此条件防御性地覆盖任何遗漏路径）。

该谓词在每个 `await` 恢复点之后调用——**每跨过一次异步边界就重新确认资格**，这是整个组件竞态安全的基本纪律。

### `loadQueue` 串行队列

```ts
loadQueue = loadQueue
  .catch(() => undefined)
  .then(async () => { ... })
```

把每一轮"清理旧模块 → 挂载新模块"追加到同一条 Promise 链尾部，保证轮次之间**严格串行**：上一轮的 cleanup/mount 未结束时，下一轮不会开始执行（但它的 version 已经生效，会让上一轮在下一个检查点自行放弃）。链头的 `.catch(() => undefined)` 把上一轮的失败吞掉，确保队列**永不断链**——任何一轮的异常都不会阻塞后续轮次。

版本号与队列是互补的两层：**版本号让过期轮次尽早退出，队列让未退出的部分不交错执行**。只有版本号，旧轮 mount 与新轮 mount 可能并发写同一容器；只有队列，已无意义的旧轮会白白完整执行。

## 各函数实现

### `cleanup(): Promise<void>`

```ts
const cleanup = async () => {
  const instance = moduleInstance.value
  moduleInstance.value = null          // ① 先摘引用

  if (!instance) return                // ② 无实例直接返回

  await unmountModule(instance)        // ③ 委托 runtime 卸载
  moduleContainerRef.value?.replaceChildren()  // ④ 清空容器 DOM
}
```

卸载当前实例。① 先把 `moduleInstance` 置 null 再异步卸载，避免卸载过程中外部（或重入的 cleanup）拿到一个正在销毁的实例。④ `replaceChildren()` 无参调用即清空容器全部子节点——兜底清除模块 `unmount` 没有自行移除的 DOM 残留。若 ③ 抛错则 ④ 不执行，错误向上传播到 `scheduleLoad` 的 catch（统一进入 failed 态）。

### `loadAndMount(version, moduleCode): Promise<void>`

装载主体。入参是**本轮快照**（启动时的 version 与 moduleCode），而非每次读取 props——这正是与 `isCurrentLoad` 配对的设计：快照不变，谓词拿快照对比最新状态。

```ts
const loadAndMount = async (version: number, moduleCode: string) => {
  if (!moduleContainerRef.value || !isCurrentLoad(version, moduleCode)) return  // ① 前置检查

  loadStatus.value = 'loading'                                                  // ② 进入 loading 态

  try {
    let instance: ModuleInstance

    if (props.loadModule) {                                                     // ③ 旁路分支
      const remoteModule = await props.loadModule(moduleCode)
      if (!isCurrentLoad(version, moduleCode)) return                           // ④ 检查点 A

      loadStatus.value = 'success'                                              // ⑤
      await nextTick()                                                          // ⑥
      if (!moduleContainerRef.value || !isCurrentLoad(version, moduleCode)) return  // ⑦ 检查点 B

      await remoteModule.mount(moduleContainerRef.value, props.context || {})   // ⑧

      instance = {
        manifest: { code: moduleCode } as ModuleManifest,                       // ⑨ 合成占位 manifest
        remoteModule,
        container: moduleContainerRef.value,
        context: props.context || {},
      }
    } else if (props.resolveManifest) {                                         // ⑩ 标准分支
      const manifest = await props.resolveManifest(moduleCode)
      if (!isCurrentLoad(version, moduleCode)) return                           //    检查点 A'

      loadStatus.value = 'success'
      await nextTick()
      if (!moduleContainerRef.value || !isCurrentLoad(version, moduleCode)) return  // 检查点 B'

      instance = await mountModule({                                            // ⑪ 委托 runtime
        manifest,
        container: moduleContainerRef.value,
        context: props.context || {},
      })
    } else {
      throw new Error('RemoteModuleSlot: 必须提供 loadModule 或 resolveManifest 之一')  // ⑫
    }

    if (!isCurrentLoad(version, moduleCode)) {                                  // ⑬ 终检：迟到的成功
      await unmountModule(instance)
      return
    }

    moduleInstance.value = instance                                             // ⑭ 提交
  } catch (error) {
    if (!isCurrentLoad(version, moduleCode)) return                             // ⑮ 过期失败静默
    console.error(`${moduleCode} 模块加载失败,失败原因:`, error)
    moduleContainerRef.value?.replaceChildren()                                 // ⑯
    loadStatus.value = 'failed'
  }
}
```

关键点逐条说明：

- **⑤⑥⑦ 为什么在 mount 之前就置 success 并等一个 tick**：模板中 loading 覆盖层（`v-if="loadStatus === 'loading'"`）与容器是兄弟节点，容器始终在 DOM 中；但置 `success` 会移除覆盖层，`await nextTick()` 等待该 DOM 更新落地，保证模块 `mount` 时容器的最终布局环境已就绪（覆盖层是 `position:absolute` 不影响容器，但状态切换统一在 mount 前完成，模块首帧不会再经历一次宿主侧 DOM 变动）。tick 之后必须重做检查点 B：`nextTick` 也是异步边界。
- **⑨ 占位 manifest**：`loadModule` 旁路下没有真实 manifest，合成 `{ code: moduleCode }` 并 `as ModuleManifest` 断言，保证 `ModuleInstance` 形状完整（`unmountModule` 不读 manifest，安全）。
- **⑬ 迟到成功的回收**：mount 本身成功了，但期间版本已过期（用户又切了模块/组件开始卸载）。此时实例不能提交——立即调用 `unmountModule` 把刚挂上的模块卸掉，防止"幽灵实例"残留在容器里。这是除 `cleanup` 外第二处会触发卸载的地方。
- **⑮ 过期失败静默**：版本已过期的失败不打日志、不改状态——新一轮自有自己的状态归属。
- **⑫ 配置错误**：两个加载 prop 都未提供时抛错，走 ⑯ 进入 failed 态。（类型上 `resolveManifest` 必填，此分支防御 JS 调用方。）

### `scheduleLoad(): Promise<void>`

```ts
const scheduleLoad = () => {
  const version = ++loadVersion              // ① 立刻让旧轮过期
  const moduleCode = props.moduleCode        // ② 快照目标模块

  loadQueue = loadQueue
    .catch(() => undefined)                  // ③ 断链保护
    .then(async () => {
      if (!isCurrentLoad(version, moduleCode)) return   // ④ 排队期间可能已过期

      try {
        await cleanup()                      // ⑤ 先卸旧
        await nextTick()                     // ⑥ 等 DOM 清理落地
        await loadAndMount(version, moduleCode)  // ⑦ 再挂新
      } catch (error) {
        if (!isCurrentLoad(version, moduleCode)) return
        console.error(`${moduleCode} 模块切换失败,失败原因:`, error)
        moduleContainerRef.value?.replaceChildren()
        loadStatus.value = 'failed'          // ⑧ cleanup 阶段失败也归入 failed
      }
    })

  return loadQueue
}
```

调度一轮装载：**同步段**（①②）在调用瞬间完成——版本号立即自增使所有在途轮次过期、目标 moduleCode 被快照；**异步段**进入队列排队。④ 处理"排队等待期间又有新轮入队"的情况：本轮还没轮到执行就已过期，直接跳过（连 cleanup 都不做，留给最新一轮做）。⑤⑥⑦ 构成一轮的标准序列：卸载旧实例 → 等一个 tick → 装载新模块。⑧ 捕获的是 `cleanup` 或 `loadAndMount` 中**未被内部 catch 吞掉**的错误（实际上 `loadAndMount` 自带 catch，这里主要兜 `cleanup` 即旧模块 `unmount` 抛错的情况）。

返回值是更新后的 `loadQueue`，供 `onMounted` await。

## 生命周期接线

```ts
onMounted(async () => {
  disposed = false
  await scheduleLoad()
})

onBeforeUnmount(async () => {
  disposed = true            // ① 使所有检查点失败
  loadVersion++              // ② 双保险：版本同时过期
  await loadQueue.catch(() => undefined)   // ③ 等在途轮次退出
  await cleanup()            // ④ 卸载当前实例
})

watch(() => props.moduleCode, () => { scheduleLoad() })
```

- `onMounted`：重置 `disposed`（防御组件复用场景）后调度首轮装载。在 mounted 时机调度保证 `moduleContainerRef` 已可用。
- `onBeforeUnmount`：①② 同步切断一切在途装载的提交资格；③ 等队列排空——确保不会有装载逻辑在组件销毁后还在操作 DOM；④ 最后卸载已提交的实例并清容器。整个回调是 async，Vue 不会等它完成才摘除 DOM，但由于 ①② 已同步生效，后续异步步骤只做清理、不再写入。
- `watch(moduleCode)`：prop 变化即调度新轮。不需要 `immediate`（首轮由 onMounted 负责），也不 await（队列自会串行）。

## 模板与样式

```vue
<div class="remote_module_slot">                 <!-- position: relative -->
  <div ref="moduleContainerRef" class="remote_module_container" />  <!-- 常驻 -->

  <div v-if="loadStatus === 'loading'" class="remote_module_loading">
    <slot name="loading"><remote-module-loading /></slot>
  </div>
  <div v-else-if="loadStatus === 'failed'" class="remote_module_error">
    <slot name="error"><remote-module-error /></slot>
  </div>
</div>
```

结构要点：

- **容器常驻 DOM**：`moduleContainerRef` 所在 div 不受 `v-if` 控制，loading/failed 期间也存在。这是装载逻辑能在任意时刻拿到容器引用的前提（也简化了竞态——容器引用只在组件卸载时失效）。
- **覆盖层叠放**：loading 与 error 层 `position: absolute; inset: 0`，覆盖在容器上方；外层 `.remote_module_slot` 为 `position: relative` 提供定位上下文。
- **插槽替换**：`#loading` / `#error` 具名插槽允许宿主替换默认 UI；默认内容为私有组件 [`remote-module-loading` / `remote-module-error`](/runtime-vue/internals)。
- 容器自身 `display:flex; flex-direction:column; overflow:hidden; min-height:0`，为模块内容提供一个可伸缩、不撑破父布局的弹性容器。

## 竞态场景推演

| 场景 | 机制路径 |
|---|---|
| 快速连续切换 A→B→C | B 轮入队时 version 过期 A；C 轮过期 B。A/B 在各自下一个检查点退出；C 在队列中等 A（若已在执行）结束后，独自完成 cleanup→mount |
| resolveManifest 很慢，期间切换 | 旧轮在检查点 A' 发现 version 过期，直接 return；新轮正常执行 |
| mount 成功瞬间组件卸载 | `disposed=true` 使终检 ⑬ 失败，刚挂载的实例被立即 `unmountModule` 回收 |
| 旧模块 unmount 抛错 | `scheduleLoad` 的 catch 捕获，容器清空、置 failed；队列因 `.catch(() => undefined)` 不断链 |
| 加载失败后切换到新模块 | failed 态被新轮 `loadStatus='loading'` 覆盖，流程正常 |
