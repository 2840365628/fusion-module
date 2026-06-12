# @fusion-module/vite-plugin-module-manifest 实现说明

构建期 Vite 插件，单文件实现。职责：在**模块产物**构建完成后，于输出目录写出一份符合 [`ModuleManifest`](/contracts#modulemanifest) 协议的 `manifest.json`。

运行环境是 Node 构建进程（使用 `node:fs/promises` 与 `node:path`），与浏览器运行时零交集；对 contracts 仅 `import type`。peer 依赖 `vite >= 5`。

## 选项接口

```ts
export interface ModuleManifestBuildPluginOptions {
  manifest: ModuleManifestMeta        // 必填：code / name / version / runtime
  entry?: string                      // 默认 './index.es.js'
  style?: string                      // 默认 './style.css'
  previewImage?: string               // 默认 './preview.png'
  manifestFileName?: string           // 默认 'manifest.json'
}
```

选项的切分对应 [`ModuleManifestMeta` 与 `ModuleManifest` 的类型切分](/contracts#modulemanifestmeta)：人工维护的元信息（`manifest`）必填，产物路径全部带默认值——默认值约定与常见的 vite lib 模式产物名（`index.es.js` / `style.css`）对齐。路径采用 `./` 相对形式，**写入 manifest 时保持原样**（消费端负责以 manifest 所在位置为基准解析）。

## `moduleManifestBuildPlugin(options): Plugin`

```ts
export const moduleManifestBuildPlugin = (options: ModuleManifestBuildPluginOptions): Plugin => {
  const {
    manifest,
    entry = './index.es.js',
    manifestFileName = 'manifest.json',
    style = './style.css',
    previewImage = './preview.png',
  } = options

  let resolveConfig: ResolvedConfig

  return {
    name: 'module-manifest-build-plugin',
    apply: 'build',                                        // ①
    configResolved(config) {
      resolveConfig = config                               // ②
    },
    async closeBundle() {                                  // ③
      const outDir = resolve(resolveConfig.root, resolveConfig.build.outDir)   // ④
      const manifestPath = resolve(outDir, manifestFileName)

      const styleFileName = style.replace(/^\.\//, '')                          // ⑤
      const stylePath = resolve(outDir, styleFileName)
      const hasStyle = await access(stylePath).then(() => true, () => false)    // ⑥

      const previewFileName = previewImage.replace(/^\.\//, '')
      const previewPath = resolve(outDir, previewFileName)
      const hasPreview = await access(previewPath).then(() => true, () => false)

      const buildManifest: ModuleManifest = {                                   // ⑦
        ...manifest,
        entry,
        ...(hasStyle ? { style } : {}),
        ...(hasPreview ? { previewImage } : {}),
      }

      await mkdir(dirname(manifestPath), { recursive: true })                   // ⑧
      await writeFile(manifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`, 'utf8')  // ⑨
    },
  }
}
```

逐点说明：

① **`apply: 'build'`**：插件只在 `vite build` 注册，dev server 下完全不存在（dev 模式没有产物目录，manifest 无意义）。

② **`configResolved`**：捕获最终配置到闭包变量，供 ④ 计算输出目录。这是 Vite 插件获取 `root` / `build.outDir` 的标准方式。

③ **选择 `closeBundle` 钩子**：它在 bundle **全部写入磁盘后**触发，是唯一能可靠做文件存在性探测（⑥）的时机——更早的 `generateBundle` 阶段文件尚未落盘，且样式文件可能由其它插件（如 CSS 抽取）在写盘阶段产生。代价是 manifest.json 绕过了 Vite 的 bundle 资产体系（不出现在构建统计/产物清单中），由插件直接写文件系统。

④ **输出目录解析**：`resolve(root, build.outDir)` 处理 outDir 为相对路径的常规情况；若 outDir 是绝对路径，`path.resolve` 的语义自动以其为准。

⑤ **`./` 前缀剥离**：选项中的相对路径形如 `./style.css`，探测磁盘文件时去掉前缀拼到 outDir 下。注意 manifest 中**写入的仍是带 `./` 的原值**——探测路径与写入值刻意分离。

⑥ **存在性探测**：`fs.promises.access` 成功 resolve 视为存在；用 `.then(onOk, onErr)` 双回调形式把异常折叠为布尔值，不区分"不存在"与"无权限"等具体错误。

⑦ **条件字段合成**：以元信息为底、必填 `entry` 直写，`style` / `previewImage` 仅在对应文件确实存在时通过条件展开（`...(cond ? {x} : {})`）写入。效果：**字段缺失 ⇔ 产物缺失**——下游（runtime 的 `loadStyle(manifest.style)` 对 `undefined` 短路）据此自然跳过不存在的资源，不会发出 404 请求。`entry` 不做探测：入口不存在属于构建本身的错误，manifest 阶段不兜底。

⑧⑨ **写出**：`mkdir(dirname, {recursive})` 防御 `manifestFileName` 含子目录（如 `meta/manifest.json`）的情况；JSON 以 2 空格缩进 + 末尾换行写出（对 diff/lint 友好）。文件名可经 `manifestFileName` 定制。

## 与其它包的协作

本插件是 `ModuleManifest` 数据的**生产端**：写出的 JSON 形状即 contracts 协议，消费端是宿主（读取/拼接后传给 `RemoteModuleSlot.resolveManifest` 的返回值）→ runtime `mountModule`。相对路径到绝对 URL 的转换责任在宿主侧（历史上由已弃用的 `normalizeManifestAssetUrl` 承担，见 [弃用 API](/runtime-vue/internals#弃用api)）。`previewImage` 字段只在本插件与宿主之间流动，运行时不消费。
