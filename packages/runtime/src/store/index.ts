import type { ModuleState } from '@fusion-module/contracts'
import { createStore } from 'zustand/vanilla'

type StateData = Record<string, unknown>

interface StoreState {
  data: StateData
}

export const createModuleState = (): ModuleState => {
  const store = createStore<StoreState>(() => ({ data: {} }))

  return {
    get<T>(key: string) {
      return store.getState().data[key] as T | undefined
    },

    set<T>(key: string, value: T) {
      store.setState((state) => ({
        data: {
          ...state.data,
          [key]: value,
        },
      }))
    },

    delete(key: string) {
      store.setState((state) => {
        const { [key]: _, ...rest } = state.data
        return { data: rest }
      })
    },

    clear() {
      store.setState({ data: {} })
    },

    subscribe<T>(key: string, handler: (value: T | undefined, oldValue: T | undefined) => void) {
      let oldValue = store.getState().data[key] as T | undefined

      return store.subscribe((state) => {
        const value = state.data[key] as T | undefined
        if (Object.is(value, oldValue)) return

        const prev = oldValue
        oldValue = value
        handler(value, prev)
      })
    },
  }
}
