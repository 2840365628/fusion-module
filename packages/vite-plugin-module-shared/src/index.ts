import type { Plugin, ResolvedConfig } from 'vite'

export interface ModuleSharedImportMapPluginOptions {
  /**
   * 生产构建(`vite build`)时注入的 import map。
   *
   * 用于在浏览器里把共享依赖的裸模块名(如 `vue`、`element-plus`)映射到宿主
   * 构建产出的共享 chunk(如 `/shared/vue.js`),从而让宿主与各个独立加载的
   * 子模块复用同一份依赖实例(单例),避免 Vue/Pinia 等跨实例失效。
   */
  imports: Record<string, string>
  /**
   * 开发模式(`vite dev`)时注入的 import map,可选。
   *
   * 与 {@link imports} 同样用于共享依赖去重,但指向 dev server 实时提供的源码
   * 入口(如 `/src/shared/vue.ts`),因为此时构建产物(`/shared/*.js`)尚不存在。
   *
   * 仅在「子模块以独立浏览器 ESM bundle 形式加载」(即生产的 manifest 加载链路)
   * 时才真正生效;若开发期子模块全部通过 `import.meta.glob` 由宿主 Vite 一起编译,
   * Vite 自身已对依赖做了 dedup,此项可不配置。
   */
  devImports?: Record<string, string>
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
      const source = config.command === 'serve' ? options.devImports : options.imports

      if (!source) {
        return []
      }

      const imports = Object.fromEntries(
        Object.entries(source).map(([specifier, path]) => [specifier, withBase(path)]),
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
