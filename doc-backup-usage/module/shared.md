# 把公共依赖交给宿主

模块产物不应该把 Vue 这类基础依赖打进去。原因和宿主侧 [共享依赖](/host/shared-deps) 一节相同：多份 Vue 会导致实例不一致、插件失效、组件库全局配置不生效。

模块侧只需做一件事：把这些依赖 **external** 掉。运行时浏览器靠宿主注入的 [import map](/host/shared-deps) 把裸标识符解析到宿主那一份。

## 生产构建：external

```ts
// vite.config.ts
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.es.js' },
    rollupOptions: {
      external: [
        'vue',
        '@tanstack/vue-query',
        'element-plus',
        'element-plus/es',
      ],
    },
  },
})
```

external 之后，模块产物里会保留：

```ts
import { createApp } from 'vue'
```

而不是把 Vue 源码内联。浏览器加载模块时，宿主 HTML 里的 import map 会把 `vue` 指向宿主构建出的 `/host/shared/vue.js`。

::: warning external 列表要和宿主 import map 对齐
模块 external 掉的依赖，宿主必须在 import map 里有对应条目，否则浏览器解析裸标识符时会失败。两边维护同一份"共享依赖清单"是最稳妥的做法。
:::

## 子路径也要处理

像 `element-plus/es` 这种子路径导入，需要在 external 和 import map 两侧都覆盖到：

```ts
// 模块 external
external: ['element-plus', 'element-plus/es']
```

```ts
// 宿主 import map
imports: {
  'element-plus': '/shared/element-plus.js',
  'element-plus/es': '/shared/element-plus.js',
}
```

## 开发态

monorepo 下，开发态宿主通过 [`loadModule` + `import.meta.glob`](/host/resolve-manifest#开发态-loadmodule) 直接加载本地模块源码——宿主和所有模块跑在**同一个 Vite dev server、同一条构建图**里。这时 `vue` 等共享依赖天然就是宿主那一份，**开发态不需要额外的 import map 或 external 配置**。

`external` 与 import map 主要服务于**生产构建**：模块各自构建为独立产物时，才需要把公共依赖 external 出去、由宿主 import map 统一指向。如果你的部署形态下开发态也是独立 dev server，再用 [`moduleSharedImportMapPlugin` 的 `devImports`](/host/shared-deps#imports-vs-devimports) 注入开发 import map。

## 版本一致性

import map 是全局的、单实例的。务必保证：

- 宿主与所有模块对同一共享依赖使用**同一主版本**。
- 不要对模块私有的小工具库做 external——那只会徒增 import map 维护成本。只共享真正需要单实例的基础依赖（Vue、状态库、UI 组件库）。

## 一句话总结

> 模块负责 **external**（产物里留下裸标识符），宿主负责 **import map**（把裸标识符指向宿主那一份）。两者配套，缺一不可。
