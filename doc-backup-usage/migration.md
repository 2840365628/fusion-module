# 迁移指南：从 registry/manifest 拉取到宿主自管解析

如果你的宿主还在用早期的"先 fetch registry.json、再 fetch manifest.json、再归一化 URL"的方式加载模块，本文帮你迁移到当前的**宿主自管模块发现**。

## 变了什么

| | 旧方式 | 当前方式 |
|---|---|---|
| 模块发现 | 运行时规定：fetch `registry.json` → 拿 `manifestUrl` → fetch `manifest.json` | 宿主自管：用任意方式得到 `ModuleManifest`（或直接得到 `RemoteModule`） |
| 资源地址 | `normalizeManifestAssetUrl` 基于 `manifestUrl` 把相对路径归一化成绝对 URL | 宿主本地拼接（`new URL(相对路径, 基址)`） |
| 入口点 | 一个固定的 `resolveModuleManifest` 走 registry | `RemoteModuleSlot` 的 `resolveManifest` 或 `loadModule` |
| 相关 API | `fetchJson`、`normalizeManifestAssetUrl` | 已弃用，仅保留兼容 |

核心理念变化：**模块发现不再是运行时的固定流程，而是宿主的职责。** 运行时只关心最终拿到的 manifest / 模块。

## 弃用项

`@fusion-module/runtime-vue` 仍导出下列两个函数，但已标记 `@deprecated`，请勿用于新代码：

- `fetchJson(url)` —— 旧的"拉 registry/manifest JSON"辅助函数。
- `normalizeManifestAssetUrl(manifest, manifestUrl)` —— 旧的 URL 归一化。

## 迁移步骤

### 旧代码（示意）

```ts
import { fetchJson, normalizeManifestAssetUrl } from '@fusion-module/runtime-vue'

const resolveModuleManifest = async (moduleCode: string) => {
  const registry = await fetchJson<DevRegistryFile>(
    import.meta.env.DEV ? DEV_REGISTRY_ROUTE : PROD_REGISTRY_ROUTE,
  )
  const record = registry.modules[moduleCode]
  if (!record) throw new Error(`Unknown module code: ${moduleCode}`)

  const manifest = await fetchJson<ModuleManifest>(record.manifestUrl)
  return normalizeManifestAssetUrl(manifest, record.manifestUrl)
}
```

### 新代码

把"模块在哪里"改成由你自己的数据源（接口 / 配置）提供，并在本地拼出绝对地址：

```ts
import type { ModuleManifest } from '@fusion-module/contracts'

export const resolveManifest = async (moduleCode: string): Promise<ModuleManifest> => {
  // 来源换成你的接口/配置，返回模块的资源基址等信息
  const record = await api.getModule(moduleCode)
  if (!record) throw new Error(`未知模块: ${moduleCode}`)

  return {
    code: record.code,
    name: record.name,
    version: record.version,
    runtime: 'vue-esm-app',
    entry: new URL('index.es.js', record.assetBaseUrl).href,
    style: new URL('style.css', record.assetBaseUrl).href,
  }
}
```

`RemoteModuleSlot` 用法不变，只是把 `resolve-manifest` 指向新函数：

```vue
<RemoteModuleSlot
  :module-code="code"
  :resolve-manifest="resolveManifest"
  :context="context"
/>
```

### 开发态用 loadModule 加载本地源码

上面的 `resolveManifest` 面向生产构建产物。monorepo 下，开发态推荐改用 `loadModule` 配合 `import.meta.glob` 直接加载本地模块源码，享受 HMR、跳过构建：

```ts
const localModuleLoaders = import.meta.glob<RemoteModule>('../../../../modules/*/src/index.ts', {
  import: 'default',
})
// 约定 modules 目录名即 code，按 code 取对应 loader 并调用 loader()
```

按环境组合 `loadModule`（开发，优先）与 `resolveManifest`（生产）的标准接法详见 [解析模块](/host/resolve-manifest#按环境组合)。

## 常见疑问

**还需要 registry.json 吗？**
不需要内置那一套。你当然可以维护一份模块清单（数据库表或配置文件），但它由你的接口提供、由宿主消费，不再是运行时强制的两级 fetch。

**还需要发布 manifest.json 吗？**
构建插件仍会生成 `manifest.json` 作为模块自描述产物。当前加载链路里宿主通常基于"基址 + 固定文件名"本地拼接 manifest，不强制运行时去 fetch 它；如果你愿意，也可以在 `resolveManifest` 里自行 fetch 并拼接。

**相对路径怎么变绝对？**
旧方式用 `normalizeManifestAssetUrl(manifest, manifestUrl)`。现在直接用标准 `new URL(相对路径, 基址)`，基址来自你的部署约定或接口返回。

**dev / prod 怎么区分？**
旧方式靠 `DEV_REGISTRY_ROUTE` / `PROD_REGISTRY_ROUTE`。现在你的 `resolveManifest` 想怎么区分都行（环境变量、不同接口、不同基址）。共享依赖的开发/生产差异则交给 [`moduleSharedImportMapPlugin` 的 `imports` / `devImports`](/host/shared-deps#imports-vs-devimports)。
