# 架构与加载链路

本文说明从 `moduleCode` 到模块真正挂载到页面上的完整链路，以及各个包在其中的职责。

## 分层

```txt
@fusion-module/contracts
  定义宿主和模块之间的协议类型（无运行时代码）

@fusion-module/runtime
  框架无关：加载远程 ESM、加载样式、挂载/卸载模块、事件总线、共享状态

@fusion-module/runtime-vue
  Vue 侧绑定：RemoteModuleSlot 组件、useModuleState

@fusion-module/vite-plugin-module-manifest
  模块构建时在产物旁生成 manifest.json

@fusion-module/vite-plugin-module-shared
  宿主向 HTML 注入共享依赖 import map
```

宿主应用和业务模块都构建在这套包之上：宿主负责提供"怎么解析模块"和"注入什么 context"，模块负责实现自己的 `mount`/`unmount` 和 manifest。

## 两个阶段

### 模块准备阶段（构建期）

```txt
模块维护 ModuleManifestMeta（code/name/version/runtime）
        ↓
Vite 构建时 moduleManifestBuildPlugin 补齐 entry/style/previewImage
        ↓
产物旁生成 dist/manifest.json
        ↓
随模块产物一起发布到静态服务器 / CDN
```

### 宿主运行阶段（运行期）

```txt
宿主拿到 moduleCode
        ↓
resolveManifest(moduleCode)  →  得到一个完整 ModuleManifest
   （或 loadModule(moduleCode) 直接返回 RemoteModule）
        ↓
loadStyle(manifest.style)        加载模块样式
        ↓
loadRemoteModule(manifest.entry) 动态 import 远程 ESM
        ↓
校验默认导出是否实现 mount / unmount
        ↓
remoteModule.mount(container, context)
        ↓
页面切换或宿主组件卸载时 → remoteModule.unmount()
```

## 加载方式：宿主自管模块发现

::: warning 这是与旧版本的关键差异
早期版本由运行时规定"先 fetch 一个 registry.json 找到 manifestUrl，再 fetch manifest.json，再把相对路径归一化成绝对 URL"。

**现在不再绑定这套流程。** 模块发现完全交给宿主：宿主既可以走自己的后端接口拿到模块列表并在本地拼出 manifest，也可以用任何方式得到模块。运行时只关心最终拿到的 `ModuleManifest`（或 `RemoteModule`）。

旧的 `fetchJson` / `normalizeManifestAssetUrl` 已标记 `@deprecated`，仅为兼容保留。详见 [迁移指南](/migration)。
:::

宿主有两条接入路径，按**环境**选用——这是推荐的标准接法：

#### 开发态：`loadModule(moduleCode) => Promise<RemoteModule>`

monorepo 下宿主和模块在同一个仓库里。宿主用 Vite 的 `import.meta.glob` 直接加载本地模块源码的默认导出（`RemoteModule`），享受完整 HMR，跳过构建/manifest/独立样式加载，**效率更高**（样式与共享依赖由同一条 dev 构建图统一处理，运行时无需 `loadStyle`）。约定 `modules/<code>/src/index.ts`，目录名即 code。

```ts
const localModuleLoaders = import.meta.glob<RemoteModule>('../../../../modules/*/src/index.ts', {
  import: 'default',
})
// 按 modules 目录名（即 code）建立 code → loader 映射，loadModule 时调用对应 loader()
```

#### 生产态：`resolveManifest(moduleCode) => Promise<ModuleManifest>`

线上模块已构建为 `index.es.js`（+ 可选 `style.css`）。宿主把 `moduleCode` 解析成一个**已经拼好绝对地址**的 manifest，运行时随后用 `manifest.style`/`manifest.entry` 加载样式并动态 import。

```ts
const resolveManifest = async (moduleCode: string): Promise<ModuleManifest> => {
  const record = await api.getModule(moduleCode) // 你自己的接口
  const base = record.assetBaseUrl              // 例如 https://cdn/.../my-module/
  return {
    code: record.code,
    name: record.name,
    version: record.version,
    runtime: 'vue-esm-app',
    entry: new URL('index.es.js', base).href,
    style: new URL('style.css', base).href,
  }
}
```

> `RemoteModuleSlot` 同时收到两者时 `loadModule` 优先，因此常见做法是开发态提供 `loadModule`、生产态置为 `undefined` 自动回落到 `resolveManifest`。详见 [解析模块](/host/resolve-manifest#按环境组合)。

## 运行时内部做了什么

### loadStyle

按 URL 去重地往 `<head>` 注入一个带 `data-platform-runtime-style` 标记的 `<link>`，等待 `load` 事件 resolve。同一个 URL 重复调用复用同一个 Promise，失败会从缓存里删除以便重试。

### loadRemoteModule

```ts
const importedModule = await import(/* @vite-ignore */ entry)
const remoteModule = importedModule.default
```

`/* @vite-ignore */` 很关键：`entry` 是运行时才知道的远程 URL，不能让 Vite 在构建期静态分析并改写。加载后校验默认导出是否实现 `mount`/`unmount`，并按 `entry` 缓存 Promise，避免并发重复 import。

### mountModule / unmountModule

`mountModule` 顺序是：加载样式 → 动态 import → 调用 `mount(container, context)` → 返回一个 `ModuleInstance`（包含 manifest、remoteModule、container、context），方便后续卸载。`unmountModule` 调用模块自己的 `unmount()`，由模块负责清理。

详见 [@fusion-module/runtime API](/api/runtime)。

## Vue 侧：RemoteModuleSlot 承载生命周期

宿主页面里真正承载模块的是 `RemoteModuleSlot`。它不做业务展示，而是管理模块生命周期，并处理三类竞态：

- **`loadVersion`**：避免异步加载乱序。用户快速切模块时，旧请求后返回不能覆盖新模块。
- **`disposed`**：组件已卸载时不允许继续挂载。
- **`loadQueue`**：串行化卸载与加载，避免旧模块没卸载完、新模块已挂上去。

它还内置 loading / error 占位（可用具名插槽覆盖）。详见 [RemoteModuleSlot](/host/remote-module-slot)。

## 共享依赖

模块化里最容易出问题的是公共依赖（尤其是 Vue）。如果宿主和模块各自加载一份 Vue，会出现 app 实例不一致、provide/inject 失效、插件/组件解析行为不一致等问题。

解决办法是：模块把基础依赖 external 出去，由宿主统一提供。

- **生产**：宿主用 [`moduleSharedImportMapPlugin`](/api/vite-plugin-module-shared) 向 HTML 注入 `<script type="importmap">`，把 `vue` 等裸标识符指向宿主构建出的 shared 文件。
- **开发**：用插件的 `devImports` 在 dev server 注入开发态 import map。

详见 [共享依赖与 import map](/host/shared-deps) 和 [把公共依赖交给宿主](/module/shared)。
