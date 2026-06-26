# 旧链路迁移注意

技术实现重构过一版，存量项目（如 outpatient-doctor）中可能仍有旧链路代码。本页列出新旧差异与迁移要点，新项目请直接忽略旧方式。

## 旧链路长什么样

旧版模块发现走「**远程拉取 manifest.json**」：

```ts
// ❌ 旧方式：宿主维护 modules.json，记录每个模块的 manifestUrl
{
  "modules": {
    "outpatient-doctor-visit-patient-list": {
      "code": "outpatient-doctor-visit-patient-list",
      "name": "门诊医生站病人就诊患者列表",
      "manifestUrl": "https://file-server/business-modules/xxx/manifest.json"
    }
  }
}

// ❌ 旧方式：运行时 fetch manifest 再归一化资源地址
const manifest = await fetchJson<ModuleManifest>(manifestUrl)
const normalized = normalizeManifestAssetUrl(manifest, manifestUrl)
```

`fetchJson` 与 `normalizeManifestAssetUrl` 在当前版本的 `@fusion-module/runtime-vue` 中已标记 **`@deprecated`**，仅为编译兼容保留，**勿用于新代码**。

## 新链路

模块信息由接口/注册表直接返回，宿主**本地拼接** manifest（不再多一次 manifest.json 的网络往返，版本切换也不依赖文件内容）：

```ts
// ✅ 新方式
const target = await 接口拿模块注册信息(moduleCode)
return buildModuleManifest({
  moduleCode: target.moduleCode,
  moduleName: target.moduleName,
  version: target.versionNo,
  entry: parsed.entry,        // 相对路径仍来自发布时存档的 manifest 内容
  style: parsed.style,
})
```

实现见[宿主接入](/host/integrate#生产期实现-resolvemanifest)。

## 迁移清单

| 检查项 | 旧 | 新 |
|---|---|---|
| 模块发现 | `modules.json` + `manifestUrl` | 后端注册表接口 / 宿主自有约定 |
| manifest 获取 | 运行时 `fetchJson(manifestUrl)` | 发布时存档，运行时本地拼接 `buildModuleManifest` |
| 资源地址归一化 | `normalizeManifestAssetUrl(manifest, manifestUrl)` | `joinUrl(VITE_MODULE_URL, code, version, asset)` |
| 版本切换 | 重新部署 manifest.json | 注册表改 `versionNo` 即时生效 |
| `previewImage` | 不支持 | manifest 插件自动写入（产物含 `preview.png` 时） |

模块侧（`modules/` 下的代码）新旧版本**协议未变**（默认导出 mount/unmount、manifest 插件用法一致），一般无需改动；需要核对的只有：

1. `external` 清单是否与当前宿主 `SHARED_DEPS` 对齐（旧模块可能缺 `@vueuse/core`、vxe 系）；
2. `manifestMeta.code` 是否与目录名一致（新版本地直载按目录名匹配）；
3. 旧模块若直接 `import` 了已变更的共享类型包路径，按现行 `@packages/types` 调整。
