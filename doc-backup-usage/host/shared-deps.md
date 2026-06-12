# 共享依赖与 import map

模块化里最容易出问题的是公共依赖，尤其是 Vue。如果宿主和模块各自加载一份 Vue，会出现：

- Vue app 实例不一致，provide/inject、插件实例行为不一致；
- Vue Query 的 `QueryClient` 因为来自不同包实例而类型/行为不兼容；
- Element Plus / VXE 等全局配置在宿主设置后，模块不一定生效；
- 包体重复，产物变大。

解决思路：**模块把基础依赖 external 出去，运行时由宿主统一提供。** 浏览器侧靠 [import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap) 把裸标识符（如 `vue`）解析到宿主构建出的那一份。

`@fusion-module/vite-plugin-module-shared` 就是宿主侧注入这张 import map 的插件。

## 安装

```bash
pnpm add -D @fusion-module/vite-plugin-module-shared
```

## 用法

```ts
// apps/host/vite.config.ts
import { defineConfig } from 'vite'
import { moduleSharedImportMapPlugin } from '@fusion-module/vite-plugin-module-shared'

export default defineConfig({
  base: '/host/',
  plugins: [
    moduleSharedImportMapPlugin({
      // 生产（vite build）使用
      imports: {
        vue: '/shared/vue.js',
        '@tanstack/vue-query': '/shared/vue-query.js',
        'element-plus': '/shared/element-plus.js',
      },
      // 开发（vite serve）使用，可选
      devImports: {
        vue: '/src/shared/vue.ts',
        '@tanstack/vue-query': '/src/shared/vue-query.ts',
        'element-plus': '/src/shared/element-plus.ts',
      },
    }),
  ],
})
```

插件会向宿主 HTML 的 `<head>` 顶部注入：

```html
<script type="importmap">
{ "imports": { "vue": "/host/shared/vue.js", "@tanstack/vue-query": "/host/shared/vue-query.js" } }
</script>
```

之后，模块产物里的 `import { createApp } from 'vue'` 在浏览器里就会解析到 `/host/shared/vue.js`——也就是宿主那一份 Vue。

## imports vs devImports

| 选项 | 生效时机 | 说明 |
|---|---|---|
| `imports` | `vite build`（`command === 'build'`） | 生产 import map，指向构建产物里的 shared 文件。 |
| `devImports` | `vite dev`（`command === 'serve'`） | 开发 import map，指向 dev server 上的源码模块。未提供则开发态不注入。 |

开发态之所以需要单独一份，是因为模块 dev server 和宿主 dev server 是两个服务、路径不同；用 `devImports` 指向宿主 dev server 暴露的源码入口即可。

## base 自动前缀

如果路径以 `/` 开头（绝对路径），插件会自动加上 Vite 的 `base` 前缀。上例中 `base: '/host/'`，`/shared/vue.js` 会变成 `/host/shared/vue.js`。以 `//` 开头或非 `/` 开头（如完整 URL）的路径保持原样。

## 把 shared 入口构建成稳定文件

`imports` 指向的 `/shared/vue.js` 需要真实存在。常见做法是把每个共享依赖作为宿主的独立入口构建，并固定输出文件名：

```ts
// apps/host/vite.config.ts
build: {
  rollupOptions: {
    input: {
      app: resolve(__dirname, 'index.html'),
      'shared-vue': resolve(__dirname, 'src/shared/vue.ts'),
      'shared-vue-query': resolve(__dirname, 'src/shared/vue-query.ts'),
    },
    output: {
      entryFileNames: (chunk) =>
        chunk.name.startsWith('shared-')
          ? `shared/${chunk.name.replace('shared-', '')}.js`
          : 'assets/[name]-[hash].js',
    },
  },
}
```

```ts
// src/shared/vue.ts —— 把需要共享的导出都 re-export 出去
export * from 'vue'
```

这样 `/host/shared/vue.js` 就是宿主稳定提供的 Vue。

## 模块侧要做什么

import map 只解决"裸标识符指向哪里"。模块侧还需要把这些依赖 **external** 掉，产物里才会保留裸标识符而不是把 Vue 打进去。详见 [把公共依赖交给宿主](/module/shared)。

## 边界提醒

import map 是**全局**的，整张表对页面上所有模块生效。因此：

- 宿主和所有模块对同一依赖应约定**同一个主版本**，避免运行时行为不一致。
- 只共享真正需要单实例的基础依赖（Vue、状态库、组件库）。模块私有的小工具库不必共享，按需各自打包即可。
