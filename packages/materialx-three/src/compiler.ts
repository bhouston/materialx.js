import type { MaterialXDocument, MaterialXInput, MaterialXNode, MaterialXNodeGraph } from '@materialx-js/materialx';
import { Color } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  abs,
  add,
  acos,
  asin,
  atan2,
  ceil,
  checker,
  clamp,
  cos,
  cross,
  distance,
  div,
  dot,
  exp,
  fract,
  floor,
  float,
  length,
  log,
  luminance,
  max,
  min,
  mod,
  mx_cell_noise_float,
  mix,
  mx_contrast,
  mx_fractal_noise_float,
  mx_heighttonormal,
  mx_hsvtorgb,
  mx_ifequal,
  mx_ifgreater,
  mx_ifgreatereq,
  mx_noise_float,
  mx_place2d,
  mx_ramplr,
  mx_ramptb,
  mx_rgbtohsv,
  mx_safepower,
  mx_splitlr,
  mx_splittb,
  mx_unifiednoise2d,
  mx_unifiednoise3d,
  mx_worley_noise_float,
  mul,
  normalMap,
  normalWorld,
  normalize,
  pow,
  positionWorld,
  reflect,
  refract,
  round,
  sign,
  sin,
  smoothstep,
  sqrt,
  step,
  sub,
  tan,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { buildGraphIndex, resolveInputReference } from './graph/resolve.js';
import { supportedNodeCategories } from './mapping/mx-node-map.js';
import { buildOpenPbrSurfaceAssignments } from './mapping/open-pbr-surface.js';
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

const cacheKey = (node: MaterialXNode, scopeGraph?: MaterialXNodeGraph, outputName?: string): string =>
  `${scopeGraph?.name ?? 'document'}:${node.name ?? node.category}:${outputName ?? 'out'}`;

const outputNameToChannelIndex = (outputName?: string): number => {
  if (!outputName) {
    return 0;
  }
  const normalized = outputName.toLowerCase();
  if (normalized.endsWith('x') || normalized.endsWith('r')) {
    return 0;
  }
  if (normalized.endsWith('y') || normalized.endsWith('g')) {
    return 1;
  }
  if (normalized.endsWith('z') || normalized.endsWith('b')) {
    return 2;
  }
  if (normalized.endsWith('w') || normalized.endsWith('a')) {
    return 3;
  }
  return 0;
};

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
    return compileNode(reference.fromNode, context, reference.fromGraph ?? scopeGraph, reference.fromOutput?.name);
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

const compileHexTiledTextureNode = (node: MaterialXNode, context: CompileContext, scopeGraph?: MaterialXNodeGraph): unknown => {
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

const compileNode = (
  node: MaterialXNode,
  context: CompileContext,
  scopeGraph?: MaterialXNodeGraph,
  outputName?: string
): unknown => {
  const key = cacheKey(node, scopeGraph, outputName);
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
    case 'screen': {
      const fg = resolveInputNode(node, 'fg', 1, context, scopeGraph);
      const bg = resolveInputNode(node, 'bg', 0, context, scopeGraph);
      const mixAmount = resolveInputNode(node, 'mix', 1, context, scopeGraph);
      const screened = sub(float(1), mul(sub(float(1), fg as never) as never, sub(float(1), bg as never) as never));
      compiled = mix(bg as never, screened as never, mixAmount as never);
      break;
    }
    case 'overlay': {
      const fg = resolveInputNode(node, 'fg', 1, context, scopeGraph);
      const bg = resolveInputNode(node, 'bg', 0, context, scopeGraph);
      const mixAmount = resolveInputNode(node, 'mix', 1, context, scopeGraph);
      const lowBranch = mul(mul(float(2), fg as never) as never, bg as never);
      const highBranch = sub(
        float(1),
        mul(mul(float(2), sub(float(1), fg as never) as never) as never, sub(float(1), bg as never) as never)
      );
      const overlayed = mix(lowBranch as never, highBranch as never, step(float(0.5), bg as never) as never);
      compiled = mix(bg as never, overlayed as never, mixAmount as never);
      break;
    }
    case 'checkerboard': {
      const color1 = resolveInputNode(node, 'color1', vec3(1, 1, 1), context, scopeGraph);
      const color2 = resolveInputNode(node, 'color2', vec3(0, 0, 0), context, scopeGraph);
      const texcoord = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
      const uvTiling = resolveInputNode(node, 'uvtiling', vec2(8, 8), context, scopeGraph);
      const uvOffset = resolveInputNode(node, 'uvoffset', vec2(0, 0), context, scopeGraph);
      const transformedUv = add(mul(texcoord as never, uvTiling as never), uvOffset as never);
      const mask = clamp(checker(transformedUv as never) as never, float(0), float(1));
      compiled = mix(color1 as never, color2 as never, mask as never);
      break;
    }
    case 'dot':
    case 'dotproduct':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => dot(left as never, right as never));
      break;
    case 'magnitude': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      compiled = length(inNode as never);
      break;
    }
    case 'normalize': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 1), context, scopeGraph);
      compiled = normalize(inNode as never);
      break;
    }
    case 'modulo':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => mod(left as never, right as never));
      break;
    case 'absval': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = abs(inNode as never);
      break;
    }
    case 'sign': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = sign(inNode as never);
      break;
    }
    case 'floor': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = floor(inNode as never);
      break;
    }
    case 'ceil': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = ceil(inNode as never);
      break;
    }
    case 'round': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = round(inNode as never);
      break;
    }
    case 'sin': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = sin(inNode as never);
      break;
    }
    case 'cos': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = cos(inNode as never);
      break;
    }
    case 'tan': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = tan(inNode as never);
      break;
    }
    case 'asin': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = asin(inNode as never);
      break;
    }
    case 'acos': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = acos(inNode as never);
      break;
    }
    case 'sqrt': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = sqrt(inNode as never);
      break;
    }
    case 'exp': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = exp(inNode as never);
      break;
    }
    case 'ln': {
      const inNode = resolveInputNode(node, 'in', 1, context, scopeGraph);
      compiled = log(inNode as never);
      break;
    }
    case 'fract': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = fract(inNode as never);
      break;
    }
    case 'atan2': {
      const inY = resolveInputNode(node, 'iny', 0, context, scopeGraph);
      const inX = resolveInputNode(node, 'inx', 1, context, scopeGraph);
      compiled = atan2(inY as never, inX as never);
      break;
    }
    case 'power':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => pow(left as never, right as never));
      break;
    case 'safepower':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) =>
        mx_safepower(left as never, right as never)
      );
      break;
    case 'distance':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => distance(left as never, right as never));
      break;
    case 'crossproduct':
      compiled = compileBinaryMath(node, 'in1', 'in2', context, scopeGraph, (left, right) => cross(left as never, right as never));
      break;
    case 'invert': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      const amount = resolveInputNode(node, 'amount', 1, context, scopeGraph);
      compiled = sub(amount as never, inNode as never);
      break;
    }
    case 'smoothstep': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      const low = resolveInputNode(node, 'low', 0, context, scopeGraph);
      const high = resolveInputNode(node, 'high', 1, context, scopeGraph);
      compiled = smoothstep(low as never, high as never, inNode as never);
      break;
    }
    case 'saturate': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      compiled = clamp(inNode as never, float(0), float(1));
      break;
    }
    case 'remap': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      const inLow = resolveInputNode(node, 'inlow', 0, context, scopeGraph);
      const inHigh = resolveInputNode(node, 'inhigh', 1, context, scopeGraph);
      const outLow = resolveInputNode(node, 'outlow', 0, context, scopeGraph);
      const outHigh = resolveInputNode(node, 'outhigh', 1, context, scopeGraph);
      const rangeIn = sub(inHigh as never, inLow as never);
      const rangeOut = sub(outHigh as never, outLow as never);
      const normalized = div(sub(inNode as never, inLow as never), rangeIn as never);
      compiled = add(outLow as never, mul(normalized as never, rangeOut as never));
      break;
    }
    case 'range': {
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      const inLow = resolveInputNode(node, 'inlow', 0, context, scopeGraph);
      const inHigh = resolveInputNode(node, 'inhigh', 1, context, scopeGraph);
      const gamma = resolveInputNode(node, 'gamma', 1, context, scopeGraph);
      const outLow = resolveInputNode(node, 'outlow', 0, context, scopeGraph);
      const outHigh = resolveInputNode(node, 'outhigh', 1, context, scopeGraph);
      const doClamp = resolveInputNode(node, 'doclamp', false, context, scopeGraph);

      const remapped = div(sub(inNode as never, inLow as never), sub(inHigh as never, inLow as never));
      const reciprocalGamma = div(float(1), gamma as never);
      const gammaCorrected = mul(pow(abs(remapped as never) as never, reciprocalGamma as never), sign(remapped as never) as never);
      const scaled = add(outLow as never, mul(gammaCorrected as never, sub(outHigh as never, outLow as never) as never));
      const clamped = clamp(scaled as never, outLow as never, outHigh as never);
      compiled = mx_ifequal(doClamp as never, true as never, clamped as never, scaled as never);
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
    case 'separate2':
    case 'separate3':
    case 'separate4': {
      const inNode = resolveInputNode(node, 'in', vec4(0, 0, 0, 1), context, scopeGraph);
      const channelIndex = outputNameToChannelIndex(outputName);
      compiled = getNodeChannel(inNode, channelIndex);
      break;
    }
    case 'place2d': {
      const texcoord = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
      const pivot = resolveInputNode(node, 'pivot', vec2(0.5, 0.5), context, scopeGraph);
      const scaleNode = resolveInputNode(node, 'scale', vec2(1, 1), context, scopeGraph);
      const rotate = resolveInputNode(node, 'rotate', 0, context, scopeGraph);
      const offset = resolveInputNode(node, 'offset', vec2(0, 0), context, scopeGraph);
      compiled = mx_place2d(
        texcoord as never,
        pivot as never,
        scaleNode as never,
        rotate as never,
        offset as never
      );
      break;
    }
    case 'ramplr': {
      const valueL = resolveInputNode(node, 'valuel', 0, context, scopeGraph);
      const valueR = resolveInputNode(node, 'valuer', 0, context, scopeGraph);
      const texcoord = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
      compiled = mx_ramplr(valueL as never, valueR as never, texcoord as never);
      break;
    }
    case 'ramptb': {
      const valueT = resolveInputNode(node, 'valuet', 0, context, scopeGraph);
      const valueB = resolveInputNode(node, 'valueb', 0, context, scopeGraph);
      const texcoord = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
      compiled = mx_ramptb(valueT as never, valueB as never, texcoord as never);
      break;
    }
    case 'splitlr': {
      const valueL = resolveInputNode(node, 'valuel', 0, context, scopeGraph);
      const valueR = resolveInputNode(node, 'valuer', 0, context, scopeGraph);
      const center = resolveInputNode(node, 'center', 0.5, context, scopeGraph);
      const texcoord = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
      compiled = mx_splitlr(valueL as never, valueR as never, center as never, texcoord as never);
      break;
    }
    case 'splittb': {
      const valueT = resolveInputNode(node, 'valuet', 0, context, scopeGraph);
      const valueB = resolveInputNode(node, 'valueb', 0, context, scopeGraph);
      const center = resolveInputNode(node, 'center', 0.5, context, scopeGraph);
      const texcoord = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
      compiled = mx_splittb(valueT as never, valueB as never, center as never, texcoord as never);
      break;
    }
    case 'ifgreater': {
      const value1 = resolveInputNode(node, 'value1', 0, context, scopeGraph);
      const value2 = resolveInputNode(node, 'value2', 0, context, scopeGraph);
      const in1 = resolveInputNode(node, 'in1', 1, context, scopeGraph);
      const in2 = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      compiled = mx_ifgreater(value1 as never, value2 as never, in1 as never, in2 as never);
      break;
    }
    case 'ifgreatereq': {
      const value1 = resolveInputNode(node, 'value1', 0, context, scopeGraph);
      const value2 = resolveInputNode(node, 'value2', 0, context, scopeGraph);
      const in1 = resolveInputNode(node, 'in1', 1, context, scopeGraph);
      const in2 = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      compiled = mx_ifgreatereq(value1 as never, value2 as never, in1 as never, in2 as never);
      break;
    }
    case 'ifequal': {
      const value1 = resolveInputNode(node, 'value1', 0, context, scopeGraph);
      const value2 = resolveInputNode(node, 'value2', 0, context, scopeGraph);
      const in1 = resolveInputNode(node, 'in1', 1, context, scopeGraph);
      const in2 = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      compiled = mx_ifequal(value1 as never, value2 as never, in1 as never, in2 as never);
      break;
    }
    case 'reflect': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      const normal = resolveInputNode(node, 'normal', vec3(0, 0, 1), context, scopeGraph);
      compiled = reflect(inNode as never, normal as never);
      break;
    }
    case 'refract': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      const normal = resolveInputNode(node, 'normal', vec3(0, 0, 1), context, scopeGraph);
      const ior = resolveInputNode(node, 'ior', 1.5, context, scopeGraph);
      compiled = refract(inNode as never, normal as never, ior as never);
      break;
    }
    case 'noise2d':
    case 'noise3d': {
      const texcoord = resolveInputNode(node, 'texcoord', vec2(0, 0), context, scopeGraph);
      const amplitude = resolveInputNode(node, 'amplitude', 1, context, scopeGraph);
      const pivot = resolveInputNode(node, 'pivot', 0, context, scopeGraph);
      compiled = mx_noise_float(texcoord as never, amplitude as never, pivot as never);
      break;
    }
    case 'fractal3d': {
      const position = resolveInputNode(node, 'position', vec3(0, 0, 0), context, scopeGraph);
      const octaves = resolveInputNode(node, 'octaves', 3, context, scopeGraph);
      const lacunarity = resolveInputNode(node, 'lacunarity', 2, context, scopeGraph);
      const diminish = resolveInputNode(node, 'diminish', 0.5, context, scopeGraph);
      const amplitude = resolveInputNode(node, 'amplitude', 1, context, scopeGraph);
      compiled = mx_fractal_noise_float(
        position as never,
        octaves as never,
        lacunarity as never,
        diminish as never,
        amplitude as never
      );
      break;
    }
    case 'cellnoise2d':
    case 'cellnoise3d': {
      const texcoord = resolveInputNode(node, 'texcoord', vec2(0, 0), context, scopeGraph);
      compiled = mx_cell_noise_float(texcoord as never);
      break;
    }
    case 'worleynoise2d':
    case 'worleynoise3d': {
      const texcoord = resolveInputNode(node, 'texcoord', vec2(0, 0), context, scopeGraph);
      const jitter = resolveInputNode(node, 'jitter', 1, context, scopeGraph);
      compiled = mx_worley_noise_float(texcoord as never, jitter as never);
      break;
    }
    case 'unifiednoise2d': {
      const type = resolveInputNode(node, 'type', 0, context, scopeGraph);
      const texcoord = resolveInputNode(node, 'texcoord', vec2(0, 0), context, scopeGraph);
      const freq = resolveInputNode(node, 'freq', vec2(1, 1), context, scopeGraph);
      const offset = resolveInputNode(node, 'offset', vec2(0, 0), context, scopeGraph);
      const jitter = resolveInputNode(node, 'jitter', 1, context, scopeGraph);
      const outMin = resolveInputNode(node, 'outmin', 0, context, scopeGraph);
      const outMax = resolveInputNode(node, 'outmax', 1, context, scopeGraph);
      const clampOutput = resolveInputNode(node, 'clampoutput', 0, context, scopeGraph);
      const octaves = resolveInputNode(node, 'octaves', 3, context, scopeGraph);
      const lacunarity = resolveInputNode(node, 'lacunarity', 2, context, scopeGraph);
      const diminish = resolveInputNode(node, 'diminish', 0.5, context, scopeGraph);
      compiled = mx_unifiednoise2d(
        type as never,
        texcoord as never,
        freq as never,
        offset as never,
        jitter as never,
        outMin as never,
        outMax as never,
        clampOutput as never,
        octaves as never,
        lacunarity as never,
        diminish as never
      );
      break;
    }
    case 'unifiednoise3d': {
      const type = resolveInputNode(node, 'type', 0, context, scopeGraph);
      const texcoord = resolveInputNode(node, 'texcoord', vec3(0, 0, 0), context, scopeGraph);
      const freq = resolveInputNode(node, 'freq', vec3(1, 1, 1), context, scopeGraph);
      const offset = resolveInputNode(node, 'offset', vec3(0, 0, 0), context, scopeGraph);
      const jitter = resolveInputNode(node, 'jitter', 1, context, scopeGraph);
      const outMin = resolveInputNode(node, 'outmin', 0, context, scopeGraph);
      const outMax = resolveInputNode(node, 'outmax', 1, context, scopeGraph);
      const clampOutput = resolveInputNode(node, 'clampoutput', 0, context, scopeGraph);
      const octaves = resolveInputNode(node, 'octaves', 3, context, scopeGraph);
      const lacunarity = resolveInputNode(node, 'lacunarity', 2, context, scopeGraph);
      const diminish = resolveInputNode(node, 'diminish', 0.5, context, scopeGraph);
      compiled = mx_unifiednoise3d(
        type as never,
        texcoord as never,
        freq as never,
        offset as never,
        jitter as never,
        outMin as never,
        outMax as never,
        clampOutput as never,
        octaves as never,
        lacunarity as never,
        diminish as never
      );
      break;
    }
    case 'hextiledimage':
      compiled = compileHexTiledTextureNode(node, context, scopeGraph);
      break;
    case 'hextilednormalmap': {
      const normalSample = compileHexTiledTextureNode(node, context, scopeGraph);
      const scaleNode = resolveInputNode(node, 'scale', 1, context, scopeGraph);
      compiled = normalMap(normalSample as never, scaleNode as never);
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

const toScalar = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number.isFinite(Number.parseFloat(value)) ? Number.parseFloat(value) : undefined;
  }
  return undefined;
};

const readScalarInput = (node: MaterialXNode, name: string): number | undefined => {
  const input = readInput(node, name);
  if (!input) {
    return undefined;
  }
  return toScalar(input.value ?? input.attributes.value);
};

const warnOpenPbrLimitations = (surfaceNode: MaterialXNode, context: CompileContext): void => {
  const unsupportedLobeInputs: Array<{ name: string; expected?: number }> = [
    { name: 'subsurface_weight', expected: 0 },
    { name: 'transmission_scatter_anisotropy', expected: 0 },
    { name: 'transmission_dispersion_scale', expected: 0 },
    { name: 'coat_darkening', expected: 1 },
  ];

  const activeUnsupportedInputs = unsupportedLobeInputs.filter((entry) => {
    const value = readScalarInput(surfaceNode, entry.name);
    if (value === undefined) {
      return false;
    }
    if (entry.expected === undefined) {
      return true;
    }
    return Math.abs(value - entry.expected) > Number.EPSILON;
  });

  if (activeUnsupportedInputs.length === 0) {
    return;
  }

  warn(context, {
    code: 'unsupported-node',
    category: surfaceNode.category,
    nodeName: surfaceNode.name,
    message: `OpenPBR inputs currently map to core MeshPhysical slots only; advanced lobes are ignored (${activeUnsupportedInputs
      .map((entry) => entry.name)
      .join(', ')})`,
  });
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
  if (!surfaceShader || !['standard_surface', 'open_pbr_surface'].includes(surfaceShader.node.category)) {
    warnings.push({
      code: 'unsupported-node',
      message: 'Only standard_surface and open_pbr_surface are supported for surfacematerial compilation',
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

  const getInputNode = (node: MaterialXNode, name: string, fallback: unknown): unknown =>
    resolveInputNode(node, name, fallback, context, surfaceShader.scopeGraph);

  const assignments =
    surfaceShader.node.category === 'standard_surface'
      ? buildStandardSurfaceAssignments(surfaceShader.node, { getInputNode })
      : buildOpenPbrSurfaceAssignments(surfaceShader.node, { getInputNode });

  if (surfaceShader.node.category === 'open_pbr_surface') {
    warnOpenPbrLimitations(surfaceShader.node, context);
  }

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

const readNumberLiteral = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const nodeValue = (value as { value?: unknown }).value;
  if (typeof nodeValue === 'number') {
    return nodeValue;
  }
  const nestedNodeValue = ((value as { node?: { value?: unknown } }).node?.value);
  if (typeof nestedNodeValue === 'number') {
    return nestedNodeValue;
  }
  return undefined;
};

export const createThreeMaterialFromDocument = (
  document: MaterialXDocument,
  options: MaterialXThreeCompileOptions = {}
): { material: MeshPhysicalNodeMaterial; result: MaterialXThreeCompileResult } => {
  const result = compileMaterialXToTSL(document, options);
  const material = new MeshPhysicalNodeMaterial();
  const opacityAssignment = result.assignments.opacityNode;
  const transmissionAssignment = result.assignments.transmissionNode;
  const hasTransmission =
    transmissionAssignment !== undefined &&
    (typeof transmissionAssignment !== 'number' || transmissionAssignment > 0.0001);
  const hasFractionalOpacity = typeof opacityAssignment === 'number' ? opacityAssignment < 0.9999 : opacityAssignment !== undefined;

  material.color = new Color(1, 1, 1);
  material.colorNode = result.assignments.colorNode as never;
  material.roughnessNode = result.assignments.roughnessNode as never;
  material.metalnessNode = result.assignments.metalnessNode as never;
  material.specularIntensityNode = result.assignments.specularIntensityNode as never;
  material.specularColorNode = result.assignments.specularColorNode as never;
  material.anisotropyNode = result.assignments.anisotropyNode as never;
  const anisotropyRotation = readNumberLiteral(result.assignments.anisotropyRotation);
  if (anisotropyRotation !== undefined) {
    material.anisotropyRotation = anisotropyRotation;
  }
  material.clearcoatNode = result.assignments.clearcoatNode as never;
  material.clearcoatRoughnessNode = result.assignments.clearcoatRoughnessNode as never;
  material.clearcoatNormalNode = result.assignments.clearcoatNormalNode as never;
  material.sheenNode = result.assignments.sheenNode as never;
  material.sheenRoughnessNode = result.assignments.sheenRoughnessNode as never;
  material.normalNode = result.assignments.normalNode as never;
  material.emissiveNode = result.assignments.emissiveNode as never;
  material.opacityNode = opacityAssignment as never;
  material.transparent = hasTransmission ? true : hasFractionalOpacity;
  material.transmissionNode = transmissionAssignment as never;
  if (hasTransmission) {
    // Keep the non-node scalar enabled so Three routes the material through
    // its transmission render path in both WebGL and WebGPU backends.
    material.transmission = typeof transmissionAssignment === 'number' ? transmissionAssignment : 1;
    material.opacity = 1;
  } else if (typeof opacityAssignment === 'number') {
    material.opacity = opacityAssignment;
  }
  material.attenuationColorNode = result.assignments.attenuationColorNode as never;
  material.attenuationDistanceNode = result.assignments.attenuationDistanceNode as never;
  material.iorNode = result.assignments.iorNode as never;
  material.iridescenceNode = result.assignments.iridescenceNode as never;
  material.iridescenceIORNode = result.assignments.iridescenceIORNode as never;
  material.iridescenceThicknessNode = result.assignments.iridescenceThicknessNode as never;

  return { material, result };
};

export type { MaterialSlotAssignments };
