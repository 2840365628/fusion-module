# fusion-module-core

Monorepo containing the core protocol and runtime for **fusion-module** — a
mechanism for loading and orchestrating remote ES-module micro-apps inside a
host application.

## Packages

| Package | Description |
|---------|-------------|
| [`@fusion-module/contracts`](./packages/contracts) | Protocol contracts and shared type definitions. No runtime code. |
| [`@fusion-module/runtime`](./packages/runtime) | Framework-agnostic runtime: module loader, lifecycle, event bus, state. |
| [`@fusion-module/runtime-vue`](./packages/runtime-vue) | Vue 3 bindings: components and composables on top of the runtime. |

## Development

```bash
pnpm install        # install all workspace deps
pnpm build          # build all packages (topological order)
pnpm typecheck      # type-check every package
pnpm lint           # oxlint + eslint
pnpm format         # oxfmt
pnpm clean          # remove build artifacts
```

## Releasing

Versioning and publishing are managed by [Changesets](https://github.com/changesets/changesets).
The three packages are **version-locked** (same version across the set).

```bash
pnpm changeset          # describe a change (creates a markdown file in .changeset/)
pnpm version-packages   # consume changesets, bump versions, update CHANGELOG
pnpm release            # build and publish to npm
```

## License

MIT © 刘晨宇
