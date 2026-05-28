import type { RemoteModule } from '@fusion-module/contracts'

const moduleLoadTasks = new Map<string, Promise<RemoteModule>>()

const isRemoteModule = (value: unknown): value is RemoteModule => {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  return typeof candidate.mount === 'function' && typeof candidate.unmount === 'function'
}

export const loadRemoteModule = async (entry: string) => {
  if (!entry) throw new Error('Module entry is required')

  const existingTask = moduleLoadTasks.get(entry)
  if (existingTask) return existingTask

  const task = (async () => {
    const importedModule = await import(/* @vite-ignore */ entry)
    const remoteModule = importedModule.default

    if (!isRemoteModule(remoteModule)) {
      throw new Error(`Invalid remote module export from entry: ${entry}`)
    }

    return remoteModule
  })()

  moduleLoadTasks.set(entry, task)

  try {
    return await task
  } catch (error) {
    moduleLoadTasks.delete(entry)
    throw error
  }
}
