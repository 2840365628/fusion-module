# @fusion-module/vite-plugin-module-shared 实现说明

构建期 Vite 插件，单文件实现。职责：向**宿主应用**的 HTML `<head>` 头部注入 `<script type="importmap">`，把共享依赖的裸模块说明符（如 `vue`）映射到宿主提供的实际地址，使远程模块产物中 external 出去的依赖在运行时解析到宿主副本。

本插件**不依赖任何 workspace 包**（选项类型自带），peer 依赖 `vite >= 5`。它是五个包中唯一与 contracts 都无关的——它操作的是浏览器原生 import map 机制，不接触 manifest 协议。

## 选项接口

```ts
export interface ModuleSharedImportMapPluginOptions {
  imports: Record<string, string>       // 生产构建使用的映射表
  devImports?: Record<string, string>   // dev server 使用的映射表（可选）
}
```

两张表的键都是模块说明符、值是地址。拆成两张表的原因：生产环境共享依赖通常是预构建的 ESM 产物地址，而 dev 模式下宿主依赖由 Vite 按需转换、地址形态完全不同（如 `/node_modules/.vite/deps/vue.js`），一张表无法两用。`devImports` 可选——不提供时 dev 模式**不注入任何 import map**（而非回落到 `imports`）。

## `moduleSharedImportMapPlugin(options): Plugin`

```ts
export const moduleSharedImportMapPlugin = (
  options: ModuleSharedImportMapPluginOptions,
): Plugin => {
  let config: ResolvedConfig

  const withBase = (path: string) => {                       // ①
    if (!path.startsWith('/') || path.startsWith('//')) {
      return path
    }
    return `${config.base.replace(/\/$/, '')}${path}`
  }

  return {
    name: 'module-shared-import-map-plugin',
    configResolved(resolvedConfig) {
      config = resolvedConfig                                // ②
    },
    transformIndexHtml() {                                   // ③
      const source = config.command === 'serve' ? options.devImports : options.imports  // ④

      if (!source) {
        return []                                            // ⑤
      }

      const imports = Object.fromEntries(
        Object.entries(source).map(([specifier, path]) => [specifier, withBase(path)]),  // ⑥
      )

      return [
        {
          tag: 'script',
          attrs: { type: 'importmap' },
          children: JSON.stringify({ imports }),
          injectTo: 'head-prepend',                          // ⑦
        },
      ]
    },
  }
}
```

逐点说明：

① **`withBase(path)`**：把以单个 `/` 开头的站内绝对路径加上 Vite `base` 前缀。判定逻辑：
   - 不以 `/` 开头（相对路径、`https://...` 完整 URL、裸说明符）→ 原样返回；
   - 以 `//` 开头（protocol-relative URL，如 `//cdn.example.com/vue.js`）→ 原样返回（它不是站内路径）；
   - 仅形如 `/shared/vue.js` 的路径 → 拼接 `config.base`。拼接前用 `replace(/\/$/, '')` 去掉 base 的尾斜杠，避免 `base: '/app/'` + `/shared/vue.js` 产生双斜杠。base 为默认 `'/'` 时去尾后为空串，路径原样保留。

② **配置捕获**：与 manifest 插件相同的 `configResolved` 模式，取 `config.base` 与 `config.command`。

③ **钩子选择 `transformIndexHtml`**：该钩子在 dev（请求 HTML 时）与 build（生成 HTML 时）都会执行，返回值采用"HTML 标签描述对象数组"形式，由 Vite 负责序列化与注入位置。本插件未配置 `order`，按默认顺序参与 HTML 转换链。

④ **按命令选表**：`config.command` 在 dev server 下是 `'serve'`、构建下是 `'build'`。serve 取 `devImports`，build 取 `imports`。注意插件本身**没有 `apply` 限制**（对比 manifest 插件的 `apply: 'build'`），两种模式都注册，差异完全在这一行。

⑤ **无表则不注入**：`source` 为 `undefined`（serve 模式未配 `devImports`）时返回空数组——`transformIndexHtml` 的合法返回，表示不做任何修改。

⑥ **逐项加 base**：对选中的表做 `Object.entries → map → fromEntries` 的逐值变换，键（说明符）不动，值过 `withBase`。

⑦ **注入位置 `head-prepend`**：标签被插到 `<head>` **最前面**。这是 import map 的硬性需求——HTML 规范要求 import map 必须出现在**任何模块加载之前**（首个 `<script type="module">`、首个 `import()` 触发点之前），否则浏览器报 "An import map is added after module script load was triggered" 并忽略它。head 头部是最稳妥的位置。

生成的最终 HTML 形如：

```html
<head>
  <script type="importmap">{"imports":{"vue":"/shared/vue.runtime.esm-browser.prod.js"}}</script>
  ...
</head>
```

## 与运行时链路的协作

import map 是**浏览器层**机制，与 runtime 代码没有调用关系，但它是远程模块加载链路成立的前提之一：

1. 模块构建时把共享依赖（如 `vue`）配置为 external，产物中保留 `import ... from 'vue'` 裸说明符；
2. 宿主 HTML 经本插件携带 import map；
3. runtime 的 `loadRemoteModule` 执行 `import(entry)` 时，浏览器解析模块产物内部的 `'vue'` 说明符，命中 import map，加载宿主提供的副本——宿主与所有模块共享同一份依赖实例（单例对 Vue 这类有全局上下文的库是正确性要求，不只是体积优化）。

一个浏览器约束值得注意：原生 import map 每页**早期只允许一张且不可动态追加**（较新的 Chromium 已放宽多 import map 支持，但兼容口径仍应按一张设计），因此宿主所有共享依赖应集中在本插件的一份配置中声明。
