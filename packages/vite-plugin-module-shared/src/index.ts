import type { Plugin, ResolvedConfig } from 'vite'

export interface ModuleSharedImportMapPluginOptions {
  imports: Record<string, string>
}

export const moduleSharedImportMapPlugin = (
  options: ModuleSharedImportMapPluginOptions,
): Plugin => {
  let config: ResolvedConfig

  const withBase = (path: string) => {
    if (!path.startsWith('/') || path.startsWith('//')) {
      return path
    }

    return `${config.base.replace(/\/$/, '')}${path}`
  }

  return {
    name: 'module-shared-import-map-plugin',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    transformIndexHtml() {
      const imports = Object.fromEntries(
        Object.entries(options.imports).map(([specifier, path]) => [specifier, withBase(path)]),
      )

      return [
        {
          tag: 'script',
          attrs: {
            type: 'importmap',
          },
          children: JSON.stringify({ imports }),
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
