# @fusion-module/create-fusion

fusion-module 模块脚手架,快速在宿主仓库中生成一个远程模块。

## 使用

在**宿主仓库根目录**执行(模块会生成到 `当前目录/modules/<code>`):

```bash
# 通过 pnpm create 约定(推荐)
pnpm create @fusion-module/fusion module

# 或使用 npx
npx @fusion-module/create-fusion module
```

按提示输入模块 `code`、名称,并勾选所需的第三方库(Vue、Vue Query 必选)。

## 生成产物

```
modules/<code>/
├── package.json          # @modules/<code>,vite lib 构建
├── vite.config.ts        # 使用 @fusion-module/vite-plugin-module-manifest 产出 manifest.json
├── tsconfig*.json
├── env.d.ts
└── src/
    ├── index.ts          # 导出 RemoteModule { mount, unmount }
    ├── manifest.ts       # ModuleManifestMeta
    ├── mount.ts          # createApp + AppProviders + 按需挂载所选库
    ├── index.vue
    ├── axios.ts
    ├── style.css
    └── constant.ts
```

## 宿主仓库要求

生成的模块假定落地在一个标准宿主 monorepo 中,需要提供:

- `@packages/ui`(导出 `AppProviders`)、`@packages/types`
- 根级 `tsconfig.app.json` / `tsconfig.node.json`
- 扩展过的运行时上下文(`context.axios` / `context.license` / `context.queryClient`)
- 共享依赖:`vue`、`@tanstack/vue-query`、`@vueuse/core`,以及所选的 `element-plus` / `ele-admin-plus` / `vxe-table`

## 开发(本仓库内)

```bash
# 在 packages/create-fusion 下直接用源码跑
pnpm --filter @fusion-module/create-fusion dev module
```
