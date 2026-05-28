import type { ModuleRuntimeContext } from '@fusion-module/contracts'
import { onBeforeUnmount, ref, type Ref, type UnwrapRef } from 'vue'

export const useModuleState = <T>(
  context: ModuleRuntimeContext,
  key: string,
  defaultValue: T | null = null,
): Ref<UnwrapRef<T> | null, T | UnwrapRef<T> | null> => {
  const stateValue = ref(
    context.state?.get<T>(key) ?? defaultValue,
  ) as Ref<UnwrapRef<T> | null, T | UnwrapRef<T> | null>

  const off = context.state?.subscribe<T>(key, (value) => {
    stateValue.value = value ?? defaultValue
  })

  onBeforeUnmount(() => {
    off?.()
  })

  return stateValue
}
