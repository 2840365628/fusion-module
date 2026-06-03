import type { ModuleManifest, ModuleManifestMeta } from '@fusion-module/contracts'
import type { Plugin, ResolvedConfig } from 'vite'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export interface ModuleManifestBuildPluginOptions {
  manifest: ModuleManifestMeta
  entry?: string
  style?: string
  manifestFileName?: string
  previewImage?: string
}

export const moduleManifestBuildPlugin = (options: ModuleManifestBuildPluginOptions): Plugin => {
  const {
    manifest,
    entry = './index.es.js',
    manifestFileName = 'manifest.json',
    style = './style.css',
    previewImage = './preview.png',
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
        ...(hasStyle ? { style } : {}),
        ...(hasPreview ? { previewImage } : {}),
      }

      await mkdir(dirname(manifestPath), { recursive: true })

      await writeFile(manifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`, 'utf8')
    },
  }
}
