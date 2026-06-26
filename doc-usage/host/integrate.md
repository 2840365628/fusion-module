# 宿主接入

任何 Vue 3 应用要嵌入模块，需要做四件事：**安装运行时包 → 配共享依赖 → 构建 context → 放置 RemoteModuleSlot**。本页以业务系统宿主（drug-warehouse `apps/web`）为蓝本。

## 安装

```bash
pnpm add @fusion-module/contracts @fusion-module/runtime @fusion-module/runtime-vue
pnpm add -D @fusion-module/vite-plugin-module-shared
```

## RemoteModuleSlot 基本用法

```vue
<script setup lang="ts">
import { RemoteModuleSlot } from '@fusion-module/runtime-vue'
import { loadLocalModule } from '@/utils/dev-local-modules'
import { resolveManifest } from '@/utils/resolve-module'
import { defaultRemoteModuleContext } from '@/utils/remote-module-context'

// 开发期走本地直载，生产走 manifest
const devLoadModule = import.meta.env.DEV ? loadLocalModule : undefined
</script>

<template>
  <remote-module-slot
    module-code="test-module"
    :context="defaultRemoteModuleContext"
    :load-module="devLoadModule"
    :resolve-manifest="resolveManifest"
  />
</template>
```

Props 语义：

| Prop | 必传 | 说明 |
|---|---|---|
| `module-code` | ✅ | 要装载的模块编码；**变化时自动卸旧挂新**（含竞态保护，快速切换安全） |
| `resolve-manifest` | ✅ | `(code) => Promise<ModuleManifest>`，生产期的模块解析方式，宿主自由实现 |
| `load-module` | — | `(code) => Promise<RemoteModule>`，**优先级高于 resolve-manifest** 的旁路，传了就完全绕过 manifest/样式加载流程 |
| `context` | — | 注入模块的运行时上下文 |

组件自带 loading / 失败两种覆盖层 UI，可用具名插槽替换：

```vue
<remote-module-slot module-code="..." :resolve-manifest="resolveManifest">
  <template #loading>自定义加载中…</template>
  <template #error>自定义失败提示</template>
</remote-module-slot>
```

加载失败的具体原因输出在控制台（`xxx 模块加载失败,失败原因: ...`）。

## 开发期：本地直载

业务系统开发自己的模块时，不需要"打包→上传→再调试"，用 `import.meta.glob` 直接加载 `modules/` 下的源码，享受完整 HMR：

```ts
// src/utils/dev-local-modules.ts
import type { RemoteModule } from '@fusion-module/contracts'

const localModuleLoaders = import.meta.glob<RemoteModule>('../../../../modules/*/src/index.ts', {
  import: 'default',
})

/** 约定：modules 下的目录名即模块 code */
const codeToLoader = Object.fromEntries(
  Object.entries(localModuleLoaders).map(([path, loader]) => {
    const match = path.match(/\/modules\/([^/]+)\/src\/index\.ts$/)
    return [match?.[1] ?? '', loader]
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

要点：

- glob 的 `import: 'default'` 直接取模块默认导出（即 RemoteModule 对象），类型严丝合缝。
- glob 是**惰性**的（不带 `eager`），模块代码只在真正渲染到该模块时才加载编译。
- 路径正则把目录名当 code，这就是「模块目录名必须等于 manifestMeta.code」约定的出处。
- 视图层用 `import.meta.env.DEV` 切换：dev 传 `loadModule`，生产构建时该 prop 为 `undefined`，Slot 自动落回 `resolveManifest` 路径。`import.meta.glob` 只在 dev 分支被引用，生产产物不会把本地模块源码打进去（前提是 `devLoadModule` 的判断写成可静态消除的 `import.meta.env.DEV`）。

## 生产期：实现 resolveManifest

生产环境模块产物在文件服务器上，宿主需要把 `moduleCode` 解析成完整 manifest（含**绝对 URL** 的 entry/style）。推荐做法是从后端拿模块注册信息后**本地拼接**：

```ts
// 以门户的实现为标准范式
import type { ModuleManifest } from '@fusion-module/contracts'

export const joinUrl = (...parts: string[]) =>
  parts
    .map((part, index) => (index ? part.replace(/^\/+|\/+$/g, '') : part.replace(/\/+$/, '')))
    .filter(Boolean)
    .join('/')

export const buildModuleManifest = (input: {
  moduleCode: string
  moduleName: string
  version: string
  entry: string      // manifest.json 里的相对路径，如 './index.es.js'
  style?: string
}): ModuleManifest => {
  const base = joinUrl(import.meta.env.VITE_MODULE_URL, input.moduleCode, input.version)
  const toAssetUrl = (p: string) => joinUrl(base, p.replace(/^\.?\//, ''))

  return {
    code: input.moduleCode,
    name: input.moduleName,
    runtime: 'vue-esm-app',
    version: input.version,
    entry: toAssetUrl(input.entry),
    style: input.style ? toAssetUrl(input.style) : undefined,
  }
}
```

`VITE_MODULE_URL` 指向文件服务器的模块根目录（如 `https://file-server/business-modules`），最终 entry 形如：

```
https://file-server/business-modules/test-module/0.0.1/index.es.js
```

::: warning 不要让 resolveManifest 留空实现
开发期只用 `loadModule` 时容易留一个返回空 entry 的占位 `resolveManifest`——生产构建后 `loadModule` 为 undefined，空 entry 会让所有模块加载失败。上线前必须接通真实实现（drug-warehouse 当前就处于占位状态，部署前需补全）。
:::

完整的动态解析（含后端注册表查询、缓存）见[门户动态配置](/portal/market#运行时解析-usemoduleresolver)。

## 构建 context

宿主把公共能力组装为一个常驻对象（getter 保证读到实时值）：

```ts
// src/utils/remote-module-context.ts
import type { ModuleRuntimeContext } from '@fusion-module/contracts'
import { createModuleState } from '@fusion-module/runtime'
import { request } from './request'
import { queryClient } from './query-client'
import { clearEventBus, eventBus } from './event-bus'
import { getUserInfo } from '@packages/utils'
import { getDictsRequest } from '@/apis/dicts'

let moduleState = createModuleState()

export const defaultRemoteModuleContext: ModuleRuntimeContext = {
  axios: request,                    // 宿主 axios 实例（带鉴权/拦截器）
  queryClient,                       // 宿主 vue-query client
  event: eventBus,                   // 事件总线（见下）
  dicts: { requestFn: getDictsRequest },
  get userInfo() { return getUserInfo() },        // getter：每次读取实时登录态
  get state() { return moduleState },             // getter：支持整体重建
  license: import.meta.env.VITE_LICENSE,
}

/** 切换登录用户等场景，整体重置跨模块共享设施 */
export const rebuildRemoteModuleContext = () => {
  clearEventBus()
  queryClient.clear()
  moduleState = createModuleState()
}
```

事件总线用一层转发包装，使"重建"对已注入的 context 透明：

```ts
// src/utils/event-bus.ts
import { createModuleEventBus } from '@fusion-module/runtime'
import type { ModuleEventBus } from '@fusion-module/contracts'

let bus = createModuleEventBus()

export const eventBus: ModuleEventBus = {
  emit: (type, payload) => bus.emit(type, payload),
  on: (type, handler) => bus.on(type, handler),
}

export const clearEventBus = () => { bus = createModuleEventBus() }
```

模式说明：

- **getter 包实时值**：`userInfo`、`state` 用 getter，模块每次访问拿到的都是当下值；普通属性在 context 创建时就定死了。
- **rebuild 机制**：用户切换/登出时调用 `rebuildRemoteModuleContext()`，事件订阅、查询缓存、共享状态一次清空，防止跨用户数据串台。
- **业务字段的类型**通过 `@packages/types` 里对 `ModuleRuntimeContext` 的声明合并提供（见[模块开发](/module/develop#context-的类型从哪来)），宿主注入端与模块消费端共享同一份类型。

## 宿主与模块通信

```ts
// 宿主 → 模块：写共享状态
import { defaultRemoteModuleContext } from '@/utils/remote-module-context'
defaultRemoteModuleContext.state?.set('currentPatientId', patientId)

// 模块内：响应式订阅（变化自动更新）
const patientId = useModuleState<string>(props.context, 'currentPatientId')

// 双向：事件
defaultRemoteModuleContext.event?.emit('patient-changed', { id: patientId })
const off = props.context.event?.on('patient-changed', handler)   // 记得在卸载时 off()
```

选择原则：**状态用 state**（有"当前值"概念、新挂载的模块要能读到既有值）、**动作用 event**（一次性通知、无需回放）。

接下来：[共享依赖与 import map](/host/shared-deps)——宿主接入中工程上最重的部分。
