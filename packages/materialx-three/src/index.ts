export { compileMaterialXToTSL, createThreeMaterialFromDocument } from './compiler.js';
export { buildGraphIndex, resolveInputReference, topologicallySortFromNode } from './graph/resolve.js';
export { supportedNodeCategories } from './mapping/mx-node-map.js';
export { createTextureResolver } from './runtime/texture-resolver.js';
export type {
  MaterialSlotAssignments,
  MaterialXThreeCompileOptions,
  MaterialXThreeCompileResult,
  MaterialXThreeWarning,
  TextureResolver,
  TextureResolverContext,
} from './types.js';
