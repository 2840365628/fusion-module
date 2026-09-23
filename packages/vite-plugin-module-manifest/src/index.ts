import type { ModuleContract, ModuleManifest, ModuleManifestMeta } from '@fusion-module/contracts'
import type { Plugin, ResolvedConfig } from 'vite'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export interface ModuleManifestBuildPluginOptions {
  manifest: ModuleManifestMeta
  entry?: string
  style?: string
  manifestFileName?: string
  previewImage?: string
  /** 能力契约，原样写入 manifest.json；不传则不写 contract 字段 */
  contract?: ModuleContract
}

const ContractFields = ['provides', 'requires', 'optional', 'emits', 'listens'] as const
const EventFields = new Set<string>(['emits', 'listens'])
/** 事件名约定为「域:动作」，如 patient:selected */
const EventNamePattern = /^[\w-]+:[\w-]+$/

/** 契约由模块作者手写，构建时做基本检查：只输出警告，不中断构建 */
const validateContract = (contract: ModuleContract): string[] => {
  const warnings: string[] = []

  ContractFields.forEach((field) => {
    const values: unknown = contract[field]
    if (values === undefined) return
    if (!Array.isArray(values)) {
      warnings.push(`contract.${field} 应为字符串数组`)
      return
    }

    const seen = new Set<string>()
    values.forEach((value) => {
      if (typeof value !== 'string' || !value.trim()) {
        warnings.push(`contract.${field} 包含空值或非字符串`)
        return
      }
      if (seen.has(value)) warnings.push(`contract.${field} 中 "${value}" 重复`)
      seen.add(value)
      if (EventFields.has(field) && !EventNamePattern.test(value)) {
        warnings.push(
          `contract.${field} 中 "${value}" 建议使用「域:动作」格式，如 patient:selected`,
        )
      }
    })
  })

  new Set(contract.requires?.filter((key) => contract.optional?.includes(key))).forEach((key) =>
    warnings.push(`"${key}" 同时出现在 requires 和 optional 中，宿主将按必需处理`),
  )

  return warnings
}

export const moduleManifestBuildPlugin = (options: ModuleManifestBuildPluginOptions): Plugin => {
  const {
    manifest,
    entry = './index.es.js',
    manifestFileName = 'manifest.json',
    style = './style.css',
    previewImage = './preview.png',
    contract,
  } = options

  let resolveConfig: ResolvedConfig

  return {
    name: 'module-manifest-build-plugin',
    apply: 'build',
    configResolved(config) {
      resolveConfig = config

      if (contract) {
        validateContract(contract).forEach((warning) =>
          config.logger.warn(`[module-manifest] ${warning}`),
        )
      }
    },
    async closeBundle() {
      const outDir = resolve(resolveConfig.root, resolveConfig.build.outDir)
      const manifestPath = resolve(outDir, manifestFileName)

      const styleFileName = style.replace(/^\.\//, '')
      const stylePath = resolve(outDir, styleFileName)
      const hasStyle = await access(stylePath).then(
        () => true,
        () => false,
      )

      const previewFileName = previewImage.replace(/^\.\//, '')
      const previewPath = resolve(outDir, previewFileName)
      const hasPreview = await access(previewPath).then(
        () => true,
        () => false,
      )

      const buildManifest: ModuleManifest = {
        ...manifest,
        entry,
        ...(contract ? { contract } : {}),
        ...(hasStyle ? { style } : {}),
        ...(hasPreview ? { previewImage } : {}),
      }

      await mkdir(dirname(manifestPath), { recursive: true })

      await writeFile(manifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`, 'utf8')
    },
  }
}
