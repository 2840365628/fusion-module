# 内部组件与弃用 API

本页覆盖 runtime-vue 中两个不导出的兜底 UI 组件，以及两个仅为兼容保留的弃用导出。

## remote-module-loading.vue

`RemoteModuleSlot` 在 `loadStatus === 'loading'` 且宿主未提供 `#loading` 插槽时渲染的默认加载动画。**纯模板 + scoped CSS，无 script 块、无 props、无逻辑**。

实现要点：

- 视觉为一个"云朵 + 旋转箭头 + 流动斜线"的 SVG 动画，全部动效由 CSS `@keyframes` 驱动（`rotation` 旋转、`cloud` 圆形位移形变、`lines` 斜线平移），无 JS 参与。
- SVG 内部用 `<defs>` 组合滤镜与遮罩实现造型：
  - `filter#roundness`：`feGaussianBlur`（stdDeviation 1.5）+ `feColorMatrix`（alpha 通道 `20 -10` 的陡峭线性变换）——经典的"gooey"圆角化技巧，把模糊后的半透明边缘重新压成实心圆滑轮廓。
  - `mask#shapes`：三角形 + 两个圆拼出云朵剪影，另有一组三个同位圆经 `cloud` 动画错峰位移（`animation-delay` 分别为 0、-2/3、-4/3 周期）形成连续流动感。
  - `mask#clipping`：21 条横线经 `#shapes` 遮罩、`#roundness` 滤镜后作为最终遮罩，套在底部 100×100 的 `<rect>` 上。
- 可调参数集中在 `.loader` 的 CSS 自定义属性：`--cloud-color`、`--arrows-color`、`--time-animation`（其余 keyframes 周期均由 `calc()` 派生）。
- 容器样式：flex 居中、`#ebeef5` 边框、`#fafafa` 底色、6px 圆角；因 scoped，样式经 vite 构建抽取进包级 `runtime-vue.css`。

## remote-module-error.vue

`loadStatus === 'failed'` 且宿主未提供 `#error` 插槽时的默认错误占位。同样**纯模板 + scoped CSS**。

实现要点：

- 结构：圆形图标容器（内联 SVG 画感叹号：圆 + 竖线 + 点，`stroke` 描边无填充）+ 文本"模块加载失败"。图标容器带 `aria-hidden="true"`（纯装饰，文本承担语义）。
- 样式：flex 居中、`min-height: 120px`、红色系配色（边框 `#f1d3d0`、底色 `#fffafa`、文字 `#8f2f2a`、图标描边 `#d84c43`）。
- 无重试按钮、无错误详情——错误详情仅经 Slot 中的 `console.error` 输出；需要更丰富错误 UI 时用 `#error` 插槽整体替换。

两个组件都没有任何 JS 行为，因此 Slot 渲染它们没有额外生命周期成本；它们也不接收 props——Slot 不向默认兜底传递错误对象或进度信息（当前插槽也未绑定 slot props）。

## 弃用 API（components/resolve-manifest.ts）{#弃用api}

文件保留两个带 `@deprecated` JSDoc 的工具函数，仍从包入口导出，**仅为旧版宿主升级期间的编译兼容**。弃用原因：模块发现机制已从「fetch 远端 registry/manifest.json」改为「宿主侧自行获得数据、本地拼接 manifest」，Slot 的 `resolveManifest`/`loadModule` props 不再预设任何获取方式，这两个函数失去了在链路中的位置。

### `fetchJson<T>(url: string): Promise<T>`（deprecated）

```ts
export const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}
```

`fetch` 的薄封装：非 2xx（`response.ok === false`）抛出含状态码的错误，否则按 JSON 解析并以 `as` 断言为 `T`（无运行时形状校验）。原用途是拉取远端 manifest.json。

### `normalizeManifestAssetUrl(manifest, manifestUrl): ModuleManifest`（deprecated）

```ts
export const normalizeManifestAssetUrl = (
  manifest: ModuleManifest,
  manifestUrl: string,
): ModuleManifest => {
  return {
    ...manifest,
    entry: new URL(manifest.entry, manifestUrl).href,
    style: manifest.style ? new URL(manifest.style, manifestUrl).href : undefined,
  }
}
```

把 manifest 中的相对资源路径（manifest 插件写出的 `./index.es.js` 等）以 manifest 自身 URL 为基准解析为绝对 URL：`new URL(relative, base).href`。返回新对象（展开拷贝），不修改入参；`previewImage` **未被归一化**（函数弃用前就只处理 entry/style）。原用途是配合 `fetchJson` 把"manifest 所在目录"作为资源基准。
