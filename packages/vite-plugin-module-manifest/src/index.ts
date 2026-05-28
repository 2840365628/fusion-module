import type { ModuleManifestMeta } from '@fusion-module/contracts'
import type { Plugin, ResolvedConfig } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export interface RegistryFile {
  modules: Record<string, RegistryModuleRecord>
}

export interface RegistryModuleRecord {
  code: string
  name: string
  manifestUrl: string
  updatedAt: string
  preview?: string
}

export interface ModuleManifestBuildPluginOptions {
  manifest: ModuleManifestMeta
  entry?: string
  style?: string
  manifestFileName?: string
}

export const moduleManifestBuildPlugin = (options: ModuleManifestBuildPluginOptions): Plugin => {
  const {
    manifest,
    entry = './index.es.js',
    manifestFileName = 'manifest.json',
    style = './style.css',
  } = options

  let resolveConfig: ResolvedConfig
  let outputStyle: string | undefined

  return {
    name: 'module-manifest-build-plugin',
    apply: 'build',
    configResolved(config) {
      resolveConfig = config
    },
    generateBundle(_, bundle) {
      const styleFileName = style.replace(/^\.\//, '')

      const styleAsset = Object.values(bundle).find((item) => {
        return item.type === 'asset' && item.fileName === styleFileName
      })
      outputStyle = styleAsset ? style : undefined
    },
    async closeBundle() {
      const manifestPath = resolve(resolveConfig.root, resolveConfig.build.outDir, manifestFileName)

      const buildManifest = {
        ...manifest,
        entry,
        ...(outputStyle ? { style: outputStyle } : {}),
      }

      await mkdir(dirname(manifestPath), { recursive: true })

      await writeFile(manifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`, 'utf8')
    },
  }
}
