# 门户动态配置模块（插件市场）

门户是体系中最完整的宿主形态：除了嵌入模块，还提供**模块的上传发布、版本管理、启停控制**和**首页布局的动态配置**。本页描述门户侧的完整链路（以 portal-v2-module `apps/product-web` 为蓝本）。

## 后端模块注册表

门户后端维护模块注册表，核心字段：

| 字段 | 说明 |
|---|---|
| `moduleCode` | 模块编码（唯一） |
| `moduleName` | 模块名称 |
| `versionNo` | 当前生效版本 |
| `runtime` | 运行时类型（`vue-esm-app`） |
| `moduleUrl` | 上传的模块包地址 |
| `manifest` | 模块 manifest.json 的内容（JSON 字符串，发布时从 zip 解析存档） |
| `isEnable` | 启用状态 |

配套接口：分页查询（`getModulePage`）、发布/升版（`saveModule`）、启停（`updateState`）、历史版本（`getModuleHisPage`）、按用户配置返回可用模块列表（个性化接口）。

## 模块上传与发布流程

「系统设置 → 模块配置」页面：

1. **上传 zip**：拖入模块打包产物（应包含 `index.es.js`、`style.css`、`manifest.json`，见[独立打包](/module/build)）。前端先走通用文件上传拿到文件地址。
2. **填写表单**：模块编码、名称、版本号、runtime（默认 `vue-esm-app`）、版本说明。升版场景（对已有模块「发布新版本」）会带出原模块信息，只填新版本号。
3. **发布**：调用 `saveModule`。后端解压 zip、解析校验 `manifest.json`（含共享依赖版本校验）、把产物落到文件服务器约定路径：

   ```
   {文件服务器}/business-modules/{moduleCode}/{versionNo}/
   ```

4. **生效控制**：列表里可启/停模块、查看历史版本并回退生效版本。

发布动作对正在运行的页面无侵入——下一次模块加载（刷新/重新渲染 Slot）才会取到新版本地址。

## 运行时解析：useModuleResolver

门户的 `resolveManifest` 不读静态配置，而是**注册表数据 + 本地拼接**：

```ts
export const useModuleResolver = () => {
  // 一次性拉取当前用户可用的模块清单，按 moduleCode 索引并缓存
  const modulesQuery = useQuery({
    queryKey: ['personalization-modules-list'],
    queryFn: () => getPersonalizationModuleListReqeust(),
    select: (data) => Object.fromEntries(data.map((item) => [item.moduleCode, item])),
  })

  const resolveManifest = async (moduleCode: string): Promise<ModuleManifest> => {
    const target = modulesQuery.data.value?.[moduleCode]
    if (!target) throw new Error(`Unknown module: ${moduleCode}`)

    const parsed = JSON.parse(target.manifest) as ModuleManifest   // 发布时存档的 manifest

    return buildModuleManifest({
      moduleCode: target.moduleCode,
      moduleName: target.moduleName,
      version: target.versionNo,          // 生效版本来自注册表（不是 manifest 里的）
      entry: parsed.entry,                // './index.es.js' 相对路径
      style: parsed.style,
    })
  }

  return { modulesQuery, resolveManifest }
}
```

设计要点：

- **生效版本以注册表为准**：路径里的 `{version}` 用 `versionNo`（管理员可切换/回退），manifest 字符串只取 entry/style 相对路径——回退版本不需要重新解析旧 zip。
- **vue-query 缓存清单**：同页多个 Slot 共享一次清单请求；模块启停后由 query 失效机制刷新。
- `buildModuleManifest` 把相对路径拼成 `{VITE_MODULE_URL}/{code}/{version}/index.es.js` 的绝对地址，实现见[宿主接入](/host/integrate#生产期实现-resolvemanifest)。

## 首页动态布局

首页用栅格布局（grid-layout）渲染用户/管理员配置的页面结构，配置项分两类：本地组件（`type: 'component'`）和远程模块（`type: 'module'`）：

```vue
<grid-item v-for="item in curTab.configInfo" :key="item.i"
           :x="item.x" :y="item.y" :w="item.w" :h="item.h" :i="item.i">
  <template v-if="item.type === 'module'">
    <remote-module-slot
      :module-code="item.moduleConfig!.moduleCode"
      :context="remoteModuleContext"
      :resolve-manifest="resolveManifest"
      class="h-full flex flex-col overflow-hidden"
    />
  </template>
  <template v-else>
    <component :is="getComponent(item.compName)" />
  </template>
</grid-item>
```

- 布局配置（哪个格子放哪个模块、坐标尺寸）持久化在后端的个性化配置中，「系统设置 → 个性化」里可视化编辑——**新增一个业务模块到门户首页，全程零前端代码改动**：业务系统上传模块 → 管理员在配置器里把模块拖进布局 → 用户首页生效。
- 同屏多个 Slot 各自独立加载互不阻塞；同一模块出现在多个格子时共享同一份模块代码（运行时模块缓存）。
- 配置器的模块选择列表同样来自注册表（含 `previewImage` 预览图，即模块打包时附带的 `preview.png`）。

## 门户自身的宿主配置

门户作为宿主，与业务系统宿主的配置完全相同：

- `moduleSharedImportMapPlugin({ imports, devImports })` + `SHARED_DEPS` 共享依赖体系（见[共享依赖](/host/shared-deps)）；
- `remote-module-context.ts` 构建 context（axios / queryClient / event / state / userInfo / dicts / license），登录切换时 `rebuildRemoteModuleContext()`；
- 与业务系统宿主的差别仅在 `resolveManifest` 的数据源（注册表接口 vs 各系统自己的约定）。

## 跨系统嵌入的完整闭环

```
门诊系统开发 outpatient-doctor-visit-patient-list 模块
        │ pnpm build → zip
        ▼
门户「模块配置」上传发布（v1.2.0）
        │ 后端解压至 /business-modules/outpatient-doctor-visit-patient-list/1.2.0/
        ▼
管理员在「个性化配置」把该模块拖进某科室首页布局
        ▼
医生打开门户首页 → RemoteModuleSlot 渲染
  resolveManifest('outpatient-doctor-visit-patient-list')
  → import(https://…/1.2.0/index.es.js)（vue 等依赖经 import map 用门户副本）
  → mount(container, 门户 context)：模块用门户的登录态/axios 请求门诊系统接口
```

门诊系统的页面就这样运行在了门户里——双方只共享协议与依赖清单，互不依赖对方源码。
