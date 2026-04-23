# @material-viewer/materialx-three

MaterialX-to-Three.js bridge for compiling MaterialX documents into Three TSL-driven materials.

This package is designed to sit on top of `@material-viewer/materialx` and produce `MeshPhysicalNodeMaterial` assignments from MaterialX graphs, with a current focus on Standard Surface and OpenPBR workflows.

## Current Scope

- Surface shader compilation path (`surfacematerial` -> `standard_surface` | `open_pbr_surface`)
- Graph reference resolution (`nodename`, `nodegraph`, `output`)
- Texture resolver hooks for browser or Node usage
- Mapping coverage report generation (`SUPPORTED_NODES.md`)
- Warning reporting for unsupported nodes and missing references

OpenPBR support currently maps core inputs to MeshPhysical slots (`base_color`, `base_metalness`, `specular_roughness`, `transmission_weight`, `specular_ior`, `transmission_dispersion_scale` + `transmission_dispersion_abbe_number` -> `dispersion`, `geometry_normal`, `emission_luminance` + `emission_color`). Any authored surface input that is not in the mapped lists is reported as a warning and ignored by the current translation.

This is still an evolving implementation, not full MaterialX parity.

## Standard Surface Mapping

Currently mapped `standard_surface` inputs:

- `base`, `base_color`
- `specular_roughness`, `metalness`
- `specular`, `specular_color`
- `specular_anisotropy`, `specular_rotation` (rotation is applied when a literal value can be resolved)
- `coat`, `coat_color`, `coat_roughness`, `coat_normal`
- `sheen`, `sheen_color`, `sheen_roughness`
- `emission`, `emission_color`
- `opacity` (converted from `color3` to scalar luminance for `opacityNode`)
- `transmission`, `transmission_color`, `transmission_depth`
- `specular_IOR` (with `ior` accepted as fallback alias)
- `thin_film_thickness`, `thin_film_IOR` / `thin_film_ior`
- `normal`

Not yet mapped in this package:

- Diffuse and advanced specular controls such as `diffuse_roughness`
- Subsurface controls (`subsurface*`)
- Coat advanced controls (`coat_anisotropy`, `coat_IOR`, `coat_affect_*`)
- Thin-walled/tangent controls (`thin_walled`, `tangent`)
- Advanced transmission controls (`transmission_scatter*`, `transmission_dispersion`, `transmission_extra_roughness`)

## Installation

In this monorepo:

```bash
pnpm install
```

For package-local development:

```bash
pnpm --filter @material-viewer/materialx-three build
pnpm --filter @material-viewer/materialx-three dev
```

## Basic Usage

```ts
import { parseMaterialX } from '@material-viewer/materialx';
import {
  compileMaterialXToTSL,
  createThreeMaterialFromDocument,
  createTextureResolver,
} from '@material-viewer/materialx-three';

const document = parseMaterialX(xmlString);

const compileResult = compileMaterialXToTSL(document, {
  textureResolver: createTextureResolver({ basePath: '/assets/materials' }),
});

const { material, result } = createThreeMaterialFromDocument(document);
```

### Main Exports

- `compileMaterialXToTSL(document, options)`
- `createThreeMaterialFromDocument(document, options)`
- `createTextureResolver(options)`
- `buildGraphIndex(document)`
- `resolveInputReference(input, scopeGraph, index)`
- `topologicallySortFromNode(node, scopeGraph, index)`
- `supportedNodeCategories`

## Texture Resolution

The compiler does not fetch images directly. Instead it delegates to a `TextureResolver`.

- Use `createTextureResolver` for simple path-based resolution with cacheing.
- In browser apps, use a custom resolver (like `apps/viewer`) to map dropped files or public assets.

## Scripts

From repo root:

```bash
pnpm --filter @material-viewer/materialx-three build
pnpm --filter @material-viewer/materialx-three dev
pnpm --filter @material-viewer/materialx-three generate:coverage
```

`generate:coverage` regenerates `packages/materialx-three/SUPPORTED_NODES.md`.

## Tests

```bash
pnpm test
```

Tests include compiler behavior and graph resolution checks using upstream MaterialX fixtures in `../MaterialX`.
