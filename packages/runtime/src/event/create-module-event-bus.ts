import type { ModuleEventBus, ModuleEventHandler } from '@fusion-module/contracts'

export const createModuleEventBus = (): ModuleEventBus => {
  const listeners = new Map<string, Set<ModuleEventHandler>>()

  const on = <T = unknown>(type: string, handler: ModuleEventHandler<T>) => {
    const handlers = listeners.get(type) ?? new Set<ModuleEventHandler>()

    handlers.add(handler as ModuleEventHandler)
    listeners.set(type, handlers)

    return () => {
      handlers.delete(handler as ModuleEventHandler)

      if (handlers.size === 0) {
        listeners.delete(type)
      }
    }
  }

  const emit = <T = unknown>(type: string, payload?: T) => {
    listeners.get(type)?.forEach((handler) => {
      handler(payload)
    })
  }

  return {
    emit,
    on,
  }
}
