import type { ModuleManifest, ModuleRuntimeContext, RemoteModule } from '@fusion-module/contracts'

export interface ModuleInstance {
  manifest: ModuleManifest
  remoteModule: RemoteModule
  container: HTMLElement
  context: ModuleRuntimeContext
}
