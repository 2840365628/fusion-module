# 独立打包与交付

模块在自己的 monorepo 内独立构建、独立交付，与宿主/门户的发布完全解耦。

## 构建

在仓库根目录（pnpm workspace）：

```bash
# 构建单个模块
pnpm --filter @modules/test-module build

# 或进入模块目录
cd modules/test-module && pnpm build
```

产物：

```
modules/test-module/dist/
├── index.es.js       # 模块 ESM 入口（已 external 共享依赖）
├── style.css         # 全部样式合并产物（模块无样式时没有此文件）
└── manifest.json     # 插件自动生成的模块描述
```

## 验证产物

打包后建议做两个快速检查：

```bash
# 1. manifest 内容正确（code/version 是本次要发布的）
cat dist/manifest.json

# 2. 共享依赖确实没被打进去（应只输出 import 语句，且都是裸说明符）
head -c 500 dist/index.es.js
```

`index.es.js` 开头应能看到形如 `import { ... } from "vue";`、`from "element-plus"` 的导入。如果搜不到这些 import、或文件体积达到几 MB，说明共享依赖被打包进去了，回查 [external 配置](/module/config#rollupoptions-external-与宿主共享依赖对齐)。

## 打成 zip

把 **dist 目录的内容**（不是 dist 文件夹本身）压缩：

```bash
cd dist && zip -r ../test-module-0.0.1.zip . && cd ..
```

zip 内应直接是 `index.es.js / style.css / manifest.json` 三个文件（顶层，不要嵌套一层目录）。门户上传时后端会解压并解析其中的 `manifest.json`。

::: tip 建议把打包脚本固化
在模块 `package.json` 加一条，避免每次手压：

```json
"scripts": {
  "build": "vite build",
  "pack": "pnpm build && cd dist && zip -r ../$npm_package_name.zip ."
}
```
:::

## 交付与部署形态

上传门户后，后端把 zip 解压到文件服务器的约定路径：

```
{文件服务器}/business-modules/{moduleCode}/{versionNo}/
├── index.es.js
├── style.css
└── manifest.json
```

- `moduleCode`、`versionNo` 来自上传表单（与 manifest.json 内的值应一致）。
- **同一版本号目录是不可变的**：发新代码必须升版本号重新上传，门户按版本切换生效，支持历史版本回退。
- 模块产物内的资源引用都是相对路径，部署到任何 base 下都能工作；绝对 URL 由门户运行时拼接（`{VITE_MODULE_URL}/{code}/{version}/index.es.js`）。

## 版本管理建议

- `manifest.ts` 里的 `version` 与上传时填写的版本号保持一致（后端校验的依据之一）。
- 遵循语义化版本：修 bug 升 patch、加功能升 minor、context 消费方式或共享依赖要求变化升 major。
- 共享依赖清单发生变化（新增 external）时，必须确认目标宿主已提供该依赖后再发布，否则旧宿主上直接加载失败。
