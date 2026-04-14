# materialx-previewer

Interactive app for previewing MaterialX documents through `@materialx-js/materialx-three` and Three.js TSL.

## What It Does

- Loads built-in MaterialX example packs from `public/examples/*`
- Supports drag-and-drop (or file picker) import of:
  - `.mtlx` document
  - related texture/image files
- Compiles MaterialX to TSL-backed material assignments
- Renders a live preview sphere
- Shows diagnostics:
  - selected material/surface shader
  - supported vs unsupported categories
  - compiler warnings
  - loaded asset list

## Built-in Examples

Built-in examples live in:

`apps/materialx-previewer/public/examples/<example-name>/`

Each example directory contains:

- `material.mtlx`
- related texture/image files
- `info.txt` (display name)

## Development

From repo root:

```bash
pnpm install
pnpm previewer:dev
```

Or directly:

```bash
pnpm --filter materialx-previewer dev
```

Default dev server: `http://localhost:3000`

## Build and Test

From repo root:

```bash
pnpm previewer:build
pnpm previewer:test
```

Or directly:

```bash
pnpm --filter materialx-previewer build
pnpm --filter materialx-previewer test
```

## Drag-and-Drop Workflow

1. Drop a `.mtlx` file plus any referenced textures/images.
2. The app reads the `.mtlx` as source XML.
3. Related files are mapped into object URLs for texture resolution.
4. Compilation results and render preview update immediately.

If no `.mtlx` is included, the app shows an import error message.

## Key Files

- `src/routes/index.tsx` - main preview UI and import flow
- `src/lib/samples.ts` - built-in sample metadata + loader
- `src/lib/materialx-import.ts` - drag-drop bundle importer
- `src/lib/browser-texture-resolver.ts` - browser texture resolver bridge
- `src/components/MaterialViewport.tsx` - Three.js preview viewport

## Notes

- Rendering attempts WebGPU where available and falls back to WebGL.
- Current compiler coverage is intentionally partial; unsupported categories are expected and surfaced in the UI.
