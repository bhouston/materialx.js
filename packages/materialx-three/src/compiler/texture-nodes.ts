import type { MaterialXNode, MaterialXNodeGraph } from '@material-viewer/materialx';
import { add, mul, mx_place2d, texture, uv, vec2, vec4 } from 'three/tsl';
import { applyTextureColorSpace } from '../runtime/colorspace.js';
import { createTextureResolver } from '../runtime/texture-resolver.js';
import type { CompileContext } from './internal-types.js';

type ResolveInputNode = (
  node: MaterialXNode,
  inputName: string,
  fallback: unknown,
  context: CompileContext,
  scopeGraph?: MaterialXNodeGraph,
) => unknown;

type ReadInput = (node: MaterialXNode, name: string) => MaterialXNode['inputs'][number] | undefined;
type Warn = (context: CompileContext, warning: CompileContext['warnings'][number]) => void;
type ToScalar = (value: unknown) => number | undefined;

export interface TextureNodeCompilerDeps {
  resolveInputNode: ResolveInputNode;
  readInput: ReadInput;
  warn: Warn;
  toScalar: ToScalar;
}

const selectTextureSample = (sample: unknown, typeName?: string): unknown => {
  const channelMap: Record<string, string> = {
    float: 'x',
    color3: 'rgb',
    color4: 'rgba',
    vector2: 'xy',
    vector3: 'xyz',
    vector4: 'xyzw',
  };
  const swizzle = typeName ? channelMap[typeName] : undefined;
  if (!swizzle) {
    return sample;
  }
  const node = sample as Record<string, unknown>;
  return node[swizzle] ?? sample;
};

export const createTextureNodeCompiler = ({ resolveInputNode, readInput, warn, toScalar }: TextureNodeCompilerDeps) => {
  const compileTextureNode = (
    node: MaterialXNode,
    context: CompileContext,
    scopeGraph?: MaterialXNodeGraph,
  ): unknown => {
    const fileInput = readInput(node, 'file');
    const uri = fileInput?.value ?? fileInput?.attributes.value;
    if (!uri) {
      warn(context, {
        code: 'invalid-value',
        message: `Texture node "${node.name ?? node.category}" is missing a file input`,
        category: node.category,
        nodeName: node.name,
      });
      return vec4(0, 0, 0, 1);
    }

    const uvNode = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
    const uvTiling = resolveInputNode(node, 'uvtiling', vec2(1, 1), context, scopeGraph);
    const uvOffset = resolveInputNode(node, 'uvoffset', vec2(0, 0), context, scopeGraph);
    const transformedUv =
      node.category === 'tiledimage' ? add(mul(uvNode as never, uvTiling as never), uvOffset as never) : uvNode;

    const textureResolver =
      context.options.textureResolver ?? createTextureResolver({ basePath: context.options.basePath });
    const tex = textureResolver.resolve(uri, { document: context.document, node });
    const sampled = texture(tex, transformedUv as never);
    const colorCorrected = applyTextureColorSpace(
      fileInput?.attributes.colorspace,
      context.document.attributes.colorspace,
      sampled,
    );
    return selectTextureSample(colorCorrected, node.type);
  };

  const compileGltfTextureSample = (
    node: MaterialXNode,
    context: CompileContext,
    scopeGraph?: MaterialXNodeGraph,
  ): unknown => {
    const fileInput = readInput(node, 'file');
    const uri = fileInput?.value ?? fileInput?.attributes.value;
    if (!uri) {
      warn(context, {
        code: 'invalid-value',
        message: `Texture node "${node.name ?? node.category}" is missing a file input`,
        category: node.category,
        nodeName: node.name,
      });
      return vec4(0, 0, 0, 1);
    }

    const texcoord = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
    const pivot = resolveInputNode(node, 'pivot', vec2(0, 0), context, scopeGraph);
    const scaleNode = resolveInputNode(node, 'scale', vec2(1, 1), context, scopeGraph);
    const rotate = resolveInputNode(node, 'rotate', 0, context, scopeGraph);
    const offset = resolveInputNode(node, 'offset', vec2(0, 0), context, scopeGraph);
    const operationOrderInput = readInput(node, 'operationorder');
    const operationOrder = toScalar(operationOrderInput?.value ?? operationOrderInput?.attributes.value);
    if (operationOrder !== undefined && Math.abs(operationOrder) > Number.EPSILON) {
      warn(context, {
        code: 'unsupported-node',
        category: node.category,
        nodeName: node.name,
        message: `Texture transform operationorder on "${node.name ?? node.category}" is not yet honored`,
      });
    }
    const transformedUv = mx_place2d(
      texcoord as never,
      pivot as never,
      scaleNode as never,
      rotate as never,
      offset as never,
    );

    const textureResolver =
      context.options.textureResolver ?? createTextureResolver({ basePath: context.options.basePath });
    const tex = textureResolver.resolve(uri, { document: context.document, node });
    return texture(tex, transformedUv as never);
  };

  const compileGltfImageNode = (
    node: MaterialXNode,
    context: CompileContext,
    scopeGraph: MaterialXNodeGraph | undefined,
  ): unknown => {
    const fileInput = readInput(node, 'file');
    const sampled = compileGltfTextureSample(node, context, scopeGraph);
    const colorCorrected = applyTextureColorSpace(
      fileInput?.attributes.colorspace,
      context.document.attributes.colorspace,
      sampled,
    );
    const sampledValue = selectTextureSample(colorCorrected, node.type);
    const factorInput = readInput(node, 'factor');
    const factor = factorInput ? resolveInputNode(node, 'factor', 1, context, scopeGraph) : undefined;
    if (factor !== undefined) {
      return mul(sampledValue as never, factor as never);
    }
    return sampledValue;
  };

  const compileHexTiledTextureNode = (
    node: MaterialXNode,
    context: CompileContext,
    scopeGraph?: MaterialXNodeGraph,
  ): unknown => {
    const fileInput = readInput(node, 'file');
    const uri = fileInput?.value ?? fileInput?.attributes.value;
    if (!uri) {
      warn(context, {
        code: 'invalid-value',
        message: `Texture node "${node.name ?? node.category}" is missing a file input`,
        category: node.category,
        nodeName: node.name,
      });
      return vec4(0, 0, 0, 1);
    }

    const uvNode = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
    const tiling = resolveInputNode(node, 'tiling', vec2(1, 1), context, scopeGraph);
    const transformedUv = mul(uvNode as never, tiling as never);

    const textureResolver =
      context.options.textureResolver ?? createTextureResolver({ basePath: context.options.basePath });
    const tex = textureResolver.resolve(uri, { document: context.document, node });
    const sampled = texture(tex, transformedUv as never);
    const colorCorrected = applyTextureColorSpace(
      fileInput?.attributes.colorspace,
      context.document.attributes.colorspace,
      sampled,
    );
    return selectTextureSample(colorCorrected, node.type);
  };

  return {
    compileTextureNode,
    compileGltfTextureSample,
    compileGltfImageNode,
    compileHexTiledTextureNode,
  };
};
