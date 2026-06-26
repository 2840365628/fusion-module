# 使用全局 store（共享状态）

`context.state` 是宿主注入的**全局键值 store**：宿主与页面上所有模块读写同一个容器，带按键订阅能力。它是模块间共享"当前选中是谁"这类**有当前值概念**的数据的标准通道。

## 它从哪来、归谁管

```ts
// 宿主侧（模块不用写，了解即可）
import { createModuleState } from '@fusion-module/runtime'

let moduleState = createModuleState()
export const defaultRemoteModuleContext: ModuleRuntimeContext = {
  get state() { return moduleState },   // 注入 context
  // ...
}
// 用户切换/登出时整体重建（rebuild），所有键清空
```

对模块的含义：

- **全局单例**：所有模块挂的是同一个 store。键空间共享——这是能力也是约束（见命名规约）。
- **生命周期长于模块**：模块卸载 store 不清空，自己写的键要自己清（见下）。
- **宿主会整体重建**：登录态变化时宿主统一清空，模块**不要**自己实现"登出清状态"的逻辑。

## 两套读写 API

### ① 原始接口：`context.state`

```ts
props.context.state?.set('outpatient-currentPatient', { ...patient })   // 写/覆盖
const v = props.context.state?.get<PatientListItemVO>('outpatient-currentPatient')  // 读一次
props.context.state?.delete('outpatient-currentPatient')                // 删
const off = props.context.state?.subscribe<PatientListItemVO>(          // 订阅变化
  'outpatient-currentPatient',
  (value, oldValue) => { /* ... */ },
)
// off() 退订
```

适合：**写入方**使用（set/delete），以及非组件环境（工具函数、api 层）的一次性读取。

### ② Vue 响应式桥：`useModuleState`

```ts
import { useModuleState } from '@fusion-module/runtime-vue'

// (context, 键名, 默认值?)  → 返回响应式 ref，键变化自动更新
const nowSelectPatient = useModuleState<PatientListItemVO>(
  props.context,
  'outpatient-currentPatient',
)

const patientDiagnosis = useModuleState<PatientDiagnosisItemVO[]>(
  props.context,
  'outpatient-currentPatient-cardDiagnosis',
  [],                                   // 默认值：键不存在/被删除时回退
)
```

适合：**读取方**使用。要点：

- 返回的是普通 `ref`，模板直接用、`computed`/`watch` 随便依赖。
- **初始就有值**：挂载时同步读取当前值——这是它和事件最大的区别，后挂载的模块也能拿到此前已写入的状态。
- 退订自动处理：组件卸载时自动取消订阅，不需要手动 off。
- **单向桥，写 ref 不会写回 store**：`nowSelectPatient.value = xxx` 只改了本地副本，下次 store 变化还会被覆盖。写回必须走 `context.state.set(...)`。
- 第三个参数默认值的回退用的是 `??` 语义：`0`、`''`、`false` 是有效值不会被回退，只有 `undefined`（键不存在或被删）才回退。

## 真实链路示例：门诊医生站模块链

四个模块通过全局 store 串成一条数据流，这是推荐的组织方式：

```
患者列表模块                患者卡片模块                    处置 / 住院证 / 检查检验模块
─────────────              ─────────────                  ────────────────────────
选中患者
 └ set('outpatient-          读 currentPatient
    currentPatient')   ──▶   按患者查询卡片/诊断
                              └ set('…-cardData')    ──▶   useModuleState 消费
                              └ set('…-cardDiagnosis')      cardData / cardDiagnosis
```

### 写入方 A：用户动作产生状态（患者列表）

```ts
const handleSelectPatient = (patient: PatientListItemVO) => {
  activePatient.value = patient
  // 动作通知走事件（见模块间通信），当前值落进 store
  props.context.event?.emit('outpatient-select-patient', { patient: { ...patient } })
  props.context.state?.set('outpatient-currentPatient', { ...patient })
}

// 自己写的键，自己卸载时清掉
onBeforeUnmount(() => {
  props.context.state?.delete('outpatient-currentPatient')
})
```

### 写入方 B：把查询结果同步进 store（患者卡片）

模块自己查到的数据要给其它模块用时，用 `watch` 把 vue-query 的结果镜像到 store：

```ts
const patientCardQuery = useQuery({
  queryKey: computed(() => [
    'op-doc-patient-card',
    selectedPatient.value?.patientId,
    selectedPatient.value?.visitId,
  ]),
  queryFn: () => getPatientInfoRequest({ /* ... */ }),
  enabled: computed(() => !!selectedPatient.value),   // 没选患者时不查
})

watch(
  () => patientCardQuery.data.value,
  (newVal) => {
    props.context.state?.set('outpatient-currentPatient-cardData', newVal)
  },
  { immediate: true },    // immediate：缓存命中（不发请求）时也要同步当前值
)
```

`{ immediate: true }` 不能省：同患者二次选中时 vue-query 直接出缓存、`data` 可能不触发常规 watch，immediate 保证 store 始终镜像最新查询结果。

### 读取方（处置模块）

```ts
const nowSelectPatient = useModuleState<PatientListItemVO>(props.context, 'outpatient-currentPatient')
const patientCardData = useModuleState<PatientCardVO>(props.context, 'outpatient-currentPatient-cardData')
const patientDiagnosis = useModuleState<PatientDiagnosisItemVO[]>(
  props.context, 'outpatient-currentPatient-cardDiagnosis', [],
)

// 后续就是普通响应式编程
const canSubmit = computed(() => !!nowSelectPatient.value && patientDiagnosis.value.length > 0)
watch(nowSelectPatient, (p) => { /* 患者切换时重置本模块表单 */ })
```

读取方完全不知道这些数据是谁写的——模块间靠**键名契约**解耦，列表模块和处置模块互不 import。

## 使用纪律

1. **键名必须带业务域前缀**（`outpatient-`）：store 全局共享，裸键名（`'currentPatient'`）迟早撞车。
2. **一个键只有一个写入方**：谁产生数据谁 set/delete，其它模块只读。两个模块写同一个键 = 不可调试的竞态。
3. **写拷贝不写响应式对象**：`set(key, { ...patient })`。把 reactive 对象直接放进 store，读取方改字段会穿透回写入方组件，且绕过订阅通知（store 按引用判等，原地改字段不触发订阅）。
4. **更新对象/数组必须换引用**：同理，想触发订阅就 `set(key, { ...old, field: x })` 或新数组，不要改完原对象再 set 同一个引用（判等相同，订阅不会触发）。
5. **卸载清理自己的键**：`onBeforeUnmount(() => state?.delete('自己写的键'))`，避免模块移除后其它模块读到僵尸数据。
6. **键名与类型集中约定**：键 → 值类型的映射放进共享类型包统一维护，两端 import 同一份常量，避免字符串散落、类型靠记忆：

```ts
// @packages/types/src/module-state-keys.ts
export const STATE_KEYS = {
  currentPatient: 'outpatient-currentPatient',
  currentPatientCard: 'outpatient-currentPatient-cardData',
} as const
```

## state / event / queryClient 怎么选

| 通道 | 语义 | 后挂载的模块能拿到吗 | 典型场景 |
|---|---|---|---|
| `context.state` | **当前值**（可订阅的全局变量） | ✅ 挂载即读到 | 当前选中患者、当前科室、跨模块表单草稿 |
| `context.event` | **动作通知**（发完即逝） | ❌ 只有当时在场的订阅者收到 | "刷新一下"、"用户点了保存"、一次性指令 |
| `queryClient` | **服务端数据缓存** | ✅（同 queryKey 命中缓存） | 两个模块都要患者列表这类接口数据 |

经验法则：数据源自**接口**→ 共享 queryKey；源自**用户交互/模块内部计算**且有"当前值"概念 → state；只是**通知发生了什么** → event。门诊链路中三者各司其职：选中动作发 event、当前患者进 state、卡片接口数据本身在 queryClient 缓存里、给别人用的衍生结果再镜像进 state。
