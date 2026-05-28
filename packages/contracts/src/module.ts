export type ModuleEventHandler<T = unknown> = (payload: T) => void

export interface ModuleEventBus {
  emit<T = unknown>(type: string, payload?: T): void
  on<T = unknown>(type: string, handler: ModuleEventHandler<T>): () => void
}

export interface ModuleState {
  get<T = unknown>(key: string): T | undefined
  set<T = unknown>(key: string, value: T): void
  delete(key: string): void
  clear(): void
  subscribe<T = unknown>(
    key: string,
    handler: (value: T | undefined, oldValue: T | undefined) => void,
  ): () => void
}

export interface ModuleRuntimeContext {
  config?: Record<string, unknown>
  event?: ModuleEventBus
  state?: ModuleState
}

export interface RemoteModule {
  mount(container: HTMLElement, context: ModuleRuntimeContext): void | Promise<void>
  unmount(): void | Promise<void>
}

export interface ModuleManifestMeta {
  code: string
  name: string
  version: string
  runtime: string
}

export interface ModuleManifest extends ModuleManifestMeta {
  entry: string
  style?: string
}
