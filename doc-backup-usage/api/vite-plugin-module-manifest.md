# @fusion-module/vite-plugin-module-manifest

Vite 插件：在模块构建产物旁生成 `manifest.json`。只在 `build` 阶段生效（`apply: 'build'`）。

## 安装

```bash
pnpm add -D @fusion-module/vite-plugin-module-manifest
```

## moduleManifestBuildPlugin

```ts
import { moduleManifestBuildPlugin } from '@fusion-module/vite-plugin-module-manifest'

moduleManifestBuildPlugin(options: ModuleManifestBuildPluginOptions): Plugin
```

### 选项

```ts
interface ModuleManifestBuildPluginOptions {
  manifest: ModuleManifestMeta   // 必填：code/name/version/runtime
  entry?: string                 // 默认 './index.es.js'
  style?: string                 // 默认 './style.css'
  previewImage?: string          // 默认 './preview.png'
  manifestFileName?: string      // 默认 'manifest.json'
}
```

### 行为

在 `closeBundle` 钩子里：

1. 解析产物目录（`build.outDir`）。
2. 检查 `style` 对应文件是否存在——存在才把 `style` 字段写入 manifest。
3. 检查 `previewImage` 对应文件是否存在——存在才把 `previewImage` 字段写入。
4. 写出 `manifest.json`（2 空格缩进，末尾换行）。

生成结果：

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

### 示例

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

更多说明见 [用插件生成 manifest](/module/manifest-plugin)。
