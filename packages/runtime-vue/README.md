# @fusion-module/runtime-vue

Vue 3 bindings for `@fusion-module/runtime`. Provides components and composables
to embed remote modules inside a Vue application.

## Install

```bash
pnpm add @fusion-module/runtime-vue @fusion-module/runtime @fusion-module/contracts vue
```

Don't forget the stylesheet:

```ts
import "@fusion-module/runtime-vue/style.css"
```

## What's inside

- `<RemoteModuleSlot>` — mount a remote module into a slot
- `useModuleState` — reactive access to a key in the module state

## License

MIT
