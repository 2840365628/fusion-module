# 快速开始

本文从零把一个模块挂进宿主页面。读完你会有：一个能 `mount`/`unmount` 的远程模块、一个能加载它的宿主页面。

## 安装

宿主应用安装 Vue 绑定（会一并带上 runtime 和 contracts）：

```bash
pnpm add @fusion-module/runtime-vue @fusion-module/runtime @fusion-module/contracts vue
```

业务模块安装协议类型，并在构建配置里加上 manifest 插件：

```bash
pnpm add -D @fusion-module/contracts @fusion-module/vite-plugin-module-manifest
```

如果宿主要统一治理公共依赖，再装：

```bash
pnpm add -D @fusion-module/vite-plugin-module-shared
```

## 第 1 步：写一个模块

模块需要默认导出 `mount` / `unmount`。以 Vue 模块为例：

```ts
// modules/hello/src/index.ts
import { createApp, type App } from 'vue'
import type { ModuleRuntimeContext, RemoteModule } from '@fusion-module/contracts'
import Root from './App.vue'

let app: App<Element> | null = null

const remoteModule: RemoteModule = {
  mount(container, context: ModuleRuntimeContext) {
    if (app) this.unmount()
    app = createApp(Root, { context })
    app.mount(container)
  },
  unmount() {
    app?.unmount()
    app = null
  },
}

export default remoteModule
```

::: tip
`unmount` 里务必把 `app` 置空，否则下次挂载可能复用旧实例，导致状态和 DOM 错乱。模块内订阅的事件、定时器等副作用也要在这里清理。
:::

## 第 2 步：让构建产物带上 manifest

模块本地维护 meta，构建时让插件补齐资源地址并生成 `manifest.json`：

```ts
// modules/hello/vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { moduleManifestBuildPlugin } from '@fusion-module/vite-plugin-module-manifest'

export default defineConfig({
  plugins: [
    vue(),
    moduleManifestBuildPlugin({
      manifest: {
        code: 'hello',
        name: '你好模块',
        version: '0.0.1',
        runtime: 'vue-esm-app',
      },
    }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.es.js',
    },
    rollupOptions: {
      // 把公共依赖 external 出去，交给宿主提供，见“共享依赖”一章
      external: ['vue'],
    },
  },
})
```

构建后 `dist/` 里会多出一个 `manifest.json`：

```json
{
  "code": "hello",
  "name": "你好模块",
  "version": "0.0.1",
  "runtime": "vue-esm-app",
  "entry": "./index.es.js",
  "style": "./style.css"
}
```

> `style` / `previewImage` 只有当对应文件真实存在于产物目录时才会被写进 manifest。

把 `dist/` 部署到任意静态服务器即可。

## 第 3 步：宿主决定如何解析模块

宿主需要提供一个把 `moduleCode` 解析成完整 manifest 的函数。manifest 里的 `entry`/`style` 必须是浏览器能直接加载的**绝对地址**：

```ts
// apps/host/src/resolve-manifest.ts
import type { ModuleManifest } from '@fusion-module/contracts'

const MODULE_BASE: Record<string, string> = {
  hello: 'https://cdn.example.com/modules/hello/',
}

export const resolveManifest = async (moduleCode: string): Promise<ModuleManifest> => {
  const base = MODULE_BASE[moduleCode]
  if (!base) throw new Error(`未知模块: ${moduleCode}`)

  return {
    code: moduleCode,
    name: moduleCode,
    version: '0.0.1',
    runtime: 'vue-esm-app',
    entry: new URL('index.es.js', base).href,
    style: new URL('style.css', base).href,
  }
}
```

实际项目里 `MODULE_BASE` 通常来自你自己的后端接口。这里的 `resolveManifest` 面向**线上构建产物**。

::: tip 开发态用 loadModule 更高效
monorepo 下，宿主和模块在同一仓库里。本地开发时推荐改用 `loadModule` 配合 `import.meta.glob` 直接加载本地模块源码，享受 HMR、跳过构建：开发态提供 `loadModule`（优先生效）、生产态走上面的 `resolveManifest`，两个 prop 同时传即可。标准接法见 [解析模块 · 按环境组合](/host/resolve-manifest#按环境组合)。
:::

## 第 4 步：在页面里放置 RemoteModuleSlot

```vue
<script setup lang="ts">
import { RemoteModuleSlot } from '@fusion-module/runtime-vue'
import '@fusion-module/runtime-vue/style.css'
import { createModuleEventBus, createModuleState } from '@fusion-module/runtime'
import type { ModuleRuntimeContext } from '@fusion-module/contracts'
import { resolveManifest } from './resolve-manifest'

const context: ModuleRuntimeContext = {
  event: createModuleEventBus(),
  state: createModuleState(),
}
</script>

<template>
  <RemoteModuleSlot
    module-code="hello"
    :resolve-manifest="resolveManifest"
    :context="context"
  />
</template>
```

切换 `module-code`，`RemoteModuleSlot` 会自动卸载旧模块、加载新模块，并在加载中/失败时显示占位。

## 第 5 步（可选）：统一公共依赖

第 2 步里我们把 `vue` 设成了 external，模块产物里会保留 `import { createApp } from 'vue'` 这样的裸标识符。要让它在浏览器里能解析到宿主那一份 Vue，宿主用 [`moduleSharedImportMapPlugin`](/host/shared-deps) 注入 import map：

```ts
// apps/host/vite.config.ts
import { moduleSharedImportMapPlugin } from '@fusion-module/vite-plugin-module-shared'

moduleSharedImportMapPlugin({
  imports: {
    vue: '/shared/vue.js',
  },
  devImports: {
    vue: '/src/shared/vue.ts',
  },
})
```

完整说明见 [共享依赖与 import map](/host/shared-deps)。

## 接下来

- 宿主侧细节：[RemoteModuleSlot](/host/remote-module-slot)、[注入上下文](/host/context)、[共享依赖](/host/shared-deps)。
- 模块侧细节：[生命周期](/module/lifecycle)、[manifest 插件](/module/manifest-plugin)、[共享依赖](/module/shared)。
- 跨模块协作：[事件总线](/communication/events)、[共享状态](/communication/state)。
