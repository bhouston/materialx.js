import type { MaterialXDocument, MaterialXInput, MaterialXNode, MaterialXNodeGraph } from '@materialx-js/materialx';
import { Color } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  add,
  clamp,
  div,
  dot,
  float,
  luminance,
  max,
  min,
  mix,
  mx_contrast,
  mx_heighttonormal,
  mx_hsvtorgb,
  mx_rgbtohsv,
  mul,
  normalMap,
  normalWorld,
  normalize,
  positionWorld,
  sub,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { buildGraphIndex, resolveInputReference } from './graph/resolve.js';
import { supportedNodeCategories } from './mapping/mx-node-map.js';
import { buildStandardSurfaceAssignments } from './mapping/standard-surface.js';
import { applyTextureColorSpace } from './runtime/colorspace.js';
import { createTextureResolver } from './runtime/texture-resolver.js';
import { parseFloatValue, parseVector2Value, parseVector3Value, parseVector4Value } from './runtime/value-parsing.js';
import type { MaterialSlotAssignments, MaterialXThreeCompileOptions, MaterialXThreeCompileResult, MaterialXThreeWarning } from './types.js';

interface CompileContext {
  document: MaterialXDocument;
  warnings: MaterialXThreeWarning[];
  index: ReturnType<typeof buildGraphIndex>;
  options: MaterialXThreeCompileOptions;
  cache: Map<string, unknown>;
}

const toNodeValue = (value: unknown, typeHint?: string): unknown => {
  if (typeof value === 'number') {
    return float(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 2) {
      return vec2(value[0] ?? 0, value[1] ?? 0);
    }
    if (value.length === 3) {
      return vec3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
    }
    if (value.length >= 4) {
      return vec4(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 1);
    }
  }
  if (typeof value === 'string') {
    if (typeHint === 'color3' || typeHint === 'vector3') {
      const [x, y, z] = parseVector3Value(value, [0, 0, 0]);
      return vec3(x, y, z);
    }
    if (typeHint === 'color4' || typeHint === 'vector4') {
      const [x, y, z, w] = parseVector4Value(value, [0, 0, 0, 1]);
      return vec4(x, y, z, w);
    }
    if (typeHint === 'vector2') {
      const [x, y] = parseVector2Value(value, [0, 0]);
      return vec2(x, y);
    }
    return float(parseFloatValue(value, 0));
  }
  return value;
};

const readInput = (node: MaterialXNode, name: string): MaterialXInput | undefined => node.inputs.find((entry) => entry.name === name);

const resolveInterfaceValue = (scopeGraph: MaterialXNodeGraph | undefined, interfaceName: string): unknown => {
  if (!scopeGraph) {
    return undefined;
  }
  const interfaceInput = scopeGraph.inputs.find((entry) => entry.name === interfaceName);
  if (!interfaceInput) {
    return undefined;
  }
  return interfaceInput.value;
};

const warn = (context: CompileContext, warning: MaterialXThreeWarning): void => {
  context.warnings.push(warning);
};

const cacheKey = (node: MaterialXNode, scopeGraph?: MaterialXNodeGraph): string =>
  `${scopeGraph?.name ?? 'document'}:${node.name ?? node.category}`;

const getNodeChannel = (node: unknown, index: number): unknown => {
  const channels = ['x', 'y', 'z', 'w'];
  const channel = channels[index];
  if (!channel) {
    return node;
  }
  const entry = node as Record<string, unknown>;
  return entry[channel] ?? node;
};

const resolveInputNode = (
  node: MaterialXNode,
  inputName: string,
  fallback: unknown,
  context: CompileContext,
  scopeGraph?: MaterialXNodeGraph
): unknown => {
  const input = readInput(node, inputName);
  if (!input) {
    return toNodeValue(fallback, undefined);
  }

  if (input.value !== undefined) {
    return toNodeValue(input.value, input.type);
  }

  const interfaceName = input.attributes.interfacename;
  if (interfaceName) {
    const interfaceValue = resolveInterfaceValue(scopeGraph, interfaceName);
    if (interfaceValue !== undefined) {
      return toNodeValue(interfaceValue, input.type);
    }
  }

  const reference = resolveInputReference(input, scopeGraph, context.index);
  if (reference?.fromNode) {
    return compileNode(reference.fromNode, context, reference.fromGraph ?? scopeGraph);
  }

  if (input.attributes.value !== undefined) {
    return toNodeValue(input.attributes.value, input.type);
  }

  if (input.attributes.nodename || input.attributes.nodegraph) {
    warn(context, {
      code: 'missing-reference',
      message: `Could not resolve input reference "${inputName}" on node "${node.name ?? node.category}"`,
      category: node.category,
      nodeName: node.name,
    });
  }

  return toNodeValue(fallback, input.type);
};

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

const compileTextureNode = (node: MaterialXNode, context: CompileContext, scopeGraph?: MaterialXNodeGraph): unknown => {
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
  const transformedUv = node.category === 'tiledimage' ? add(mul(uvNode as never, uvTiling as never), uvOffset as never) : uvNode;

  const textureResolver = context.options.textureResolver ?? createTextureResolver({ basePath: context.options.basePath });
  const tex = textureResolver.resolve(uri, { document: context.document, node });
  const sampled = texture(tex, transformedUv as never);
  const colorCorrected = applyTextureColorSpace(context.document.attributes.colorspace, sampled);
  return selectTextureSample(colorCorrected, node.type);
};

const compileBinaryMath = (
  node: MaterialXNode,
  leftName: string,
  rightName: string,
  context: CompileContext,
  scopeGraph: MaterialXNodeGraph | undefined,
  operator: (left: unknown, right: unknown) => unknown
): unknown => {
  const left = resolveInputNode(node, leftName, 0, context, scopeGraph);
  const right = resolveInputNode(node, rightName, 0, context, scopeGraph);
  return operator(left, right);
};

const compileNode = (node: MaterialXNode, context: CompileContext, scopeGraph?: MaterialXNodeGraph): unknown => {
  const key = cacheKey(node, scopeGraph);
  const cached = context.cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const category = node.category;
  let compiled: unknown;

  switch (category) {
    case 'constant':
      compiled = resolveInputNode(node, 'value', node.attributes.value ?? 0, context, scopeGraph);
      break;
    case 'image':
    case 'tiledimage':
      compiled = compileTextureNode(node, context, scopeGraph);
      break;
    case 'texcoord': {
      const indexInput = readInput(node, 'index');
      const index = parseFloatValue(indexInput?.value ?? indexInput?.attributes.value, 0);
      compiled = uv(index);
      break;
    }
    case 'position':
      compiled = positionWorld;
      break;
    case 'normal':
      compiled = normalWorld;
      break;
    case 'normalmap': {
      const inNode = resolveInputNode(node, 'in', vec3(0.5, 0.5, 1), context, scopeGraph);
      const scaleNode = resolveInputNode(node, 'scale', 1, context, scopeGraph);
      compiled = normalMap(inNode as never, scaleNode as never);
      break;
    }
    case 'heighttonormal': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      const scaleNode = resolveInputNode(node, 'scale', 1, context, scopeGraph);
      compiled = mx_heighttonormal(inNode as never, scaleNode as never);
      break;
    }
    case 'convert': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      if (node.type === 'vector2') {
        compiled = vec2(inNode as never);
      } else if (node.type === 'vector3' || node.type === 'color3') {
        compiled = vec3(inNode as never);
      } else if (node.type === 'vector4' || node.type === 'color4') {
        compiled = vec4(inNode as never);
      } else {
        compiled = float(inNode as never);
      }
      break;
    }
    case 'add':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => add(left as never, right as never));
      break;
    case 'subtract':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => sub(left as never, right as never));
      break;
    case 'multiply':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => mul(left as never, right as never));
      break;
    case 'divide':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => div(left as never, right as never));
      break;
    case 'clamp': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      const low = resolveInputNode(node, 'low', 0, context, scopeGraph);
      const high = resolveInputNode(node, 'high', 1, context, scopeGraph);
      compiled = clamp(inNode as never, low as never, high as never);
      break;
    }
    case 'min':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => min(left as never, right as never));
      break;
    case 'max':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => max(left as never, right as never));
      break;
    case 'mix': {
      const fg = resolveInputNode(node, 'fg', 1, context, scopeGraph);
      const bg = resolveInputNode(node, 'bg', 0, context, scopeGraph);
      const mixAmount = resolveInputNode(node, 'mix', 0.5, context, scopeGraph);
      compiled = mix(bg as never, fg as never, mixAmount as never);
      break;
    }
    case 'dot':
    case 'dotproduct':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => dot(left as never, right as never));
      break;
    case 'normalize': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 1), context, scopeGraph);
      compiled = normalize(inNode as never);
      break;
    }
    case 'combine2': {
      const x = resolveInputNode(node, 'in1', 0, context, scopeGraph);
      const y = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      compiled = vec2(x as never, y as never);
      break;
    }
    case 'combine3': {
      const x = resolveInputNode(node, 'in1', 0, context, scopeGraph);
      const y = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      const z = resolveInputNode(node, 'in3', 0, context, scopeGraph);
      compiled = vec3(x as never, y as never, z as never);
      break;
    }
    case 'combine4': {
      const x = resolveInputNode(node, 'in1', 0, context, scopeGraph);
      const y = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      const z = resolveInputNode(node, 'in3', 0, context, scopeGraph);
      const w = resolveInputNode(node, 'in4', 1, context, scopeGraph);
      compiled = vec4(x as never, y as never, z as never, w as never);
      break;
    }
    case 'extract':
    case 'extract3': {
      const inNode = resolveInputNode(node, 'in', vec4(0, 0, 0, 1), context, scopeGraph);
      const indexInput = readInput(node, 'index');
      const channelIndex = Math.max(0, Math.floor(parseFloatValue(indexInput?.value ?? indexInput?.attributes.value, 0)));
      compiled = getNodeChannel(inNode, channelIndex);
      break;
    }
    case 'hsvtorgb': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      compiled = mx_hsvtorgb(inNode as never);
      break;
    }
    case 'rgbtohsv': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      compiled = mx_rgbtohsv(inNode as never);
      break;
    }
    case 'luminance': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      compiled = luminance(inNode as never, vec3(0.2126, 0.7152, 0.0722));
      break;
    }
    case 'contrast': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      const amount = resolveInputNode(node, 'amount', 1, context, scopeGraph);
      compiled = mx_contrast(inNode as never, amount as never, float(0.5));
      break;
    }
    default:
      warn(context, {
        code: 'unsupported-node',
        message: `Unsupported MaterialX node category "${category}"`,
        category,
        nodeName: node.name,
      });
      compiled = toNodeValue(node.attributes.value ?? 0, node.type);
      break;
  }

  context.cache.set(key, compiled);
  return compiled;
};

const findMaterialNode = (document: MaterialXDocument, materialName?: string): MaterialXNode | undefined => {
  const materials = document.nodes.filter((node) => node.category === 'surfacematerial');
  if (materials.length === 0) {
    return undefined;
  }
  if (!materialName) {
    return materials[0];
  }
  return materials.find((node) => node.name === materialName);
};

const resolveSurfaceShaderNode = (
  materialNode: MaterialXNode,
  context: CompileContext
): { node: MaterialXNode; scopeGraph?: MaterialXNodeGraph } | undefined => {
  const surfaceInput = readInput(materialNode, 'surfaceshader');
  if (!surfaceInput) {
    return undefined;
  }
  const reference = resolveInputReference(surfaceInput, undefined, context.index);
  if (!reference?.fromNode) {
    return undefined;
  }
  return {
    node: reference.fromNode,
    scopeGraph: reference.fromGraph,
  };
};

const getCoveredCategories = (document: MaterialXDocument): Set<string> => {
  const categories = new Set<string>();
  for (const node of document.nodes) {
    categories.add(node.category);
  }
  for (const graph of document.nodeGraphs) {
    for (const node of graph.nodes) {
      categories.add(node.category);
    }
  }
  return categories;
};

export const compileMaterialXToTSL = (
  document: MaterialXDocument,
  options: MaterialXThreeCompileOptions = {}
): MaterialXThreeCompileResult => {
  const warnings: MaterialXThreeWarning[] = [];
  const context: CompileContext = {
    document,
    warnings,
    index: buildGraphIndex(document),
    options,
    cache: new Map(),
  };

  const materialNode = findMaterialNode(document, options.materialName);
  if (!materialNode) {
    warnings.push({
      code: 'missing-material',
      message: options.materialName
        ? `Could not find surfacematerial named "${options.materialName}"`
        : 'Document does not include a surfacematerial node',
    });
    return {
      assignments: {},
      warnings,
      supportedCategories: [],
      unsupportedCategories: [],
    };
  }

  const surfaceShader = resolveSurfaceShaderNode(materialNode, context);
  if (!surfaceShader || surfaceShader.node.category !== 'standard_surface') {
    warnings.push({
      code: 'unsupported-node',
      message: 'Only standard_surface is supported for surfacematerial compilation',
      category: surfaceShader?.node.category,
      nodeName: surfaceShader?.node.name,
    });
    return {
      materialName: materialNode.name,
      assignments: {},
      warnings,
      supportedCategories: [],
      unsupportedCategories: [],
    };
  }

  const assignments = buildStandardSurfaceAssignments(surfaceShader.node, {
    getInputNode: (node, name, fallback) => resolveInputNode(node, name, fallback, context, surfaceShader.scopeGraph),
  });

  const coveredCategories = getCoveredCategories(document);
  const supportedCategories = [...coveredCategories].filter((entry) => supportedNodeCategories.has(entry)).sort();
  const unsupportedCategories = [...coveredCategories].filter((entry) => !supportedNodeCategories.has(entry)).sort();

  return {
    materialName: materialNode.name,
    surfaceShaderName: surfaceShader.node.name,
    assignments,
    warnings,
    supportedCategories,
    unsupportedCategories,
  };
};

export const createThreeMaterialFromDocument = (
  document: MaterialXDocument,
  options: MaterialXThreeCompileOptions = {}
): { material: MeshPhysicalNodeMaterial; result: MaterialXThreeCompileResult } => {
  const result = compileMaterialXToTSL(document, options);
  const material = new MeshPhysicalNodeMaterial();

  material.color = new Color(1, 1, 1);
  material.colorNode = result.assignments.colorNode as never;
  material.roughnessNode = result.assignments.roughnessNode as never;
  material.metalnessNode = result.assignments.metalnessNode as never;
  material.normalNode = result.assignments.normalNode as never;
  material.emissiveNode = result.assignments.emissiveNode as never;
  material.transmissionNode = result.assignments.transmissionNode as never;
  material.iorNode = result.assignments.iorNode as never;

  return { material, result };
};

export type { MaterialSlotAssignments };
