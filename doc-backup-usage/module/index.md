# 编写模块总览

一个 fusion-module 模块就是一个**默认导出 `mount`/`unmount` 的 ES 模块**，加上一份描述自己的 manifest。模块独立开发、独立构建、独立部署，宿主在运行时装载。

写一个模块要做三件事：

1. **实现生命周期** —— 默认导出 `{ mount, unmount }`。见 [mount / unmount 生命周期](/module/lifecycle)。
2. **生成 manifest** —— 用构建插件在产物旁生成 `manifest.json`。见 [用插件生成 manifest](/module/manifest-plugin)。
3. **把公共依赖交给宿主** —— external 掉 Vue 等基础依赖，复用宿主那一份。见 [把公共依赖交给宿主](/module/shared)。

## 一个最小模块

```ts
// src/index.ts
import { createApp, type App } from 'vue'
import type { RemoteModule } from '@fusion-module/contracts'
import Root from './App.vue'

let app: App<Element> | null = null

const remoteModule: RemoteModule = {
  mount(container, context) {
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

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { moduleManifestBuildPlugin } from '@fusion-module/vite-plugin-module-manifest'

export default defineConfig({
  plugins: [
    vue(),
    moduleManifestBuildPlugin({
      manifest: { code: 'hello', name: '你好模块', version: '0.0.1', runtime: 'vue-esm-app' },
    }),
  ],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.es.js' },
    rollupOptions: { external: ['vue'] },
  },
})
```

## 模块开发的几条铁律

- **默认导出**必须是实现了 `mount`/`unmount` 的对象，否则运行时加载时会报 `Invalid remote module export`。
- **`unmount` 要彻底清理**：销毁 app、取消事件订阅、清定时器、释放副作用。模块容器由运行时清空，但内部资源由模块自己负责。
- **不要私自创建公共能力**：axios、queryClient、event、state 都从 `context` 拿，不要在模块里新建一套。
- **不要直接 import 其它模块的源码**：跨模块协作走 [事件总线](/communication/events) 和 [共享状态](/communication/state)。
- **基础依赖交给宿主**：Vue、组件库等通过 external + import map 复用宿主那一份。

## 不限于 Vue

`RemoteModule` 契约与框架无关——`mount` 拿到的是一个 `HTMLElement`。你完全可以用 React、Svelte、原生 DOM 实现一个模块，只要默认导出 `mount`/`unmount` 即可。`@fusion-module/runtime-vue` 只是为"宿主是 Vue 应用"提供了开箱即用的 `RemoteModuleSlot`。
