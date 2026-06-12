# @fusion-module/vite-plugin-module-shared

Vite 插件：在宿主 HTML 里注入共享依赖的 import map，让模块产物里的裸标识符（如 `vue`）解析到宿主那一份。

## 安装

```bash
pnpm add -D @fusion-module/vite-plugin-module-shared
```

## moduleSharedImportMapPlugin

```ts
import { moduleSharedImportMapPlugin } from '@fusion-module/vite-plugin-module-shared'

moduleSharedImportMapPlugin(options: ModuleSharedImportMapPluginOptions): Plugin
```

### 选项

```ts
interface ModuleSharedImportMapPluginOptions {
  imports: Record<string, string>      // 生产（build）使用
  devImports?: Record<string, string>  // 开发（serve）使用，可选
}
```

- `imports`：`vite build` 时生效的映射表，`裸标识符 → 资源路径`。
- `devImports`：`vite dev` 时生效的映射表。未提供则开发态不注入 import map。

### 行为

在 `transformIndexHtml` 钩子里：

1. 根据 `command` 选择映射表（`serve` → `devImports`，`build` → `imports`）。
2. 对每个路径做 base 处理：以单个 `/` 开头的绝对路径，自动加上 Vite `base` 前缀；以 `//` 开头或非 `/` 开头（如完整 URL）的保持原样。
3. 向 `<head>` 顶部（`head-prepend`）注入 `<script type="importmap">`。

注入结果（`base: '/host/'`）：

```html
<script type="importmap">
{ "imports": { "vue": "/host/shared/vue.js" } }
</script>
```

### 示例

```ts
// apps/host/vite.config.ts
import { defineConfig } from 'vite'
import { moduleSharedImportMapPlugin } from '@fusion-module/vite-plugin-module-shared'

export default defineConfig({
  base: '/host/',
  plugins: [
    moduleSharedImportMapPlugin({
      imports: {
        vue: '/shared/vue.js',
        '@tanstack/vue-query': '/shared/vue-query.js',
        'element-plus': '/shared/element-plus.js',
        'element-plus/es': '/shared/element-plus.js',
      },
      devImports: {
        vue: '/src/shared/vue.ts',
        '@tanstack/vue-query': '/src/shared/vue-query.ts',
        'element-plus': '/src/shared/element-plus.ts',
      },
    }),
  ],
})
```

### 配套

- `imports` 指向的文件需由宿主真实构建出来（把每个共享依赖作为独立入口、固定输出名）。
- 模块侧要把对应依赖 **external** 掉，产物里才会保留裸标识符。

完整说明见 [共享依赖与 import map](/host/shared-deps) 与 [把公共依赖交给宿主](/module/shared)。
