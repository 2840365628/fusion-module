import type { ModuleInstance } from '../module-instance'

export const unmountModule = async (instance: ModuleInstance) => {
  if (!instance) {
    throw new Error('Module instance is required')
  }

  await instance.remoteModule.unmount()
}
