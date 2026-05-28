# @fusion-module/contracts

Protocol contracts and shared type definitions for fusion-module. **Types only,
no runtime code.**

## Install

```bash
pnpm add @fusion-module/contracts
```

## What's inside

- `ModuleManifest` / `ModuleManifestMeta` — describe a remote module
- `ModuleRuntimeContext` — runtime context passed to mounted modules
- `RemoteModule` — the `mount` / `unmount` contract that every remote module exports
- `ModuleEventBus` / `ModuleState` — pub/sub and key-value state interfaces

## Extending types

Use TypeScript [declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html)
to add project-specific fields:

```ts
declare module '@fusion-module/contracts' {
  interface ModuleRuntimeContext {
    axios?: AxiosInstance
    userInfo?: MyUserType
  }

  interface ModuleManifestMeta {
    placement?: { defaultSize?: { w: number; h: number } }
  }
}
```

## License

MIT
