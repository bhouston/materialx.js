# materialx.js

TypeScript monorepo for reading, validating, and writing MaterialX XML, with node definitions generated from upstream MaterialX nodedef documents.

## Packages

- `packages/materialx` - typed MaterialX document model, XML parser/serializer, filesystem IO helpers, validation API, generated node registry
- `packages/materialx-cli` - command-line tool built with `yargs-file-commands`
- `packages/materialx-three` - MaterialX to Three.js TSL compiler/runtime for Standard Surface-first workflows
- `apps/viewer` - TanStack Start preview app for interactive MaterialX -> Three TSL diagnostics and rendering

## Tooling

- `pnpm` workspaces monorepo
- TypeScript native preview (`tsgo`) with composite projects
- `oxlint` + `oxfmt`
- `vitest` for package tests
- `vitest-command-line` for CLI subprocess tests

## Install

```bash
pnpm install
```

## Development Commands

```bash
pnpm lint
pnpm format
pnpm tsc
pnpm test
pnpm build
pnpm cli -- --help
```

## Releasing To npm

Release scripts stage each package into `publish/`, rewrite `workspace:*` dependencies to real versions, and then publish.

Prerequisites:

- Root `LICENSE` file must exist (release fails if missing)
- npm auth must be configured for publish

Commands:

```bash
# Publish one package
pnpm release:package packages/materialx

# Publish all packages in order
pnpm release:all

# Dry-run staging only (no npm publish)
pnpm release:package packages/materialx --dry-run
pnpm release:all --dry-run
```

## Node Registry Generation

Node definitions are generated from:

- `../MaterialX/libraries/**/*.mtlx`

Run:

```bash
pnpm generate:nodes
```

This regenerates:

- `packages/materialx/src/generated/node-registry.generated.ts`

## CLI Commands

```bash
pnpm cli -- read <input.mtlx>
pnpm cli -- write <input.mtlx> <output.mtlx>
pnpm cli -- validate <input.mtlx>
pnpm cli -- nodes list
```

## Validation Corpus

Current test fixtures are loaded from the local upstream checkout in `../MaterialX`, including:

- `resources/Materials/Examples/StandardSurface/standard_surface_brick_procedural.mtlx`
- `resources/Materials/Examples/OpenPbr/open_pbr_default.mtlx`
- `resources/Materials/TestSuite/stdlib/texture/image.mtlx`
- `resources/Materials/TestSuite/stdlib/texture/tiledimage.mtlx`
- `resources/Materials/TestSuite/stdlib/math/math_operators.mtlx`
- `resources/Materials/TestSuite/stdlib/compositing/compositing.mtlx`
