# @fusion-module/runtime

Framework-agnostic runtime for fusion-module. Loads remote ES modules, manages
their lifecycle, and provides cross-module event/state primitives.

## Install

```bash
pnpm add @fusion-module/runtime @fusion-module/contracts
```

## What's inside

- `mountModule` / `unmountModule` — lifecycle helpers
- `loadRemoteModule` — fetch + import a remote module by manifest
- `createModuleEventBus` — pub/sub bus across mounted modules
- `ModuleInstance` — per-mount handle

## License

MIT
