# 解析模块：resolveManifest / loadModule

宿主必须告诉运行时"`moduleCode` 对应的模块在哪里、怎么拿到"。这一步完全由宿主掌控——这是当前版本与早期"registry + manifest.json 拉取"方式最大的不同。

`RemoteModuleSlot` 提供两条路径，它们各自对应一个**环境**：

| 环境 | 用哪条 | 为什么 |
|---|---|---|
| 本地开发 | `loadModule` | 直接 import 模块 dev server 的源码入口，享受 HMR，跳过构建/manifest/独立样式加载，**效率更高**。 |
| 线上生产 | `resolveManifest` | 模块已构建为 `index.es.js` + `style.css`，宿主拼出 manifest，由运行时加载样式并动态 import。 |

推荐的接法是按环境二选一（见文末 [按环境组合](#按环境组合)）。

## 开发态：loadModule

```ts
loadModule: (moduleCode: string) => Promise<RemoteModule>
```

开发时，宿主和模块通常在**同一个 monorepo** 里。这时根本不需要把模块构建、部署、再通过 manifest 加载——宿主用 Vite 的 [`import.meta.glob`](https://cn.vite.dev/guide/features#glob-import) 直接 import 本地模块源码的默认导出（也就是 `RemoteModule`），享受完整 HMR，**不需要构建、不需要 manifest、不需要单独加载 `style.css`**（样式由 Vite 在同一条 dev 构建图里处理，共享依赖也天然统一到宿主这一份）。

约定：`modules/<code>/src/index.ts`，**目录名即模块 code**。

```ts
// apps/host/src/utils/dev-local-modules.ts
import type { RemoteModule } from '@fusion-module/contracts'

// 扫描本地所有模块入口，拿到它们的默认导出（RemoteModule）
const localModuleLoaders = import.meta.glob<RemoteModule>('../../../../modules/*/src/index.ts', {
  import: 'default',
})

// path → code（约定 modules 目录名即模块 code）
const codeToLoader = Object.fromEntries(
  Object.entries(localModuleLoaders).map(([path, loader]) => {
    const code = path.match(/\/modules\/([^/]+)\/src\/index\.ts$/)?.[1] ?? ''
    return [code, loader]
  }),
)

export const loadLocalModule = (code: string): Promise<RemoteModule> => {
  const loader = codeToLoader[code]
  if (!loader) {
    throw new Error(`本地未找到模块: ${code}。请确认 modules/${code} 存在`)
  }
  return loader()
}
```

> `import.meta.glob` 的 glob 路径是**相对当前文件**的。请按你的目录层级调整 `../../../../modules/*/src/index.ts`，让它指向 monorepo 里的 `modules/*` 目录。

::: tip 为什么开发态更高效
`loadLocalModule` 直接 import 本地源码，模块改动经 Vite HMR 即时生效，省去"构建产物 → 生成 manifest → 部署 → 加载 style.css"这一整套流程。宿主和所有模块跑在**同一个 dev server、同一条构建图**里，样式与共享依赖自然统一。
:::

::: warning loadModule 不会自动加载独立样式
运行时走 `loadModule` 时**不会** `loadStyle`（它没有 manifest.style）。开发态没问题，因为 Vite 已把模块样式注入进 JS。如果你的开发态加载逻辑确实需要单独的样式文件，自己在 `loadModule` 里注入。
:::

## 生产态：resolveManifest

```ts
resolveManifest: (moduleCode: string) => Promise<ModuleManifest>
```

线上时，模块已经构建为 `index.es.js`（+ 可选 `style.css`）部署到静态服务器/CDN。宿主把 `moduleCode` 解析成一个**已经拼好绝对地址**的 `ModuleManifest`，交给运行时。运行时随后：

1. `loadStyle(manifest.style)` 注入样式 `<link>`；
2. `import(manifest.entry)` 动态加载模块；
3. 校验默认导出实现了 `mount`/`unmount`；
4. `mount(container, context)`。

你只需保证 `entry`（和可选的 `style`）是浏览器能直接加载的**绝对 URL**。

### 从后端接口本地拼接

典型做法：后端返回模块的资源基址，宿主在本地拼出完整 manifest。

```ts
import type { ModuleManifest } from '@fusion-module/contracts'

interface ModuleRecord {
  code: string
  name: string
  version: string
  assetBaseUrl: string // 例如 https://cdn.example.com/modules/hello/1.0.3/
}

export const resolveManifest = async (moduleCode: string): Promise<ModuleManifest> => {
  const record = await fetchModuleRecord(moduleCode) // 你自己的接口
  if (!record) throw new Error(`未知模块: ${moduleCode}`)

  return buildModuleManifest(record)
}

// 把一条模块记录拼成完整 manifest（本地拼接，不再 fetch manifest.json）
const buildModuleManifest = (record: ModuleRecord): ModuleManifest => ({
  code: record.code,
  name: record.name,
  version: record.version,
  runtime: 'vue-esm-app',
  entry: new URL('index.es.js', record.assetBaseUrl).href,
  style: new URL('style.css', record.assetBaseUrl).href,
})
```

::: tip 为什么用 new URL 拼接
模块构建产物里的 manifest.json 写的是相对路径（`./index.es.js`）。宿主知道部署基址后，用 `new URL(相对路径, 基址)` 就能得到绝对地址，无需再发一次请求去拉 manifest.json。
:::

### 加一层缓存

`resolveManifest` 每次切模块都会被调用。如果解析涉及网络请求，建议自己加缓存：

```ts
const manifestCache = new Map<string, Promise<ModuleManifest>>()

export const resolveManifest = (moduleCode: string) => {
  let task = manifestCache.get(moduleCode)
  if (!task) {
    task = doResolve(moduleCode).catch((err) => {
      manifestCache.delete(moduleCode) // 失败别缓存，留出重试
      throw err
    })
    manifestCache.set(moduleCode, task)
  }
  return task
}
```

> 注意：运行时对**模块 entry 的 import** 本身已经有去重缓存（同一 entry 不会重复 import），这里缓存的是你"解析 manifest"这一步的开销。

## 按环境组合

`RemoteModuleSlot` 同时接收两个 prop，当两者都存在时 **`loadModule` 优先**。利用这点，给 slot **同时**传 `loadModule` 和 `resolveManifest`，再让 `loadModule` 只在开发态有值即可：

```vue
<script setup lang="ts">
import { RemoteModuleSlot } from '@fusion-module/runtime-vue'
import { resolveModuleManifest } from '@/utils/resolve-module-manifest' // 生产态：拼 manifest
import { loadLocalModule } from '@/utils/dev-local-modules'             // 开发态：glob 本地源码

// 开发态用本地源码加载（优先生效）；生产态为 undefined，自动回落到 resolveManifest
const devLoadModule = import.meta.env.DEV ? loadLocalModule : undefined
</script>

<template>
  <RemoteModuleSlot
    :module-code="code"
    :load-module="devLoadModule"
    :resolve-manifest="resolveModuleManifest"
    :context="context"
  />
</template>
```

这样：开发态 `devLoadModule` 命中、直接加载本地模块源码享受 HMR；生产态 `devLoadModule` 为 `undefined`，自动走 `resolveManifest` 加载构建产物。两个 prop 始终都传，环境切换无需改模板。

## 两者对比

| | loadModule（开发） | resolveManifest（生产） |
|---|---|---|
| 你返回什么 | `RemoteModule` | `ModuleManifest`（含 entry/style） |
| 模块来源 | monorepo 本地模块源码（`import.meta.glob`） | 构建产物 `index.es.js` |
| 谁加载样式 | 不加载（Vite 注入进 JS） | 运行时 `loadStyle` |
| 谁动态 import | 你自己（这里是 Vite glob loader） | 运行时（带去重缓存与导出校验） |
| HMR | 有 | 无（已是构建产物） |
| 同时提供时 | **优先生效** | 被忽略 |

> `loadModule` 不限于"glob 本地源码"——任何需要自定义加载策略（鉴权头、签名 URL、特殊 import 逻辑）的场景都可以用它。但 monorepo 下最常见、最高效的用法就是开发态 glob 本地模块。
