import type { ModuleManifest, ModuleRuntimeContext } from '@fusion-module/contracts'
import { loadStyle } from '../loader/load-style'
import { loadRemoteModule } from '../loader/load-remote-module'

export interface MountModuleOptions {
  manifest: ModuleManifest
  container: HTMLElement
  context: ModuleRuntimeContext
}

export const mountModule = async (options: MountModuleOptions) => {
  const { container, context, manifest } = options

  await loadStyle(manifest.style)

  const remoteModule = await loadRemoteModule(manifest.entry)

  await remoteModule.mount(container, context)

  return {
    manifest,
    remoteModule,
    container,
    context,
  }
}
