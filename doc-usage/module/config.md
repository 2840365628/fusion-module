# 模块配置详解

模块的全部构建行为由 `vite.config.ts` 和 `package.json` 决定。**这里的每一项配置都有约定意义，改错任何一项都可能导致宿主加载失败**，逐项说明如下。

## vite.config.ts 完整模板

```ts
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { manifestMeta } from './src/manifest'
import { moduleManifestBuildPlugin } from '@fusion-module/vite-plugin-module-manifest'

export default defineConfig({
  plugins: [
    vue(),
    moduleManifestBuildPlugin({
      manifest: manifestMeta,
    }),
  ],
  resolve: {
    alias: {
      '@packages/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
      '@packages/types': fileURLToPath(new URL('../../packages/types/src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.es.js',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: [
        'vue',
        /^element-plus(\/.*)?$/,
        /^ele-admin-plus(\/.*)?$/,
        '@tanstack/vue-query',
        '@vueuse/core',
        'vxe-pc-ui',
        'vxe-table',
      ],
    },
  },
})
```

## 逐项说明

### `build.lib` —— 为什么是 lib 模式

模块不是一个网页应用，是**一个 ES 模块文件**。lib 模式让 vite 产出可被 `import()` 的单文件库而非 html+chunks。

| 配置 | 值 | 不能乱改的原因 |
|---|---|---|
| `entry` | `src/index.ts` | 必须是默认导出 RemoteModule 的那个文件 |
| `formats` | `['es']` | 运行时用浏览器原生 `import()` 加载，**只能是 ESM**；不要加 cjs/umd |
| `fileName` | `() => 'index.es.js'` | 与 manifest 插件默认 `entry: './index.es.js'` 对齐；改名必须同步改插件选项 |
| `cssFileName` | `'style'` | 产出 `style.css`，与插件默认 `style: './style.css'` 对齐 |

### `build.cssCodeSplit: false`

把模块所有 CSS（SFC 样式 + 入口导入的 style.css）合并为**一个** `style.css`。运行时按 manifest 的单一 `style` 字段注入样式，分散的 CSS chunk 没有人加载，必须关掉 code split。

### `rollupOptions.external` —— 与宿主共享依赖对齐

这是模块配置中**最重要也最容易出错**的一项。原则：

> **宿主 import map 提供什么，模块就 external 什么；模块 external 了什么，宿主就必须提供什么。**

- external 掉的包不会进模块产物，产物里保留 `import { ref } from 'vue'` 这种裸说明符，运行时由宿主 import map 解析。
- **漏 external**（比如忘了 `vue`）：模块会打包进自己的一份 Vue，与宿主的 Vue 双实例并存——组件能渲染但 provide/inject、全局指令、响应式互通全部断裂，是最隐蔽的故障。同时产物体积暴涨，这也是发现漏配的信号（正常模块产物应为几十 KB 量级）。
- **多 external**（external 了宿主没提供的包）：运行时报 `Failed to resolve module specifier "xxx"`，模块加载直接失败。
- **子路径用正则**：`/^element-plus(\/.*)?$/` 同时覆盖 `element-plus`、`element-plus/es`、`element-plus/es/locale/lang/zh-cn` 等子路径导入——`unplugin` 自动导入产生的就是子路径形式，写死字符串会漏。宿主 import map 中也用 aliases 把这些子路径键都映射上了，两侧规则要对照维护。

当前体系的标准共享依赖清单（与宿主 `SHARED_DEPS` 一致）：

```
vue
element-plus（含 /es、locale 子路径）
ele-admin-plus（含 /es、lang 子路径）
@tanstack/vue-query
@vueuse/core
vxe-pc-ui
vxe-table
```

### `moduleManifestBuildPlugin` —— 自动生成 manifest.json

```ts
moduleManifestBuildPlugin({ manifest: manifestMeta })
```

构建结束时在 `dist/` 写出 `manifest.json`：

```json
{
  "code": "test-module",
  "name": "测试模块",
  "version": "0.0.1",
  "runtime": "vue-esm-app",
  "entry": "./index.es.js",
  "style": "./style.css"
}
```

行为细节：

- `entry`/`style`/`previewImage` 写的是**相对产物目录的路径**，绝对地址由消费端（门户）按部署位置拼接，所以模块不需要关心自己将来部署在哪。
- `style` 与 `previewImage` 字段**只在对应文件确实存在时才写入**：模块没有样式就不会有 style 字段，宿主运行时自然跳过样式加载。想带预览图，把 `preview.png` 放进 `dist`（如 `vite` 的 `public/` 目录）即可自动写入 `previewImage` 字段。
- 全部选项及默认值：

| 选项 | 默认 | 说明 |
|---|---|---|
| `manifest` | 必填 | `ModuleManifestMeta`（code/name/version/runtime） |
| `entry` | `'./index.es.js'` | 与 `lib.fileName` 对齐 |
| `style` | `'./style.css'` | 与 `lib.cssFileName` 对齐 |
| `previewImage` | `'./preview.png'` | 预览图约定名 |
| `manifestFileName` | `'manifest.json'` | 一般不改 |

### `resolve.alias` —— 工作区共享代码

模块以**源码方式**引用 monorepo 共享包（直接 alias 到 `src/`），这些代码会编译进模块产物。适合放：业务组件、类型、工具函数。**不要**把重型第三方库经共享包间接打进来。

## package.json

```json
{
  "name": "@modules/test-module",
  "private": true,
  "type": "module",
  "main": "./dist/index.es.js",
  "module": "./dist/index.es.js",
  "exports": {
    ".": { "import": "./dist/index.es.js" }
  },
  "scripts": {
    "build": "vite build"
  }
}
```

- `private: true`：模块不发 npm，交付方式是 zip 上传。
- `name` 用 `@modules/` 前缀，便于 workspace 过滤构建：`pnpm --filter @modules/test-module build`。
- `main`/`module`/`exports` 指向产物，主要服务于工具链解析，运行时加载不经过它。
- 模块的运行时依赖（vue、element-plus 等）由 monorepo 根或 workspace 提供，模块包内通常**不需要重复声明 dependencies**——反正构建时全部 external。

## 配置自检清单

发布前对照检查：

- [ ] `src/index.ts` 默认导出 `{ mount, unmount }`
- [ ] `manifestMeta.code` === 模块目录名
- [ ] `formats: ['es']`，`fileName` 为 `index.es.js`
- [ ] `cssCodeSplit: false`，`cssFileName: 'style'`
- [ ] `external` 与宿主 `SHARED_DEPS` 清单一致（子路径用正则）
- [ ] `moduleManifestBuildPlugin({ manifest: manifestMeta })` 已配置
- [ ] 构建后 `dist/` 包含 `index.es.js`、`manifest.json`（有样式时含 `style.css`）
- [ ] `dist/index.es.js` 体积在预期量级（异常膨胀 = 漏 external）
