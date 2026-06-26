# 整体协作模型

fusion-module 解决的问题：**多个业务系统各自开发的页面级模块，如何被另一个系统（尤其是门户）在运行时动态嵌入**，而不是构建期把源码拷来拷去。

## 四方角色

```
┌────────────────────┐   开发/打包    ┌──────────────────────────┐
│ 业务系统 A（药库）   │ ───────────▶ │                          │
│  modules/xxx        │   zip 上传    │  文件服务器               │
├────────────────────┤              │  /business-modules/       │
│ 业务系统 B（门诊）   │ ───────────▶ │    {moduleCode}/          │
│  modules/yyy        │              │      {version}/           │
└────────────────────┘              │        index.es.js        │
                                     │        style.css          │
        ▲ 模块也可以被                │        manifest.json      │
        │ 自己系统的宿主嵌入            └──────────┬───────────────┘
        │                                       │ 运行时动态 import
┌───────┴─────────────────────────┐             │
│ 门户系统（插件市场）               │ ◀───────────┘
│  · 模块上传 / 版本管理 / 启停      │
│  · 首页栅格动态布局               │   后端：模块注册表
│  · RemoteModuleSlot 渲染模块     │ ◀──▶ （moduleCode → 生效版本 → manifest）
└─────────────────────────────────┘
```

- **业务系统**：既是模块的生产者（`modules/` 目录下开发、独立打包），也可以是自己模块的宿主（自己的 `apps/web` 里嵌入，开发期直接加载本地源码调试）。
- **文件服务器**：按 `{base}/{moduleCode}/{version}/` 的目录约定存放模块产物。门户上传 zip 后由后端解压到对应目录。
- **门户**：纯宿主 + 管理端。后端维护模块注册表（编码、名称、生效版本、manifest 内容、启用状态），前端据此动态渲染。

## 一次完整的模块之旅

1. **开发**：业务系统在 `modules/test-module/` 写模块，默认导出 `{ mount, unmount }`，元信息写在 `src/manifest.ts`。→ [开发一个模块](/module/develop)
2. **本地调试**：业务系统自己的宿主在开发模式用 `import.meta.glob` 直接加载模块源码（不打包、全量热更新），通过 `RemoteModuleSlot` 的 `loadModule` prop 注入。→ [宿主接入](/host/integrate#开发期本地直载)
3. **打包**：`vite build` 出 `dist/`（`index.es.js` + `style.css` + `manifest.json`），把 dist 内容压成 zip。→ [独立打包与交付](/module/build)
4. **发布**：在门户「模块配置」页上传 zip，填写编码/名称/版本，后端解析 manifest、校验共享依赖、解压到文件服务器、登记注册表。→ [门户动态配置](/portal/market)
5. **运行**：门户首页按用户配置的栅格布局渲染 `RemoteModuleSlot`，`resolveManifest` 从注册表数据 + 文件服务器地址本地拼出 manifest，运行时 `import()` 模块入口，注入 context，模块挂载。

## 三个关键机制

### ① 生命周期协议

模块入口默认导出固定形状：

```ts
export default {
  mount(container: HTMLElement, context: ModuleRuntimeContext) { /* 渲染进 container */ },
  unmount() { /* 销毁自身 */ },
}
```

宿主不关心模块内部是什么——只要会 mount/unmount，就能被任何接入了 `RemoteModuleSlot` 的系统嵌入。这是"跨系统"成立的根基。

### ② 共享依赖（import map）

Vue、Element Plus、vxe-table 这类公共库**只在宿主存在一份**：

- 模块构建时把它们声明为 `external`，产物里只剩 `import ... from 'vue'` 这样的裸说明符；
- 宿主构建时把每个共享库打成独立 chunk，并经 `moduleSharedImportMapPlugin` 在 HTML 里注入 import map；
- 浏览器加载模块产物时，按 import map 把 `'vue'` 解析到宿主的共享 chunk。

效果：模块产物极小（通常几十 KB），且宿主与所有模块共用同一个 Vue/Pinia/QueryClient 实例——这对依赖全局上下文的库不仅是体积优化，更是**正确性要求**。→ [共享依赖与 import map](/host/shared-deps)

### ③ 运行时上下文（context）

宿主把公共能力打包成一个 context 对象注入模块：

| 字段 | 来源 | 用途 |
|---|---|---|
| `axios` | 宿主的 request 实例 | 模块复用宿主的鉴权、拦截器、代理 |
| `queryClient` | 宿主的 vue-query client | 跨模块共享查询缓存 |
| `event` | `createModuleEventBus()` | 模块 ↔ 宿主 ↔ 模块 事件通信 |
| `state` | `createModuleState()` | 跨模块共享键值状态 |
| `userInfo` / `deptInfo` / `dicts` / `license` | 宿主业务侧 | 登录态、科室、字典、组件库授权 |

前三类由协议定义，业务字段通过 TypeScript 声明合并扩展，模块端获得完整类型提示。→ [宿主接入](/host/integrate#构建-context)

## 约束与边界

- **同技术栈**：模块与宿主必须同为 Vue 3 + 同一套共享依赖版本线。没有沙箱，模块代码与宿主同环境执行。
- **样式不隔离**：模块样式直接注入页面 `<head>`，需自觉用独立的 class 前缀/scoped 样式避免污染。
- **共享依赖版本对齐**：模块 external 的库，版本必须与宿主提供的版本兼容（门户上传时后端会校验 manifest 中的依赖版本）。
- **模块单例**：同一个 entry 在页面内只会被 import 一次，同一模块多处挂载共享同一个模块对象，`mount` 需可重入（实践模板已处理：mount 前先 unmount 旧实例）。
