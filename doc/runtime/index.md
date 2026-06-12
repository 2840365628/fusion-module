# @fusion-module/runtime 概览

框架无关的运行时内核，运行在浏览器环境。依赖：`@fusion-module/contracts`（仅类型）、`zustand ^5`（仅 `zustand/vanilla` 入口）。tsup 构建，纯 ESM，`"sideEffects": false`。

## 源码结构

```
packages/runtime/src/
├── index.ts                        # 聚合导出
├── module-instance.ts              # ModuleInstance 接口
├── lifecycle/
│   ├── mount-module.ts             # mountModule：装载编排
│   └── unmount-module.ts           # unmountModule：卸载
├── loader/
│   ├── load-remote-module.ts       # loadRemoteModule：动态 import + Promise 缓存
│   └── load-style.ts               # loadStyle：<link> 注入 + 双层去重
├── event/
│   └── create-module-event-bus.ts  # createModuleEventBus
└── store/
    └── index.ts                    # createModuleState（zustand vanilla）
```

## 导出面

`index.ts`：

```ts
export * from './module-instance'
export * from './lifecycle/mount-module'
export * from './lifecycle/unmount-module'
export * from './event/create-module-event-bus'
export * from './store/index'
```

即包入口公开导出共 6 个符号：

| 符号 | 类别 | 源文件 | 文档 |
|---|---|---|---|
| `ModuleInstance` | interface | `module-instance.ts` | [生命周期](/runtime/lifecycle#moduleinstance) |
| `MountModuleOptions` | interface | `lifecycle/mount-module.ts` | [生命周期](/runtime/lifecycle#mountmoduleoptions) |
| `mountModule` | async 函数 | `lifecycle/mount-module.ts` | [生命周期](/runtime/lifecycle#mountmodule) |
| `unmountModule` | async 函数 | `lifecycle/unmount-module.ts` | [生命周期](/runtime/lifecycle#unmountmodule) |
| `createModuleEventBus` | 工厂函数 | `event/create-module-event-bus.ts` | [事件总线](/runtime/event-bus) |
| `createModuleState` | 工厂函数 | `store/index.ts` | [状态容器](/runtime/store) |

**注意 loader 目录不在导出面内**：`loadRemoteModule` 与 `loadStyle` 是内部函数，仅被 `mountModule` 调用，外部不可直接访问。它们的模块级缓存（`moduleLoadTasks` / `styleLoadTasks`）因此也是包私有单例。

## 内部依赖关系

```
index.ts
 ├── module-instance.ts ──────────── import type ←── contracts
 ├── lifecycle/mount-module.ts
 │     ├── loader/load-style.ts            (值导入)
 │     ├── loader/load-remote-module.ts    (值导入，import type ← contracts)
 │     └── import type ←── contracts
 ├── lifecycle/unmount-module.ts
 │     └── import type ←── module-instance.ts
 ├── event/create-module-event-bus.ts ──── import type ←── contracts
 └── store/index.ts
       ├── import type ←── contracts
       └── zustand/vanilla（唯一第三方运行时依赖）
```

事件总线与状态容器**不被生命周期代码引用**——它们是独立的工厂，由宿主自行实例化后放入 `ModuleRuntimeContext`，再经 `mountModule` 透传给远程模块。内核内部不存在任何全局事件总线或全局状态实例。

## 模块级全局状态

整个包只有两处模块级可变状态，都在 loader 中：

| 变量 | 类型 | 作用 |
|---|---|---|
| `moduleLoadTasks` | `Map<string, Promise<RemoteModule>>` | 以 entry 为键缓存模块加载 Promise，实现并发去重与成功结果缓存 |
| `styleLoadTasks` | `Map<string, Promise<void>>` | 以样式 URL 为键缓存加载 Promise |

二者的生命周期与页面相同（模块作用域单例），详细语义见 [模块加载器](/runtime/loader)。
