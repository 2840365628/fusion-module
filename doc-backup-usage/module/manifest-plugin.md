# 用插件生成 manifest

模块在源码里只维护自己的身份信息（`ModuleManifestMeta`），构建产物的资源地址（`entry`/`style`/`previewImage`）由 `@fusion-module/vite-plugin-module-manifest` 在构建时补齐，并生成 `manifest.json`。

## 安装

```bash
pnpm add -D @fusion-module/vite-plugin-module-manifest
```

## 用法

```ts
// vite.config.ts
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
    rollupOptions: { external: ['vue'] },
  },
})
```

构建后产物目录里会生成 `manifest.json`：

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

## 选项

```ts
interface ModuleManifestBuildPluginOptions {
  manifest: ModuleManifestMeta   // 必填：code/name/version/runtime
  entry?: string                 // 默认 './index.es.js'
  style?: string                 // 默认 './style.css'
  previewImage?: string          // 默认 './preview.png'
  manifestFileName?: string      // 默认 'manifest.json'
}
```

| 选项 | 默认值 | 说明 |
|---|---|---|
| `manifest` | —— | 模块身份元信息。原样写入 manifest。 |
| `entry` | `./index.es.js` | 模块 ESM 入口（相对路径）。需与构建产物文件名一致。 |
| `style` | `./style.css` | 样式文件。**仅当该文件真实存在于产物目录时**才写入 manifest。 |
| `previewImage` | `./preview.png` | 预览图。**仅当该文件真实存在于产物目录时**才写入 manifest。 |
| `manifestFileName` | `manifest.json` | 生成的清单文件名。 |

::: tip 条件写入
`style` 和 `previewImage` 是"存在才写"：插件在 `closeBundle` 时检查产物目录里有没有对应文件，没有就不把该字段放进 manifest。所以没有样式的模块不会得到一个指向不存在文件的 `style` 字段。
:::

## 为什么用相对路径

生成的 manifest 里 `entry`/`style` 是相对路径（`./index.es.js`）。这是有意的：模块在构建时并不知道自己将来被部署到哪个 URL。

宿主拿到模块的部署基址后，用 `new URL('./index.es.js', base)` 就能拼出绝对地址。这正是宿主 [`resolveManifest`](/host/resolve-manifest) 里 `buildModuleManifest` 做的事——本地拼接，无需再 fetch 这个 manifest.json。

::: info manifest.json 是给谁看的
manifest.json 主要作为**模块自描述产物**随模块一起发布，便于工具/平台读取模块身份与默认资源名。当前的加载链路里，宿主通常基于约定（基址 + 固定文件名）本地拼 manifest，而不是运行时去 fetch 它。两种用法都成立，取决于宿主实现。
:::

## 配合 lib 构建

插件默认的 `entry: './index.es.js'` 和 Vite library 模式的 `fileName: () => 'index.es.js'` 对齐。如果你改了产物文件名，记得同步把 `entry` 传成一致的值：

```ts
build: {
  lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'main.js' },
},
plugins: [
  moduleManifestBuildPlugin({ manifest: meta, entry: './main.js' }),
],
```
