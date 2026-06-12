# @fusion-module/runtime-vue

Vue 3 绑定：在宿主应用里承载远程模块的组件与组合式函数。

## 安装

```bash
pnpm add @fusion-module/runtime-vue @fusion-module/runtime @fusion-module/contracts vue
```

引入一次样式（loading / error 占位需要）：

```ts
import '@fusion-module/runtime-vue/style.css'
```

`vue` 为 peer dependency（`^3.4.0`）。

## 导出一览

| 导出 | 类型 | 说明 |
|---|---|---|
| `RemoteModuleSlot` | 组件 | 承载远程模块生命周期。 |
| `useModuleState` | 组合式函数 | 把 `ModuleState` 的某个 key 包装成响应式 ref。 |
| `fetchJson` | 函数 | **已弃用**，见下。 |
| `normalizeManifestAssetUrl` | 函数 | **已弃用**，见下。 |

## RemoteModuleSlot

```ts
import { RemoteModuleSlot } from '@fusion-module/runtime-vue'
```

### Props

```ts
{
  moduleCode: string
  context?: ModuleRuntimeContext
  resolveManifest: (moduleCode: string) => Promise<ModuleManifest>
  loadModule?: (moduleCode: string) => Promise<RemoteModule>
}
```

- `moduleCode`：要加载的模块编码，变化时自动切换。
- `context`：注入给模块的运行时上下文，缺省 `{}`。
- `resolveManifest`：把 code 解析成完整 manifest。
- `loadModule`：直接返回模块对象；与 `resolveManifest` 同时提供时**优先**。

> 至少提供 `resolveManifest` 或 `loadModule` 之一。两者的取舍见 [解析模块](/host/resolve-manifest)。

### 插槽

| 插槽 | 说明 |
|---|---|
| `loading` | 覆盖默认加载占位。 |
| `error` | 覆盖默认错误占位。 |

完整说明（生命周期、竞态处理、DOM 结构）见 [RemoteModuleSlot](/host/remote-module-slot)。

```vue
<RemoteModuleSlot :module-code="code" :resolve-manifest="resolveManifest" :context="context">
  <template #loading><MySpinner /></template>
  <template #error><MyError /></template>
</RemoteModuleSlot>
```

## useModuleState

```ts
function useModuleState<T>(
  context: ModuleRuntimeContext,
  key: string,
  defaultValue?: T | null,
): Ref<T | null>
```

把 `context.state` 里某个 key 包装成响应式 ref，值随 state 变化自动更新，并在组件卸载时自动取消订阅。用法见 [共享状态](/communication/state)。

```ts
import { useModuleState } from '@fusion-module/runtime-vue'

const tab = useModuleState<string>(context, 'tab', 'overview')
```

## 已弃用导出

以下两个导出保留仅为兼容，**勿用于新代码**。它们对应早期"fetch registry/manifest.json + 归一化 URL"的加载方式，当前加载链路不再需要。详见 [迁移指南](/migration)。

### fetchJson（已弃用）

```ts
/** @deprecated 模块加载已改为接口直接返回数据、宿主侧本地拼接 manifest。 */
function fetchJson<T>(url: string): Promise<T>
```

### normalizeManifestAssetUrl（已弃用）

```ts
/** @deprecated manifest 资源地址现由宿主侧本地拼接生成，不再需要基于 manifestUrl 归一化。 */
function normalizeManifestAssetUrl(manifest: ModuleManifest, manifestUrl: string): ModuleManifest
```
