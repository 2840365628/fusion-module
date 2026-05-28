<script lang="ts" setup>
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { mountModule, unmountModule, type ModuleInstance } from '@fusion-module/runtime'
import type { ModuleManifest, ModuleRuntimeContext, RemoteModule } from '@fusion-module/contracts'
import RemoteModuleLoading from './remote-module-loading.vue'
import RemoteModuleError from './remote-module-error.vue'

const props = defineProps<{
  moduleCode: string
  context?: ModuleRuntimeContext
  resolveManifest: (moduleCode: string) => Promise<ModuleManifest>
  loadModule?: (moduleCode: string) => Promise<RemoteModule>
}>()

const moduleContainerRef = useTemplateRef('moduleContainerRef')
const moduleInstance = shallowRef<ModuleInstance | null>(null)
const loadStatus = ref<'loading' | 'success' | 'failed'>('loading')

let loadVersion = 0
let disposed = false
let loadQueue = Promise.resolve()

const isCurrentLoad = (version: number, moduleCode: string) =>
  !disposed && version === loadVersion && moduleCode === props.moduleCode

const cleanup = async () => {
  const instance = moduleInstance.value
  moduleInstance.value = null

  if (!instance) return

  await unmountModule(instance)
  moduleContainerRef.value?.replaceChildren()
}

const loadAndMount = async (version: number, moduleCode: string) => {
  if (!moduleContainerRef.value || !isCurrentLoad(version, moduleCode)) return

  loadStatus.value = 'loading'

  try {
    let instance: ModuleInstance

    if (props.loadModule) {
      const remoteModule = await props.loadModule(moduleCode)
      if (!isCurrentLoad(version, moduleCode)) return

      loadStatus.value = 'success'
      await nextTick()
      if (!moduleContainerRef.value || !isCurrentLoad(version, moduleCode)) return

      await remoteModule.mount(moduleContainerRef.value, props.context || {})

      instance = {
        manifest: { code: moduleCode } as ModuleManifest,
        remoteModule,
        container: moduleContainerRef.value,
        context: props.context || {},
      }
    } else if (props.resolveManifest) {
      const manifest = await props.resolveManifest(moduleCode)
      if (!isCurrentLoad(version, moduleCode)) return

      loadStatus.value = 'success'
      await nextTick()
      if (!moduleContainerRef.value || !isCurrentLoad(version, moduleCode)) return

      instance = await mountModule({
        manifest,
        container: moduleContainerRef.value,
        context: props.context || {},
      })
    } else {
      throw new Error('RemoteModuleSlot: 必须提供 loadModule 或 resolveManifest 之一')
    }

    if (!isCurrentLoad(version, moduleCode)) {
      await unmountModule(instance)
      return
    }

    moduleInstance.value = instance
  } catch (error) {
    if (!isCurrentLoad(version, moduleCode)) return

    console.error(`${moduleCode} 模块加载失败,失败原因:`, error)
    moduleContainerRef.value?.replaceChildren()
    loadStatus.value = 'failed'
  }
}

const scheduleLoad = () => {
  const version = ++loadVersion
  const moduleCode = props.moduleCode

  loadQueue = loadQueue
    .catch(() => undefined)
    .then(async () => {
      if (!isCurrentLoad(version, moduleCode)) return

      try {
        await cleanup()
        await nextTick()
        await loadAndMount(version, moduleCode)
      } catch (error) {
        if (!isCurrentLoad(version, moduleCode)) return

        console.error(`${moduleCode} 模块切换失败,失败原因:`, error)
        moduleContainerRef.value?.replaceChildren()
        loadStatus.value = 'failed'
      }
    })

  return loadQueue
}

onMounted(async () => {
  disposed = false
  await scheduleLoad()
})

onBeforeUnmount(async () => {
  disposed = true
  loadVersion++
  await loadQueue.catch(() => undefined)
  await cleanup()
})

watch(
  () => props.moduleCode,
  () => {
    scheduleLoad()
  },
)
</script>

<template>
  <div class="remote_module_slot">
    <div ref="moduleContainerRef" class="remote_module_container" />

    <div v-if="loadStatus === 'loading'" class="remote_module_loading">
      <slot name="loading">
        <remote-module-loading />
      </slot>
    </div>

    <div v-else-if="loadStatus === 'failed'" class="remote_module_error">
      <slot name="error">
        <remote-module-error />
      </slot>
    </div>
  </div>
</template>

<style scoped>
.remote_module_slot {
  position: relative;
  min-height: 0;
}

.remote_module_container {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
}

.remote_module_loading,
.remote_module_error {
  position: absolute;
  inset: 0;
}
</style>
