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
  mx_rotate2d,
  mx_rotate3d,
  mx_ramplr,
  mx_ramptb,
  mx_rgbtohsv,
  mx_safepower,
  mx_splitlr,
  mx_splittb,
  mx_unifiednoise2d,
  mx_unifiednoise3d,
  mx_timer,
  mx_frame,
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
import { buildGltfPbrSurfaceAssignments } from './mapping/gltf-pbr.js';
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

interface MatrixValue {
  kind: 'matrix33' | 'matrix44';
  values: unknown[][];
}

const isMatrixValue = (value: unknown): value is MatrixValue => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const matrix = value as Partial<MatrixValue>;
  return (matrix.kind === 'matrix33' || matrix.kind === 'matrix44') && Array.isArray(matrix.values);
};

const parseMatrixEntries = (value: string | undefined, expectedCount: number): number[] | undefined => {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  if (entries.length !== expectedCount) {
    return undefined;
  }
  return entries;
};

const matrixFromEntries = (kind: 'matrix33' | 'matrix44', entries: number[]): MatrixValue => {
  const size = kind === 'matrix33' ? 3 : 4;
  const values: unknown[][] = [];
  for (let row = 0; row < size; row += 1) {
    values.push(entries.slice(row * size, (row + 1) * size));
  }
  return { kind, values };
};

const matrixIdentity = (kind: 'matrix33' | 'matrix44'): MatrixValue => {
  const size = kind === 'matrix33' ? 3 : 4;
  const values: unknown[][] = [];
  for (let row = 0; row < size; row += 1) {
    const rowValues: unknown[] = [];
    for (let column = 0; column < size; column += 1) {
      rowValues.push(row === column ? 1 : 0);
    }
    values.push(rowValues);
  }
  return { kind, values };
};

const toNodeValue = (value: unknown, typeHint?: string): unknown => {
  if (isMatrixValue(value)) {
    return value;
  }
  if (typeof value === 'number') {
    return float(value);
  }
  if (typeof value === 'boolean') {
    return float(value ? 1 : 0);
  }
  if (Array.isArray(value)) {
    if (typeHint === 'matrix33' && value.length === 9) {
      const entries = value.map((entry) => (typeof entry === 'number' ? entry : Number(entry)));
      if (entries.every((entry) => Number.isFinite(entry))) {
        return matrixFromEntries('matrix33', entries as number[]);
      }
    }
    if (typeHint === 'matrix44' && value.length === 16) {
      const entries = value.map((entry) => (typeof entry === 'number' ? entry : Number(entry)));
      if (entries.every((entry) => Number.isFinite(entry))) {
        return matrixFromEntries('matrix44', entries as number[]);
      }
    }
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
    if (typeHint === 'boolean') {
      const normalized = value.trim().toLowerCase();
      return float(normalized === 'true' || normalized === '1' ? 1 : 0);
    }
    if (typeHint === 'matrix33') {
      const entries = parseMatrixEntries(value, 9);
      return entries ? matrixFromEntries('matrix33', entries) : matrixIdentity('matrix33');
    }
    if (typeHint === 'matrix44') {
      const entries = parseMatrixEntries(value, 16);
      return entries ? matrixFromEntries('matrix44', entries) : matrixIdentity('matrix44');
    }
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

const toVectorComponents = (value: unknown, size: number, fallback: number[]): unknown[] => {
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let index = 0; index < size; index += 1) {
      result.push(value[index] ?? fallback[index] ?? 0);
    }
    return result;
  }
  const result: unknown[] = [];
  for (let index = 0; index < size; index += 1) {
    result.push(getNodeChannel(value, index) ?? fallback[index] ?? 0);
  }
  return result;
};

const asMatrixValue = (value: unknown, kind: 'matrix33' | 'matrix44'): MatrixValue => {
  if (isMatrixValue(value) && value.kind === kind) {
    return value;
  }
  return matrixIdentity(kind);
};

const makeVectorFromComponents = (components: unknown[], size: 2 | 3 | 4): unknown => {
  if (size === 2) {
    return vec2(components[0] as never, components[1] as never);
  }
  if (size === 3) {
    return vec3(components[0] as never, components[1] as never, components[2] as never);
  }
  return vec4(components[0] as never, components[1] as never, components[2] as never, components[3] as never);
};

const dotRow = (row: unknown[], vector: unknown[]): unknown => {
  let sum = mul(row[0] as never, vector[0] as never);
  for (let index = 1; index < row.length; index += 1) {
    sum = add(sum as never, mul(row[index] as never, vector[index] as never) as never);
  }
  return sum;
};

const multiplyMatrixVector = (matrix: MatrixValue, vector: unknown[]): unknown[] => matrix.values.map((row) => dotRow(row, vector));

const transposeMatrix = (matrix: MatrixValue): MatrixValue => {
  const size = matrix.kind === 'matrix33' ? 3 : 4;
  const values: unknown[][] = [];
  for (let row = 0; row < size; row += 1) {
    const transposedRow: unknown[] = [];
    for (let column = 0; column < size; column += 1) {
      transposedRow.push(matrix.values[column]?.[row] ?? 0);
    }
    values.push(transposedRow);
  }
  return {
    kind: matrix.kind,
    values,
  };
};

const det2 = (a: unknown, b: unknown, c: unknown, d: unknown): unknown =>
  sub(mul(a as never, d as never) as never, mul(b as never, c as never) as never);

const det3 = (matrix: unknown[][]): unknown => {
  const a = matrix[0]?.[0] ?? 0;
  const b = matrix[0]?.[1] ?? 0;
  const c = matrix[0]?.[2] ?? 0;
  const d = matrix[1]?.[0] ?? 0;
  const e = matrix[1]?.[1] ?? 0;
  const f = matrix[1]?.[2] ?? 0;
  const g = matrix[2]?.[0] ?? 0;
  const h = matrix[2]?.[1] ?? 0;
  const i = matrix[2]?.[2] ?? 0;

  const eiMinusFh = det2(e, f, h, i);
  const diMinusFg = det2(d, f, g, i);
  const dhMinusEg = det2(d, e, g, h);

  return add(
    sub(mul(a as never, eiMinusFh as never) as never, mul(b as never, diMinusFg as never) as never) as never,
    mul(c as never, dhMinusEg as never) as never
  );
};

const det4 = (matrix: unknown[][]): unknown => {
  const m00 = matrix[0]?.[0] ?? 0;
  const m01 = matrix[0]?.[1] ?? 0;
  const m02 = matrix[0]?.[2] ?? 0;
  const m03 = matrix[0]?.[3] ?? 0;
  const minor0 = det3([
    [matrix[1]?.[1] ?? 0, matrix[1]?.[2] ?? 0, matrix[1]?.[3] ?? 0],
    [matrix[2]?.[1] ?? 0, matrix[2]?.[2] ?? 0, matrix[2]?.[3] ?? 0],
    [matrix[3]?.[1] ?? 0, matrix[3]?.[2] ?? 0, matrix[3]?.[3] ?? 0],
  ]);
  const minor1 = det3([
    [matrix[1]?.[0] ?? 0, matrix[1]?.[2] ?? 0, matrix[1]?.[3] ?? 0],
    [matrix[2]?.[0] ?? 0, matrix[2]?.[2] ?? 0, matrix[2]?.[3] ?? 0],
    [matrix[3]?.[0] ?? 0, matrix[3]?.[2] ?? 0, matrix[3]?.[3] ?? 0],
  ]);
  const minor2 = det3([
    [matrix[1]?.[0] ?? 0, matrix[1]?.[1] ?? 0, matrix[1]?.[3] ?? 0],
    [matrix[2]?.[0] ?? 0, matrix[2]?.[1] ?? 0, matrix[2]?.[3] ?? 0],
    [matrix[3]?.[0] ?? 0, matrix[3]?.[1] ?? 0, matrix[3]?.[3] ?? 0],
  ]);
  const minor3 = det3([
    [matrix[1]?.[0] ?? 0, matrix[1]?.[1] ?? 0, matrix[1]?.[2] ?? 0],
    [matrix[2]?.[0] ?? 0, matrix[2]?.[1] ?? 0, matrix[2]?.[2] ?? 0],
    [matrix[3]?.[0] ?? 0, matrix[3]?.[1] ?? 0, matrix[3]?.[2] ?? 0],
  ]);

  const term0 = mul(m00 as never, minor0 as never);
  const term1 = mul(m01 as never, minor1 as never);
  const term2 = mul(m02 as never, minor2 as never);
  const term3 = mul(m03 as never, minor3 as never);
  return sub(add(sub(term0 as never, term1 as never) as never, term2 as never) as never, term3 as never);
};

const applyMatrixTransform = (
  inputValue: unknown,
  matrixValue: unknown,
  variant: 'vector2M3' | 'vector3' | 'vector3M4' | 'vector4'
): unknown => {
  if (variant === 'vector2M3') {
    const matrix = asMatrixValue(matrixValue, 'matrix33');
    const [x, y] = toVectorComponents(inputValue, 2, [0, 0]);
    const transformed = multiplyMatrixVector(matrix, [x, y, 1]);
    return makeVectorFromComponents(transformed.slice(0, 2), 2);
  }
  if (variant === 'vector3') {
    const matrix = asMatrixValue(matrixValue, 'matrix33');
    const vector = toVectorComponents(inputValue, 3, [0, 0, 0]);
    const transformed = multiplyMatrixVector(matrix, vector);
    return makeVectorFromComponents(transformed, 3);
  }
  if (variant === 'vector3M4') {
    const matrix = asMatrixValue(matrixValue, 'matrix44');
    const [x, y, z] = toVectorComponents(inputValue, 3, [0, 0, 0]);
    const transformed = multiplyMatrixVector(matrix, [x, y, z, 1]);
    return makeVectorFromComponents(transformed.slice(0, 3), 3);
  }
  const matrix = asMatrixValue(matrixValue, 'matrix44');
  const vector = toVectorComponents(inputValue, 4, [0, 0, 0, 1]);
  const transformed = multiplyMatrixVector(matrix, vector);
  return makeVectorFromComponents(transformed, 4);
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

const compileGltfTextureSample = (node: MaterialXNode, context: CompileContext, scopeGraph?: MaterialXNodeGraph): unknown => {
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
    offset as never
  );

  const textureResolver = context.options.textureResolver ?? createTextureResolver({ basePath: context.options.basePath });
  const tex = textureResolver.resolve(uri, { document: context.document, node });
  return texture(tex, transformedUv as never);
};

const compileGltfImageNode = (
  node: MaterialXNode,
  context: CompileContext,
  scopeGraph: MaterialXNodeGraph | undefined
): unknown => {
  const sampled = compileGltfTextureSample(node, context, scopeGraph);
  const colorCorrected = applyTextureColorSpace(context.document.attributes.colorspace, sampled);
  const sampledValue = selectTextureSample(colorCorrected, node.type);
  const factorInput = readInput(node, 'factor');
  const factor = factorInput ? resolveInputNode(node, 'factor', 1, context, scopeGraph) : undefined;
  if (factor !== undefined) {
    return mul(sampledValue as never, factor as never);
  }
  return sampledValue;
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
    case 'gltf_image':
      compiled = compileGltfImageNode(node, context, scopeGraph);
      break;
    case 'gltf_colorimage': {
      const sampled = compileGltfTextureSample(node, context, scopeGraph);
      const colorCorrected = applyTextureColorSpace(context.document.attributes.colorspace, sampled);
      const colorFactor = resolveInputNode(node, 'color', vec4(1, 1, 1, 1), context, scopeGraph);
      const geomColor = resolveInputNode(node, 'geomcolor', vec4(1, 1, 1, 1), context, scopeGraph);
      const modulated = mul(mul(colorCorrected as never, colorFactor as never) as never, geomColor as never);
      if (outputName === 'outa') {
        compiled = (modulated as { a?: unknown }).a ?? modulated;
      } else {
        compiled = (modulated as { rgb?: unknown }).rgb ?? modulated;
      }
      break;
    }
    case 'gltf_normalmap': {
      const normalSample = compileGltfImageNode(node, context, scopeGraph);
      compiled = normalMap(normalSample as never, float(1));
      break;
    }
    case 'gltf_iridescence_thickness': {
      const sampled = compileGltfTextureSample(node, context, scopeGraph);
      const sampledThickness = (sampled as { x?: unknown }).x ?? sampled;
      const thicknessMin = resolveInputNode(node, 'thicknessMin', 100, context, scopeGraph);
      const thicknessMax = resolveInputNode(node, 'thicknessMax', 400, context, scopeGraph);
      compiled = add(thicknessMin as never, mul(sampledThickness as never, sub(thicknessMax as never, thicknessMin as never) as never));
      break;
    }
    case 'gltf_anisotropy_image': {
      const sampled = compileGltfTextureSample(node, context, scopeGraph);
      const anisotropyStrength = resolveInputNode(node, 'anisotropy_strength', 1, context, scopeGraph);
      const anisotropyRotation = resolveInputNode(node, 'anisotropy_rotation', 0, context, scopeGraph);
      if (outputName === 'anisotropy_rotation_out') {
        compiled = anisotropyRotation;
      } else {
        const strengthChannel = (sampled as { z?: unknown }).z ?? sampled;
        compiled = mul(strengthChannel as never, anisotropyStrength as never);
      }
      break;
    }
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
    case 'tangent':
      compiled = vec3(1, 0, 0);
      break;
    case 'viewdirection':
      compiled = normalize(mul(positionWorld as never, float(-1)) as never);
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
    case 'bump': {
      const height = resolveInputNode(node, 'height', 0, context, scopeGraph);
      const scaleNode = resolveInputNode(node, 'scale', 1, context, scopeGraph);
      const normalFromHeight = mx_heighttonormal(height as never, float(1));
      compiled = normalMap(normalFromHeight as never, scaleNode as never);
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
    case 'and': {
      const in1 = resolveInputNode(node, 'in1', 0, context, scopeGraph);
      const in2 = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      compiled = clamp(mul(in1 as never, in2 as never) as never, float(0), float(1));
      break;
    }
    case 'or': {
      const in1 = resolveInputNode(node, 'in1', 0, context, scopeGraph);
      const in2 = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      compiled = clamp(add(in1 as never, in2 as never) as never, float(0), float(1));
      break;
    }
    case 'xor': {
      const in1 = resolveInputNode(node, 'in1', 0, context, scopeGraph);
      const in2 = resolveInputNode(node, 'in2', 0, context, scopeGraph);
      compiled = abs(sub(in1 as never, in2 as never) as never);
      break;
    }
    case 'minus': {
      const fg = resolveInputNode(node, 'fg', 0, context, scopeGraph);
      const bg = resolveInputNode(node, 'bg', 0, context, scopeGraph);
      const mixAmount = resolveInputNode(node, 'mix', 1, context, scopeGraph);
      const minusOut = sub(bg as never, fg as never);
      compiled = add(mul(mixAmount as never, minusOut as never) as never, mul(sub(float(1), mixAmount as never) as never, bg as never) as never);
      break;
    }
    case 'difference': {
      const fg = resolveInputNode(node, 'fg', 0, context, scopeGraph);
      const bg = resolveInputNode(node, 'bg', 0, context, scopeGraph);
      const mixAmount = resolveInputNode(node, 'mix', 1, context, scopeGraph);
      const differenceOut = abs(sub(bg as never, fg as never) as never);
      compiled = add(
        mul(mixAmount as never, differenceOut as never) as never,
        mul(sub(float(1), mixAmount as never) as never, bg as never) as never
      );
      break;
    }
    case 'burn': {
      const fg = resolveInputNode(node, 'fg', 0, context, scopeGraph);
      const bg = resolveInputNode(node, 'bg', 0, context, scopeGraph);
      const mixAmount = resolveInputNode(node, 'mix', 1, context, scopeGraph);
      const epsilon = float(1e-6);
      const safeFg = max(fg as never, epsilon);
      const burned = sub(float(1), div(sub(float(1), bg as never) as never, safeFg as never));
      compiled = add(mul(mixAmount as never, burned as never) as never, mul(sub(float(1), mixAmount as never) as never, bg as never) as never);
      break;
    }
    case 'dodge': {
      const fg = resolveInputNode(node, 'fg', 0, context, scopeGraph);
      const bg = resolveInputNode(node, 'bg', 0, context, scopeGraph);
      const mixAmount = resolveInputNode(node, 'mix', 1, context, scopeGraph);
      const epsilon = float(1e-6);
      const safeDivisor = max(sub(float(1), fg as never) as never, epsilon);
      const dodged = div(bg as never, safeDivisor as never);
      compiled = add(mul(mixAmount as never, dodged as never) as never, mul(sub(float(1), mixAmount as never) as never, bg as never) as never);
      break;
    }
    case 'unpremult': {
      const inNode = resolveInputNode(node, 'in', vec4(0, 0, 0, 1), context, scopeGraph);
      const alpha = getNodeChannel(inNode, 3);
      const epsilon = float(1e-6);
      const safeAlpha = max(alpha as never, epsilon);
      const rgb = makeVectorFromComponents(
        [
          div(getNodeChannel(inNode, 0) as never, safeAlpha as never),
          div(getNodeChannel(inNode, 1) as never, safeAlpha as never),
          div(getNodeChannel(inNode, 2) as never, safeAlpha as never),
        ],
        3
      );
      compiled = vec4(getNodeChannel(rgb, 0) as never, getNodeChannel(rgb, 1) as never, getNodeChannel(rgb, 2) as never, alpha as never);
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
    case 'circle': {
      const texcoord = resolveInputNode(node, 'texcoord', uv(0), context, scopeGraph);
      const center = resolveInputNode(node, 'center', vec2(0.5, 0.5), context, scopeGraph);
      const radius = resolveInputNode(node, 'radius', 0.5, context, scopeGraph);
      const delta = sub(texcoord as never, center as never);
      const distanceSquared = dot(delta as never, delta as never);
      const radiusSquared = mul(radius as never, radius as never);
      compiled = mx_ifgreater(distanceSquared as never, radiusSquared as never, float(0) as never, float(1) as never);
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
      compiled = mx_ifequal(doClamp as never, float(1) as never, clamped as never, scaled as never);
      break;
    }
    case 'open_pbr_anisotropy': {
      const roughness = resolveInputNode(node, 'roughness', 0, context, scopeGraph);
      const anisotropy = resolveInputNode(node, 'anisotropy', 0, context, scopeGraph);
      const anisoInvert = sub(float(1), anisotropy as never);
      const anisoInvertSq = mul(anisoInvert as never, anisoInvert as never);
      const denom = add(anisoInvertSq as never, float(1));
      const fraction = div(float(2), denom as never);
      const sqrtFraction = sqrt(fraction as never);
      const roughSq = mul(roughness as never, roughness as never);
      const alphaX = mul(roughSq as never, sqrtFraction as never);
      const alphaY = mul(anisoInvert as never, alphaX as never);
      compiled = vec2(alphaX as never, alphaY as never);
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
    case 'creatematrix': {
      const nodeDefName = node.attributes.nodedef;
      if (node.type === 'matrix33') {
        const in1 = toVectorComponents(resolveInputNode(node, 'in1', vec3(1, 0, 0), context, scopeGraph), 3, [1, 0, 0]);
        const in2 = toVectorComponents(resolveInputNode(node, 'in2', vec3(0, 1, 0), context, scopeGraph), 3, [0, 1, 0]);
        const in3 = toVectorComponents(resolveInputNode(node, 'in3', vec3(0, 0, 1), context, scopeGraph), 3, [0, 0, 1]);
        compiled = {
          kind: 'matrix33',
          values: [in1, in2, in3],
        } satisfies MatrixValue;
      } else if (nodeDefName === 'ND_creatematrix_vector3_matrix44') {
        const in1 = toVectorComponents(resolveInputNode(node, 'in1', vec3(1, 0, 0), context, scopeGraph), 3, [1, 0, 0]);
        const in2 = toVectorComponents(resolveInputNode(node, 'in2', vec3(0, 1, 0), context, scopeGraph), 3, [0, 1, 0]);
        const in3 = toVectorComponents(resolveInputNode(node, 'in3', vec3(0, 0, 1), context, scopeGraph), 3, [0, 0, 1]);
        const in4 = toVectorComponents(resolveInputNode(node, 'in4', vec3(0, 0, 0), context, scopeGraph), 3, [0, 0, 0]);
        compiled = {
          kind: 'matrix44',
          values: [
            [in1[0], in1[1], in1[2], 0],
            [in2[0], in2[1], in2[2], 0],
            [in3[0], in3[1], in3[2], 0],
            [in4[0], in4[1], in4[2], 1],
          ],
        } satisfies MatrixValue;
      } else {
        const in1 = toVectorComponents(resolveInputNode(node, 'in1', vec4(1, 0, 0, 0), context, scopeGraph), 4, [1, 0, 0, 0]);
        const in2 = toVectorComponents(resolveInputNode(node, 'in2', vec4(0, 1, 0, 0), context, scopeGraph), 4, [0, 1, 0, 0]);
        const in3 = toVectorComponents(resolveInputNode(node, 'in3', vec4(0, 0, 1, 0), context, scopeGraph), 4, [0, 0, 1, 0]);
        const in4 = toVectorComponents(resolveInputNode(node, 'in4', vec4(0, 0, 0, 1), context, scopeGraph), 4, [0, 0, 0, 1]);
        compiled = {
          kind: 'matrix44',
          values: [in1, in2, in3, in4],
        } satisfies MatrixValue;
      }
      break;
    }
    case 'transpose': {
      const inMatrix = resolveInputNode(node, 'in', matrixIdentity(node.type === 'matrix33' ? 'matrix33' : 'matrix44'), context, scopeGraph);
      const matrix = asMatrixValue(inMatrix, node.type === 'matrix33' ? 'matrix33' : 'matrix44');
      compiled = transposeMatrix(matrix);
      break;
    }
    case 'determinant': {
      const nodeDefName = node.attributes.nodedef;
      const inMatrix = resolveInputNode(
        node,
        'in',
        matrixIdentity(nodeDefName?.includes('matrix33') ? 'matrix33' : 'matrix44'),
        context,
        scopeGraph
      );
      const matrix = asMatrixValue(inMatrix, nodeDefName?.includes('matrix33') ? 'matrix33' : 'matrix44');
      compiled = matrix.kind === 'matrix33' ? det3(matrix.values) : det4(matrix.values);
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
    case 'transformmatrix': {
      const nodeDefName = node.attributes.nodedef;
      const inNode = resolveInputNode(node, 'in', 0, context, scopeGraph);
      const matrixFallback =
        nodeDefName === 'ND_transformmatrix_vector2M3' || nodeDefName === 'ND_transformmatrix_vector3'
          ? matrixIdentity('matrix33')
          : matrixIdentity('matrix44');
      const matrixNode = resolveInputNode(node, 'mat', matrixFallback, context, scopeGraph);
      if (nodeDefName === 'ND_transformmatrix_vector2M3') {
        compiled = applyMatrixTransform(inNode, matrixNode, 'vector2M3');
      } else if (nodeDefName === 'ND_transformmatrix_vector3') {
        compiled = applyMatrixTransform(inNode, matrixNode, 'vector3');
      } else if (nodeDefName === 'ND_transformmatrix_vector3M4') {
        compiled = applyMatrixTransform(inNode, matrixNode, 'vector3M4');
      } else {
        compiled = applyMatrixTransform(inNode, matrixNode, 'vector4');
      }
      break;
    }
    case 'transformpoint':
    case 'transformvector':
    case 'transformnormal': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      compiled = inNode;
      break;
    }
    case 'rotate2d': {
      const inNode = resolveInputNode(node, 'in', vec2(0, 0), context, scopeGraph);
      const amount = resolveInputNode(node, 'amount', 0, context, scopeGraph);
      const pivot = resolveInputNode(node, 'pivot', vec2(0.5, 0.5), context, scopeGraph);
      // three/tsl rotate2d is origin-based, so offset by pivot for MaterialX parity.
      const centered = sub(inNode as never, pivot as never);
      compiled = add(mx_rotate2d(centered as never, amount as never) as never, pivot as never);
      break;
    }
    case 'rotate3d': {
      const inNode = resolveInputNode(node, 'in', vec3(0, 0, 0), context, scopeGraph);
      const amount = resolveInputNode(node, 'amount', 0, context, scopeGraph);
      const axis = resolveInputNode(node, 'axis', vec3(0, 0, 1), context, scopeGraph);
      compiled = mx_rotate3d(inNode as never, amount as never, axis as never);
      break;
    }
    case 'time':
      compiled = mx_timer();
      break;
    case 'frame':
      compiled = mx_frame();
      break;
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
    case 'colorcorrect': {
      const inNode = resolveInputNode(node, 'in', node.type === 'color4' ? vec4(0, 0, 0, 1) : vec3(0, 0, 0), context, scopeGraph);
      const hue = resolveInputNode(node, 'hue', 0, context, scopeGraph);
      const saturation = resolveInputNode(node, 'saturation', 1, context, scopeGraph);
      const gamma = resolveInputNode(node, 'gamma', 1, context, scopeGraph);
      const lift = resolveInputNode(node, 'lift', 0, context, scopeGraph);
      const gain = resolveInputNode(node, 'gain', 1, context, scopeGraph);
      const contrastAmount = resolveInputNode(node, 'contrast', 1, context, scopeGraph);
      const contrastPivot = resolveInputNode(node, 'contrastpivot', 0.5, context, scopeGraph);
      const exposure = resolveInputNode(node, 'exposure', 0, context, scopeGraph);

      const rgbInput =
        node.type === 'color4'
          ? vec3(getNodeChannel(inNode, 0) as never, getNodeChannel(inNode, 1) as never, getNodeChannel(inNode, 2) as never)
          : inNode;
      const hsv = mx_rgbtohsv(rgbInput as never);
      const hueAdjusted = vec3(
        add(getNodeChannel(hsv, 0) as never, hue as never) as never,
        mul(getNodeChannel(hsv, 1) as never, saturation as never) as never,
        getNodeChannel(hsv, 2) as never
      );
      const saturationAdjusted = mx_hsvtorgb(hueAdjusted as never);
      const reciprocalGamma = div(float(1), gamma as never);
      const gammaCorrected = mul(
        pow(abs(saturationAdjusted as never) as never, reciprocalGamma as never) as never,
        sign(saturationAdjusted as never) as never
      );
      const liftApplied = add(mul(gammaCorrected as never, sub(float(1), lift as never) as never) as never, lift as never);
      const gainApplied = mul(liftApplied as never, gain as never);
      const contrastApplied = mx_contrast(gainApplied as never, contrastAmount as never, contrastPivot as never);
      const exposureScale = pow(float(2), exposure as never);
      const colorOut = mul(contrastApplied as never, exposureScale as never);
      compiled =
        node.type === 'color4'
          ? vec4(
              getNodeChannel(colorOut, 0) as never,
              getNodeChannel(colorOut, 1) as never,
              getNodeChannel(colorOut, 2) as never,
              getNodeChannel(inNode, 3) as never
            )
          : colorOut;
      break;
    }
    case 'blackbody': {
      const temperature = resolveInputNode(node, 'temperature', 6500, context, scopeGraph);
      const t = div(float(1000), temperature as never);
      const t2 = mul(t as never, t as never);
      const t3 = mul(t2 as never, t as never);

      const lowX = add(
        add(mul(float(-0.2661239), t3 as never) as never, mul(float(-0.234358), t2 as never) as never) as never,
        add(mul(float(0.8776956), t as never) as never, float(0.17991)) as never
      );
      const highX = add(
        add(mul(float(-3.0258469), t3 as never) as never, mul(float(2.1070379), t2 as never) as never) as never,
        add(mul(float(0.2226347), t as never) as never, float(0.24039)) as never
      );
      const xc = mx_ifgreatereq(temperature as never, float(4000) as never, highX as never, lowX as never);

      const xc2 = mul(xc as never, xc as never);
      const xc3 = mul(xc2 as never, xc as never);
      const ycLow = add(
        add(mul(float(-1.1063814), xc3 as never) as never, mul(float(-1.3481102), xc2 as never) as never) as never,
        add(mul(float(2.18555832), xc as never) as never, float(-0.20219683)) as never
      );
      const ycMid = add(
        add(mul(float(-0.9549476), xc3 as never) as never, mul(float(-1.37418593), xc2 as never) as never) as never,
        add(mul(float(2.09137015), xc as never) as never, float(-0.16748867)) as never
      );
      const ycHigh = add(
        add(mul(float(3.081758), xc3 as never) as never, mul(float(-5.8733867), xc2 as never) as never) as never,
        add(mul(float(3.75112997), xc as never) as never, float(-0.37001483)) as never
      );
      const ycLowMid = mx_ifgreatereq(temperature as never, float(2222) as never, ycMid as never, ycLow as never);
      const yc = mx_ifgreatereq(temperature as never, float(4000) as never, ycHigh as never, ycLowMid as never);
      const safeYc = max(yc as never, float(1e-6));

      const x = div(xc as never, safeYc as never);
      const y = float(1);
      const z = div(sub(sub(float(1), xc as never) as never, yc as never) as never, safeYc as never);
      const xyz = vec3(x as never, y as never, z as never);
      const rgb = vec3(
        add(add(mul(float(3.2406), getNodeChannel(xyz, 0) as never) as never, mul(float(-0.9689), getNodeChannel(xyz, 1) as never) as never) as never, mul(float(0.0557), getNodeChannel(xyz, 2) as never) as never) as never,
        add(add(mul(float(-1.5372), getNodeChannel(xyz, 0) as never) as never, mul(float(1.8758), getNodeChannel(xyz, 1) as never) as never) as never, mul(float(-0.204), getNodeChannel(xyz, 2) as never) as never) as never,
        add(add(mul(float(-0.4986), getNodeChannel(xyz, 0) as never) as never, mul(float(0.0415), getNodeChannel(xyz, 1) as never) as never) as never, mul(float(1.057), getNodeChannel(xyz, 2) as never) as never) as never
      );
      compiled = max(rgb as never, vec3(0, 0, 0) as never);
      break;
    }
    case 'artistic_ior': {
      const reflectivity = resolveInputNode(node, 'reflectivity', vec3(0.8, 0.8, 0.8), context, scopeGraph);
      const edgeColor = resolveInputNode(node, 'edge_color', vec3(1, 1, 1), context, scopeGraph);
      const clamped = clamp(reflectivity as never, vec3(0, 0, 0) as never, vec3(0.99, 0.99, 0.99) as never);
      const rSqrt = sqrt(clamped as never);
      const nMin = div(sub(float(1), clamped as never) as never, add(float(1), clamped as never) as never);
      const nMax = div(add(float(1), rSqrt as never) as never, sub(float(1), rSqrt as never) as never);
      const ior = mix(nMax as never, nMin as never, edgeColor as never);
      const np1 = add(ior as never, float(1));
      const nm1 = sub(ior as never, float(1));
      const k2Numerator = sub(mul(mul(np1 as never, np1 as never) as never, clamped as never) as never, mul(nm1 as never, nm1 as never) as never);
      const k2 = max(div(k2Numerator as never, sub(float(1), clamped as never) as never) as never, vec3(0, 0, 0) as never);
      const extinction = sqrt(k2 as never);
      compiled = outputName === 'extinction' ? extinction : ior;
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

const warnGltfPbrLimitations = (surfaceNode: MaterialXNode, context: CompileContext): void => {
  const unsupportedInputs = ['occlusion', 'tangent', 'dispersion', 'thickness'];
  const activeUnsupportedInputs = unsupportedInputs.filter((name) => {
    const input = readInput(surfaceNode, name);
    if (!input) {
      return false;
    }
    return input.value !== undefined || input.attributes.value !== undefined || input.attributes.nodename || input.attributes.nodegraph;
  });

  if (activeUnsupportedInputs.length === 0) {
    return;
  }

  warn(context, {
    code: 'unsupported-node',
    nodeName: surfaceNode.name,
    message: `glTF PBR inputs currently map to core MeshPhysical slots only; these inputs are ignored (${activeUnsupportedInputs.join(', ')})`,
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
  if (!surfaceShader || !['standard_surface', 'open_pbr_surface', 'gltf_pbr'].includes(surfaceShader.node.category)) {
    warnings.push({
      code: 'unsupported-node',
      message: 'Only standard_surface, open_pbr_surface, and gltf_pbr are supported for surfacematerial compilation',
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
      : surfaceShader.node.category === 'open_pbr_surface'
        ? buildOpenPbrSurfaceAssignments(surfaceShader.node, { getInputNode })
        : buildGltfPbrSurfaceAssignments(surfaceShader.node, { getInputNode });

  if (surfaceShader.node.category === 'open_pbr_surface') {
    warnOpenPbrLimitations(surfaceShader.node, context);
  }
  if (surfaceShader.node.category === 'gltf_pbr') {
    warnGltfPbrLimitations(surfaceShader.node, context);
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
