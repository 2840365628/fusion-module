import type { ModuleManifestMeta } from '@fusion-module/contracts'
import type { Plugin, ResolvedConfig } from 'vite'
import { access, mkdir, writeFile } from 'node:fs/promises'
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

  return {
    name: 'module-manifest-build-plugin',
    apply: 'build',
    configResolved(config) {
      resolveConfig = config
    },
    async closeBundle() {
      const outDir = resolve(resolveConfig.root, resolveConfig.build.outDir)
      const manifestPath = resolve(outDir, manifestFileName)

      const styleFileName = style.replace(/^\.\//, '')
      const stylePath = resolve(outDir, styleFileName)
      const hasStyle = await access(stylePath).then(() => true, () => false)

      const buildManifest = {
        ...manifest,
        entry,
        ...(hasStyle ? { style } : {}),
      }

      await mkdir(dirname(manifestPath), { recursive: true })

      await writeFile(manifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`, 'utf8')
    },
  }
}
