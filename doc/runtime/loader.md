# 模块加载器实现（loader/）

loader 目录包含两个**包内私有**函数：`loadRemoteModule`（加载远程 ESM 入口）与 `loadStyle`（加载远程样式表）。二者均不在包导出面中，唯一调用方是 [`mountModule`](/runtime/lifecycle#mountmodule)。两者采用同一套设计模式：**以 URL 为键的模块级 Promise 缓存，成功保留、失败删除**。

## load-remote-module.ts

### 模块级状态：`moduleLoadTasks`

```ts
const moduleLoadTasks = new Map<string, Promise<RemoteModule>>()
```

以 entry 字符串为键，缓存**加载任务的 Promise**（而非加载结果）。缓存 Promise 而非结果带来两个性质：

1. **并发去重**：同一 entry 的第二次调用发生在第一次尚未完成时，直接返回同一个 in-flight Promise，不会发起第二次 `import()`。
2. **成功结果永久缓存**：Promise resolve 后仍留在 Map 中，后续调用 `await` 同一个已 settle 的 Promise，立即得到同一个 `RemoteModule` 对象。这与浏览器自身的 ESM 模块缓存语义一致（同 URL 的 `import()` 本就返回同一模块命名空间），这里额外缓存的意义是把"默认导出校验"也只做一次，并把校验失败的情况排除出缓存。

### `isRemoteModule(value): value is RemoteModule`

```ts
const isRemoteModule = (value: unknown): value is RemoteModule => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.mount === 'function' && typeof candidate.unmount === 'function'
}
```

文件私有的类型守卫，对远程模块默认导出做**结构校验（duck typing）**：

1. 排除 `null` / `undefined` / 非对象（注意 `!value` 同时排除了 falsy 原始值；函数类型也会被 `typeof !== 'object'` 排除——默认导出必须是对象，不能是类或函数）。
2. 断言 `mount` 与 `unmount` 两个属性均为函数。

不校验函数参数个数与返回值——这是 TypeScript 类型擦除后运行时能做的最大限度校验，与 contracts 的 [`RemoteModule`](/contracts#remotemodule) 协议对应。

### `loadRemoteModule(entry: string): Promise<RemoteModule>`

执行流程逐步说明：

```ts
export const loadRemoteModule = async (entry: string) => {
  if (!entry) throw new Error('Module entry is required')          // ①

  const existingTask = moduleLoadTasks.get(entry)                   // ②
  if (existingTask) return existingTask

  const task = (async () => {                                       // ③
    const importedModule = await import(/* @vite-ignore */ entry)
    const remoteModule = importedModule.default

    if (!isRemoteModule(remoteModule)) {                            // ④
      throw new Error(`Invalid remote module export from entry: ${entry}`)
    }
    return remoteModule
  })()

  moduleLoadTasks.set(entry, task)                                  // ⑤

  try {
    return await task                                               // ⑥
  } catch (error) {
    moduleLoadTasks.delete(entry)                                   // ⑦
    throw error
  }
}
```

① **入参校验**：空字符串/`undefined` 直接同步抛错（async 函数中体现为 rejected Promise），不进入缓存。

② **缓存命中**：命中则直接返回缓存的 Promise。in-flight 与已成功的任务都走这条路径。

③ **构造加载任务**：用 IIFE 形式的 async 函数立即创建 Promise。核心是原生动态 `import(entry)`；`/* @vite-ignore */` 注释告诉 Vite **不要**对这个动态导入做静态分析与构建期改写（entry 是运行时才知道的 URL，无法也不应被打包器处理）。导入成功后取模块命名空间的 `default` 导出。

④ **结构校验**：默认导出不满足 `RemoteModule` 形状即抛错。该错误发生在 task 内部，使 task 变为 rejected。

⑤ **先注册后等待**：task 创建后立即写入缓存、**再** await。这个顺序保证了从 task 创建到 settle 的整个窗口期内，并发调用都能命中缓存——若先 await 再 set，窗口期内的并发调用会重复发起 import。

⑥⑦ **失败回收**：await 失败（网络错误、模块执行错误、校验失败）时把缓存条目删掉再重新抛出。效果是**失败不被缓存**，下一次调用会重新发起加载，天然支持重试。需要注意的并发细节：若失败发生时已有其它调用者在 ② 拿到了同一个 rejected task，它们各自收到同一个错误；缓存删除后到达的新调用者则触发全新加载。

返回值：携带 `RemoteModule` 的 Promise。同一 entry 多次成功调用返回**同一个模块对象**（单例语义），这也意味着远程模块的 `mount` 可能被同一对象多次调用（多个挂载点同 entry 时），模块实现需自行保证可重入性——运行时不替模块做实例隔离。

## load-style.ts

### 模块级状态与选择器工厂

```ts
const styleLoadTasks = new Map<string, Promise<void>>()

const createStyleSelector = (url: string) => {
  return `link[data-platform-runtime-style="${url}"]`
}
```

- `styleLoadTasks`：与模块加载器同款 Promise 缓存，键为样式 URL。
- `createStyleSelector(url)`：生成 CSS 属性选择器字符串，用于在 DOM 中查找**由本加载器创建**的 `<link>` 标签。自定义 data 属性 `data-platform-runtime-style` 的值即完整 URL，使"是否已插入过这个样式"可以直接由 DOM 查询回答。

### `loadStyle(url?: string): Promise<void>`

与 `loadRemoteModule` 不同，本函数做了**双层去重**：第一层是内存中的 Promise 缓存，第二层是 DOM 查询。第二层的意义在于：内存缓存随 JS 上下文存在，而 `<link>` 标签可能由上一个已被释放的 runtime 副本插入（例如宿主中存在多份 runtime 实例、或 HMR 后模块作用域重建），DOM 层去重避免重复插入相同样式标签。

逐步流程：

```ts
export const loadStyle = async (url?: string) => {
  if (!url) return                                                  // ①

  const existingTask = styleLoadTasks.get(url)                      // ②
  if (existingTask) return existingTask

  const task = new Promise<void>((resolve, reject) => {
    const existingManagedLink =
      document.querySelector<HTMLLinkElement>(createStyleSelector(url))
    if (existingManagedLink) {                                      // ③
      const alreadyLoaded = existingManagedLink.dataset.loaded === 'true'
      if (alreadyLoaded) { resolve(); return }                      // ③a

      existingManagedLink.addEventListener('load', () => resolve(), { once: true })   // ③b
      existingManagedLink.addEventListener('error',
        () => reject(new Error(`Failed to load module style: ${url}`)), { once: true })
      return
    }

    const link = document.createElement('link')                     // ④
    link.rel = 'stylesheet'
    link.href = url
    link.dataset.platformRuntimeStyle = url

    link.addEventListener('load', () => {                           // ⑤
      link.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    link.addEventListener('error', () => {                          // ⑥
      link.remove()
      reject(new Error(`Failed to load module style: ${url}`))
    }, { once: true })

    document.head.appendChild(link)                                 // ⑦
  })

  styleLoadTasks.set(url, task)                                     // ⑧

  try {
    await task
  } catch (error) {
    styleLoadTasks.delete(url)                                      // ⑨
    throw error
  }
}
```

① **可选参数短路**：`url` 为空直接 resolve。这使 `mountModule` 可以无条件 `await loadStyle(manifest.style)`，无需在调用侧判断 manifest 是否带样式。

② **第一层去重**：内存 Promise 缓存命中即返回。

③ **第二层去重（DOM 探测）**：查询是否已存在带本加载器标记的同 URL `<link>`：
   - ③a 若其 `data-loaded="true"`（曾经成功加载完成），同步 resolve，不重复加载。
   - ③b 若存在但尚未标记完成（仍在加载中，或由旧上下文插入后未及标记），不新建标签，而是**挂接到现有标签的 load/error 事件**上等待结果。`{ once: true }` 保证监听器触发后自动移除。

④ **创建标签**：新建 `<link rel="stylesheet" href=url>`，并打上 `data-platform-runtime-style=url` 归属标记（`dataset.platformRuntimeStyle` 即 kebab-case 的该属性）。

⑤ **成功路径**：load 事件中先打 `data-loaded="true"` 标记（供未来的 ③a 判断），再 resolve。

⑥ **失败路径**：error 事件中**把标签从 DOM 移除**再 reject。移除是必要的：若失败标签残留，后续重试会在 ③b 挂到一个永远不会再触发事件的死标签上。

⑦ 标签插入 `document.head`，浏览器开始请求样式。

⑧⑨ **缓存注册与失败回收**：与 `loadRemoteModule` 的 ⑤⑦ 完全同构——先注册后等待、失败删缓存允许重试。区别仅在返回值：本函数最后 `await task` 后隐式返回 `undefined`（`Promise<void>`）。

### 两个加载器的失败语义对比

| | 失败后内存缓存 | 失败后 DOM/模块系统残留 | 重试可行性 |
|---|---|---|---|
| `loadRemoteModule` | 删除 | 浏览器 ESM 缓存对**网络失败**的 import 不缓存；模块**执行抛错**的情况浏览器会缓存失败，重试同 URL 仍会失败（需换 URL，如加查询串） | 受浏览器模块缓存语义限制 |
| `loadStyle` | 删除 | 失败标签被显式 `remove()`，无残留 | 完全可重试 |
