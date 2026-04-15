import type { MaterialXNode, MaterialXNodeGraph } from '@materialx-js/materialx';
import type { CompileContext, NodeHandler } from './internal-types.js';
import { cacheKey, createResolveInputNode, readInput } from './inputs.js';
import { buildNodeHandlerRegistry } from './node-handlers.js';
import { createTextureNodeCompiler } from './texture-nodes.js';
import { toScalar, warn } from './warnings.js';
import { toNodeValue } from './value-coercion.js';

let nodeHandlers!: Map<string, NodeHandler>;

export function compileNode(
  node: MaterialXNode,
  context: CompileContext,
  scopeGraph?: MaterialXNodeGraph,
  outputName?: string
): unknown {
  const key = cacheKey(node, scopeGraph, outputName);
  const cached = context.cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const category = node.category;
  const handler = nodeHandlers.get(category);
  let compiled: unknown;
  if (handler) {
    compiled = handler(node, context, scopeGraph, outputName);
  } else {
    warn(context, {
      code: 'unsupported-node',
      message: `Unsupported MaterialX node category "${category}"`,
      category,
      nodeName: node.name,
    });
    compiled = toNodeValue(node.attributes.value ?? 0, node.type);
  }

  context.cache.set(key, compiled);
  return compiled;
}

export const resolveInputNode = createResolveInputNode(compileNode);

const textures = createTextureNodeCompiler({
  resolveInputNode,
  readInput,
  warn,
  toScalar,
});

nodeHandlers = buildNodeHandlerRegistry({
  resolveInputNode,
  compileTextureNode: textures.compileTextureNode,
  compileGltfTextureSample: textures.compileGltfTextureSample,
  compileGltfImageNode: textures.compileGltfImageNode,
  compileHexTiledTextureNode: textures.compileHexTiledTextureNode,
});
