# 共享依赖与 import map

共享依赖是整套体系的工程核心：**宿主把公共库各打成一个稳定地址的 ESM chunk，并经 import map 告诉浏览器"模块里的 `'vue'` 去这里取"**。本页完整给出宿主侧配置（以 drug-warehouse / portal 的同款配置为标准）。

## 原理回顾

```
模块产物 index.es.js:   import { ref } from "vue"        ← 构建时 external，保留裸说明符
宿主 HTML:              <script type="importmap">
                          {"imports": {"vue": "/shared/vue.js"}}
                        </script>
浏览器:                  把 "vue" 解析到宿主的 /shared/vue.js  → 全局同一份 Vue
```

三个环节缺一不可：模块 external（[模块配置](/module/config#rollupoptions-external-与宿主共享依赖对齐)）、宿主产出共享 chunk（本页）、import map 注入（本页）。

## 第一步：共享依赖清单（单一来源）

在宿主 `vite.config.ts` 顶部维护一张表，后续所有配置都从它派生：

```ts
const SHARED_DEPS = [
  { pkg: 'vue', entry: 'shared-vue', file: 'shared/vue.js' },
  {
    pkg: 'element-plus',
    aliases: ['element-plus/es'],                  // 子路径导入也要映射
    entry: 'shared-element-plus',
    file: 'shared/element-plus.js',
  },
  {
    pkg: 'ele-admin-plus',
    aliases: ['ele-admin-plus/es'],
    entry: 'shared-ele-admin-plus',
    file: 'shared/ele-admin-plus.js',
  },
  { pkg: '@tanstack/vue-query', entry: 'shared-vue-query', file: 'shared/vue-query.js' },
  { pkg: '@vueuse/core', entry: 'shared-vueuse-core', file: 'shared/vueuse-core.js' },
  { pkg: 'vxe-pc-ui', entry: 'shared-vxe-pc-ui', file: 'shared/vxe-pc-ui.js' },
  { pkg: 'vxe-table', entry: 'shared-vxe-table', file: 'shared/vxe-table.js' },
  {
    pkg: 'element-plus/es/locale/lang/zh-cn',      // locale 这类子路径模块单独占一项
    entry: 'shared-el-locale-zh-cn',
    file: 'shared/el-locale-zh-cn.js',
  },
  {
    pkg: 'ele-admin-plus/es/lang/zh_CN',
    entry: 'shared-ele-lang-zh-cn',
    file: 'shared/ele-lang-zh-cn.js',
  },
] as const
```

每项三个字段：`pkg` 是 import map 的键（模块里写的说明符）；`entry` 是宿主侧 re-export 入口名；`file` 是构建产物的**固定文件名**（不带 hash，原因见下）。

## 第二步：re-export 入口文件

`src/shared/` 下为每个共享库建一个一行的转发文件：

```ts
// src/shared/vue.ts
export * from 'vue'
```

```ts
// src/shared/el-locale-zh-cn.ts
export { default } from 'element-plus/es/locale/lang/zh-cn'
```

作用：给 vite 一个**可控的构建入口**，把整个库完整地（不摇树掉模块可能用到的导出）打成一个独立 chunk。注意默认导出的库（locale 等）要转发 `default`。

## 第三步：构建配置——多入口 + 固定文件名

```ts
const sharedInput = Object.fromEntries(
  SHARED_DEPS.map((d) => [
    d.entry,
    fileURLToPath(new URL(`./src/shared/${d.entry.replace(/^shared-/, '')}.ts`, import.meta.url)),
  ]),
)

const input = {
  app: fileURLToPath(new URL('./index.html', import.meta.url)),  // 正常应用入口
  ...sharedInput,                                                 // + 每个共享库一个入口
}

const sharedEntryMap = Object.fromEntries(SHARED_DEPS.map((d) => [d.entry, d.file]))

// build 配置：
build: {
  rollupOptions: {            // （rolldown-vite 则为 rolldownOptions）
    preserveEntrySignatures: 'strict',     // ★ 必须：保持入口导出签名不被改写
    input,
    output: {
      entryFileNames(chunkInfo) {
        return sharedEntryMap[chunkInfo.name] ?? 'assets/[name]-[hash].js'
      },
    },
  },
},
```

两个关键点：

- **`preserveEntrySignatures: 'strict'`**：默认情况下打包器可能改写入口 chunk 的导出形状（facade 优化）；共享 chunk 是给 import map 消费的"库"，导出签名必须与源库完全一致，否则模块 `import { ElMessage } from 'element-plus'` 可能解析不到。
- **固定文件名**：共享 chunk 输出为 `shared/vue.js` 这类**无 hash**的稳定路径——import map 里写的就是这个地址；其余应用 chunk 维持带 hash 的默认规则。（代价是共享 chunk 不能用永久强缓存策略，需配合 Cache-Control 协商缓存或升级时改文件名。）

## 第四步：注入 import map

```ts
import { moduleSharedImportMapPlugin } from '@fusion-module/vite-plugin-module-shared'

// 生产表：pkg（含 aliases）→ 共享 chunk 路径
const importmap = Object.fromEntries(
  SHARED_DEPS.flatMap((d) => {
    const aliases = 'aliases' in d ? d.aliases : []
    return [d.pkg, ...aliases].map((k) => [k, `/${d.file}`])
  }),
)

// 开发表：pkg → 宿主 dev server 里的 re-export 源文件
const importmapDev = Object.fromEntries(
  SHARED_DEPS.flatMap((d) => {
    const aliases = 'aliases' in d ? (d.aliases as readonly string[]) : []
    const devUrl = `/src/shared/${d.entry.replace(/^shared-/, '')}.ts`
    return [d.pkg, ...aliases].map((k) => [k, devUrl])
  }),
)

// plugins:
moduleSharedImportMapPlugin({ imports: importmap, devImports: importmapDev })
```

- 插件会把映射注入为 `<head>` 最前面的 `<script type="importmap">`，并自动为站内路径拼上 vite `base`（如宿主 `base: '/drugWarehouse'` 时生产映射实际是 `/drugWarehouse/shared/vue.js`）。
- **dev/prod 两张表**：dev server 下没有打包产物，映射指向 re-export 的 TS 源文件，由 vite 按需编译——这使"开发期本地直载的模块"与宿主共享同一份依赖实例，行为与生产一致。
- `aliases` 让 `element-plus` 与 `element-plus/es` 两个键都指向同一个共享 chunk，覆盖手写导入与 unplugin 自动导入两种形式。

## 新增一个共享依赖的操作步骤

1. `SHARED_DEPS` 加一项（确定 pkg / 需要的 aliases / 文件名）。
2. `src/shared/` 下新建对应的 re-export 文件。
3. 宿主正常 `pnpm build`，确认产物出现 `shared/xxx.js`。
4. 通知模块方：模块的 `external` 加入该包（子路径记得用正则）。
5. **先发宿主、再发依赖它的模块**——顺序反了，模块在旧宿主上会因解析不到说明符而加载失败。

## 版本治理

- 共享依赖的实际版本由**宿主**的 lockfile 决定，模块开发环境应与宿主版本保持同一主版本线（模块 monorepo 的依赖版本对齐宿主）。
- 门户上传模块时后端会解析 manifest 并校验共享依赖版本兼容性，不兼容的包会被拒绝发布。
- 升级共享库主版本属于破坏性变更：需要宿主与全部模块协同升级，建议通过 `runtime` 标识（如 `vue-esm-app` → `vue-esm-app@2`）做代际隔离。

## 排错速查

| 症状 | 原因 | 处理 |
|---|---|---|
| `Failed to resolve module specifier "xxx"` | 模块 external 了宿主未提供的包 / import map 没覆盖该子路径 | 宿主补 SHARED_DEPS 或模块去掉 external |
| 模块渲染正常但弹窗/指令/inject 失效 | 模块漏 external，自带了第二份 Vue 或组件库 | 模块补 external，看产物体积确认 |
| dev 正常、生产失败 | 只配了 `devImports` 没配 `imports`，或共享 chunk 文件名与 import map 不一致 | 对照本页第三、四步 |
| import map 被浏览器忽略并告警 | import map 出现在模块脚本之后 | 插件默认注入 head 最前，检查是否有其它插件往 head 更前插入了 module script |
