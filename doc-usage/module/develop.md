# 开发一个模块

以实践项目中 `modules/test-module` 的结构为标准模板。模块放在业务系统 monorepo 的 `modules/` 目录下，每个模块是一个独立的 pnpm workspace 包、独立构建。

## 目录结构

```
modules/test-module/
├── package.json            # @modules/test-module，private
├── vite.config.ts          # lib 模式构建 + manifest 插件
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── env.d.ts
└── src/
    ├── index.ts            # 模块入口：默认导出 RemoteModule
    ├── mount.ts            # mount / unmount 实现
    ├── manifest.ts         # 模块元信息（manifestMeta）
    ├── index.vue           # 模块根组件
    ├── axios.ts            # 接收宿主注入的 axios 实例（见第五步）
    ├── apis/               # 模块的接口层（见第五步）
    │   └── index.ts
    ├── types/              # 模块内类型（ApiResult、VO/DTO）
    │   └── index.ts
    ├── constant.ts         # 模块内常量
    └── style.css           # 模块全局样式（可选）
```

## 第一步：模块元信息 `src/manifest.ts`

```ts
import type { ModuleManifestMeta } from '@fusion-module/contracts'

export const manifestMeta: ModuleManifestMeta = {
  code: 'test-module',        // 模块唯一编码：必须与目录名一致（见下）
  name: '测试模块',            // 人类可读名称，门户列表里展示
  version: '0.0.1',           // 模块版本，发布新版本时递增
  runtime: 'vue-esm-app',     // 运行时类型标识，当前体系固定为 vue-esm-app
}
```

元信息独立成文件的原因：它同时被**两处**消费——`src/index.ts`（随模块导出，宿主侧可读）和 `vite.config.ts`（传给 manifest 插件生成 `manifest.json`），单一来源避免不一致。

::: warning code 必须与模块目录名一致
宿主开发期的本地直载按「`modules/` 下的目录名 = moduleCode」约定查找模块（`import.meta.glob` 扫描 `modules/*/src/index.ts`）。`code` 与目录名不一致会导致开发期找不到模块。
:::

## 第二步：生命周期 `src/mount.ts`

这是模块与外界的全部接触面。标准写法：

```ts
import { createApp, type App, h } from 'vue'
import ElementPlus, { ClickOutside } from 'element-plus'
import EleAdminPlus from 'ele-admin-plus'
import VxeUIBase from 'vxe-pc-ui'
import VxeUITable from 'vxe-table'
import { VueQueryPlugin } from '@tanstack/vue-query'
import type { ModuleRuntimeContext } from '@fusion-module/contracts'
import { AppProviders } from '@packages/ui'
import AppComponent from './index.vue'
import { setHttp } from './axios'

let app: App<Element> | null = null

export const mount = (container: HTMLElement, context: ModuleRuntimeContext) => {
  if (app) unmount()                       // ① 可重入保护

  if (context.axios) {
    setHttp(context.axios)                 // ② 接管宿主的 http 实例
  }

  app = createApp({
    render() {
      return h(
        AppProviders,                      // ③ 统一 Provider（license 等）
        { license: context.license },
        { default: () => h(AppComponent, { context }) },  // ④ context 作为 prop 下传
      )
    },
  })

  app.use(ElementPlus).use(EleAdminPlus)   // ⑤ 在自己的 app 实例上注册插件
  app.use(VxeUIBase).use(VxeUITable)
  app.directive('click-outside', ClickOutside)
  app.use(VueQueryPlugin, { queryClient: context.queryClient || undefined })  // ⑥

  app.mount(container)
}

export const unmount = () => {
  if (!app) return
  app.unmount()
  app = null                               // ⑦ 释放引用
}
```

逐点说明：

- **① 可重入保护**：同一模块产物在页面内是单例（同 entry 只 import 一次），同一模块对象的 `mount` 可能被多次调用。先卸旧再挂新，保证任何时刻最多一个 app 实例。
- **② 注入 http**：模块自己的 `axios.ts` 暴露 `setHttp`，业务代码统一从那里取实例。这样模块的请求自动带上宿主的 baseURL、token、拦截器，无需自己处理鉴权。

  ```ts
  // src/axios.ts
  import type { AxiosInstance } from 'axios'

  let http: AxiosInstance

  export const setHttp = (instance: AxiosInstance) => { http = instance }
  export const getHttp = () => http
  ```

- **⑤ 模块自己 createApp**：模块创建**独立的 Vue app 实例**挂到 container 上（而非接入宿主的组件树）。插件（ElementPlus 等）需要在这个新实例上重新 `use`——但注意这些库本体来自宿主共享副本（构建时 external），`use` 只是在新 app 上注册组件/指令，不会引入第二份库代码。
- **⑥ 共享 queryClient**：把宿主注入的 queryClient 交给 VueQueryPlugin，模块与宿主、模块与模块之间共享同一份查询缓存（同 queryKey 可互相命中）。
- **⑦ unmount 释放**：`app.unmount()` 会触发组件树完整的卸载钩子；置 `null` 让 ① 的判断恢复初始态。容器残留 DOM 由宿主的 Slot 兜底清理，模块不必手动清。

## 第三步：入口 `src/index.ts`

```ts
import type { RemoteModule } from '@fusion-module/contracts'
import { mount, unmount } from './mount'
import { manifestMeta } from './manifest'
import './style.css'

const remoteModule: RemoteModule = {
  mount,
  unmount,
}

export default remoteModule          // 必须默认导出，且仅 mount/unmount 两个方法
export { manifestMeta }              // 具名导出元信息，供构建配置与宿主侧取用
```

要点：

- **必须 `export default`** 一个含 `mount`、`unmount` 的对象。运行时加载后会对默认导出做结构校验，不满足直接报 `Invalid remote module export`。
- `import './style.css'`：模块的全局样式从入口导入，配合构建配置（`cssCodeSplit: false` + `cssFileName: 'style'`）抽取为单一 `style.css`，由宿主运行时在挂载前注入。
- 标注 `: RemoteModule` 类型让 TS 在开发期就校验签名。

## 第四步：在模块里使用 context

根组件接收 context prop 后，模块内所有能力从 context 取：

```vue
<script setup lang="ts">
import type { ModuleRuntimeContext } from '@fusion-module/contracts'
import { useModuleState } from '@fusion-module/runtime-vue'

const props = defineProps<{ context: ModuleRuntimeContext }>()

// 读宿主注入的业务能力（类型来自声明合并，见下）
const user = props.context.userInfo

// 订阅宿主/其它模块的共享状态，得到响应式 ref
const currentPatient = useModuleState<string>(props.context, 'currentPatientId')

// 事件通信
props.context.event?.emit('module-ready', { code: 'test-module' })
const off = props.context.event?.on('refresh', () => { /* ... */ })
onBeforeUnmount(() => off?.())
</script>
```

### context 的类型从哪来

协议只定义了 `config` / `event` / `state` 三个可选字段。`axios`、`userInfo` 这些业务字段的类型，来自共享类型包里的**声明合并**（模块和宿主都引用同一个 `@packages/types`）：

```ts
// packages/types/src/ModuleRuntimeContext.ts
import type {} from '@fusion-module/contracts'
import type { AxiosInstance } from 'axios'
import type { QueryClient } from '@tanstack/vue-query'

declare module '@fusion-module/contracts' {
  interface ModuleRuntimeContext {
    axios: AxiosInstance
    queryClient: QueryClient
    userInfo: PortalLoginInfo | null
    license?: string
    dicts: { requestFn: DictsRequestFn }
    deptInfo: { lastVisitDept: DepartmentStoreLastVisit; departmentList: DepartmentStoreDeptList }
  }
}

export {}
```

模块代码里 `context.axios` 因此有完整类型。**新增 context 字段时改这一个文件**，宿主注入与模块消费两侧的类型同时生效。

::: tip 防御式消费
协议字段全部可选，业务字段也可能因宿主版本差异缺失。模块内访问 context 字段时保持 `context.xxx?.` 或显式判空的习惯（模板里 `if (context.axios)` 即是），让模块在能力不全的宿主中至少不崩溃。
:::

## 第五步：使用宿主的 axios 写 API

模块**不自己 new axios 实例**，而是接管宿主注入的实例——宿主的 baseURL、token 注入、统一报错拦截器、登录过期跳转全部自动继承，模块零鉴权代码。

### ① axios 容器 `src/axios.ts`

```ts
import type { AxiosInstance } from 'axios'

let http: AxiosInstance | null = null

export const setHttp = (value: AxiosInstance) => {
  http = value
}

export const getHttp = () => {
  if (!http) {
    throw new Error('Module axios is not initialized')
  }
  return http
}
```

`mount` 里第一时间注入（[第二步](#第二步生命周期-srcmountts)模板中的 `setHttp(context.axios)`），之后模块内任何代码经 `getHttp()` 取用。

::: warning getHttp() 必须在函数内部调用，不要在模块顶层
模块文件被 `import()` 时顶层代码立即执行，而 `setHttp` 要等到 `mount` 才被调用。如果 api 文件写 `const http = getHttp()` 在顶层，**模块一加载就抛错**。正确做法是在每个请求函数内部调用 `getHttp()`，把取实例推迟到挂载之后：

```ts
// ❌ 顶层取实例：import 阶段就执行，此时还没 mount
const http = getHttp()
export const getList = () => http.post(...)

// ✅ 函数内取实例：调用时 mount 早已完成
export const getList = () => getHttp().post(...)
```
:::

### ② API 层 `src/apis/`

每个请求一个函数，统一"解包 ApiResult、非 200 转 reject"的范式（与宿主侧 api 写法保持一致）：

```ts
// src/apis/index.ts
import { getHttp } from '../axios'
import type { ApiResult } from '../types'
import type { PatientListItemVO, PatientListDTO } from '../types'

export const getPatientListRequest = async (data: PatientListDTO) => {
  const http = getHttp()

  const res = await http.post<ApiResult<PatientListItemVO[]>>(
    '/medical-outdoctors/patient/getPatientList',   // ← 相对路径，不写域名
    data,
  )

  if (res.data.code === 200) {
    return res.data.data
  }

  return Promise.reject(new Error(res.data.message))
}
```

```ts
// src/types/index.ts
export interface ApiResult<T> {
  code: number
  message?: string
  data: T
}
```

要点：

- **URL 永远写相对路径**（`/medical-outdoctors/...`）。请求实际发到哪里由宿主决定：
  - 开发期（本地直载）：模块跑在宿主 dev server 里，走宿主 `vite.config.ts` 的 `server.proxy` 转发到后端；
  - 生产期：走宿主 axios 的 baseURL / 网关。模块对环境差异完全无感。
- **非 200 转 `Promise.reject`**：这让上层的 vue-query 能正确把业务失败识别为 `isError`（vue-query 只认 reject，不认"resolve 了但 code 不对"）。
- 跨系统场景注意：模块部署到门户后，请求从**门户**发出。模块依赖的后端服务路径必须在门户的网关/代理中可达（这是发布前要和门户侧确认的事项之一）。

## 第六步：在模块里使用 vue-query

模块的 `mount` 中已把**宿主的 queryClient** 注册给了自己的 app 实例（[第二步](#第二步生命周期-srcmountts)模板第 ⑥ 点）：

```ts
app.use(VueQueryPlugin, { queryClient: context.queryClient || undefined })
```

因此模块组件里 `useQuery` / `useMutation` 的用法与普通应用完全一致，且缓存与宿主、其它模块**共享同一池子**。

### 查询：响应式 queryKey

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { getPatientListRequest } from './apis'

const props = defineProps<{ context: ModuleRuntimeContext }>()

const activePatientType = ref(1)
const confirmSearchValue = ref('')

const patientListQuery = useQuery({
  // computed queryKey：依赖变化自动重新请求
  queryKey: computed(() => [
    'op-doc-patient-list',                 // ← key 前缀带模块标识，见下
    activePatientType.value,
    confirmSearchValue.value,
  ]),
  queryFn: () =>
    getPatientListRequest({
      deptCode: props.context.deptInfo!.lastVisitDept.deptCode,
      doctorCode: props.context.userInfo!.userInfo.userCode!,
      key: confirmSearchValue.value,
      seeStatus: activePatientType.value.toString(),
    }),
})
</script>

<template>
  <ele-loading blur :loading="patientListQuery.isFetching.value">
    <div v-if="patientListQuery.isError.value && !patientListQuery.isFetching.value">加载失败</div>
    <div v-else v-for="item in patientListQuery.data.value" :key="item.patientId">
      {{ item.patientName }}
    </div>
  </ele-loading>
</template>
```

- 模板/逻辑中读取统一用 `.value`（`isFetching.value` / `data.value` / `isError.value`）。
- 筛选条件放进 `computed` 的 queryKey，条件一变自动 refetch，不需要手写 watch。

### 变更：useMutation + 缓存失效

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { EleMessage } from 'ele-admin-plus'
import { savePatientRequest } from './apis'

const queryClient = useQueryClient()   // 拿到的就是宿主注入的那个 client

const saveMutation = useMutation({
  mutationFn: savePatientRequest,
  onSuccess: () => {
    EleMessage.success({ message: '保存成功', plain: true })
    queryClient.invalidateQueries({ queryKey: ['op-doc-patient-list'] })  // 让列表查询失效重取
  },
})

const handleSave = () => saveMutation.mutate(formValues.value)
```

### 共享缓存的两面性（queryKey 命名规约）

queryClient 全局共享带来一个必须遵守的纪律：**queryKey 必须带模块自己的前缀**（如 `'op-doc-patient-list'` 的 `op-doc-` 即门诊医生站缩写）。

- 好处（刻意利用）：同一份数据被多个模块查询时，用约定的同一个 key 即可共享缓存与请求去重；模块也可以 `invalidateQueries` 宿主的数据触发联动刷新。
- 风险（必须避免）：两个模块无意中用了相同的裸 key（如 `['list']`），缓存互相串、互相覆盖，且极难排查。

另外，宿主在用户切换/登出时会调用 `queryClient.clear()` 整体清缓存（rebuild 机制），模块不需要也不应该自己处理登录态变化的缓存清理。

## 第七步：模块间通信实战

事件 + 共享状态配合使用的真实范式（患者列表模块选中患者，通知其它模块）：

```ts
// 发送方模块：选中患者时
const handleSelectPatient = (patient: PatientListItemVO) => {
  activePatient.value = patient

  // 事件：通知"发生了选择动作"（只有当时在场的订阅者收到）
  props.context.event?.emit('outpatient-select-patient', { patient: { ...patient } })

  // 状态：记录"当前选中是谁"（之后挂载的模块也能读到）
  props.context.state?.set('outpatient-currentPatient', { ...patient })
}

// 自己卸载时清掉归属自己的状态
onBeforeUnmount(() => {
  props.context.state?.delete('outpatient-currentPatient')
})
```

```ts
// 接收方模块：两种方式按需选用
// A. 响应式订阅状态（推荐，新挂载也能拿到当前值）
const currentPatient = useModuleState<PatientVO>(props.context, 'outpatient-currentPatient')

// B. 订阅事件（适合"动作"类通知）
const off = props.context.event?.on<{ patient: PatientVO }>('outpatient-select-patient', ({ patient }) => {
  // ...
})
onBeforeUnmount(() => off?.())
```

通信纪律：

- **事件名 / 状态键都带模块或业务域前缀**（`outpatient-`），理由同 queryKey——总线和状态容器是全局共享的。
- **payload 传拷贝**（`{ ...patient }`）不传内部响应式对象，避免接收方意外改写发送方状态。
- `event.on` 返回的退订函数**必须在 `onBeforeUnmount` 调用**，否则模块卸载后句柄残留，下次事件触发会执行已销毁组件的闭包。
- 事件与状态的类型约定（事件名 → payload 类型）建议集中定义在共享类型包，两端 import 同一份。

全局 store 的完整用法（useModuleState 细节、查询结果镜像、多模块数据链、使用纪律与 state/event/queryClient 选型）单独成页：[使用全局 store（共享状态）](/module/global-state)。

## 模块可以用工作区共享代码

模块可通过 alias 引用 monorepo 内的共享包（如 `@packages/ui`、`@packages/types`）。注意这些包是**源码引用、随模块一起打包**（不 external），所以只放轻量的业务组件与类型；重型依赖永远走共享依赖机制。

下一步：[模块配置详解](/module/config)（vite.config.ts 每一项为什么这么配）。
