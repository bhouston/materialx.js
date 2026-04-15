import type { MaterialXNode, MaterialXNodeGraph } from '@materialx-js/materialx';
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
  float,
  floor,
  fract,
  length,
  log,
  luminance,
  max,
  min,
  mix,
  mod,
  mul,
  mx_cell_noise_float,
  mx_contrast,
  mx_frame,
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
  mx_rotate2d,
  mx_rotate3d,
  mx_safepower,
  mx_splitlr,
  mx_splittb,
  mx_timer,
  mx_unifiednoise2d,
  mx_unifiednoise3d,
  mx_worley_noise_float,
  normalMap,
  normalWorld,
  normalize,
  positionWorld,
  pow,
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
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { applyTextureColorSpace } from '../runtime/colorspace.js';
import { parseFloatValue } from '../runtime/value-parsing.js';
import { compileBinaryMath } from './binary-math.js';
import type { CompileContext, MatrixValue, NodeHandler } from './internal-types.js';
import { readInput } from './inputs.js';
import {
  applyMatrixTransform,
  det3,
  det4,
  getNodeChannel,
  makeVectorFromComponents,
  outputNameToChannelIndex,
  toVectorComponents,
  transposeMatrix,
} from './matrix-ops.js';
import { asMatrixValue, matrixIdentity } from './value-coercion.js';

export type ResolveInputNodeFn = (
  node: MaterialXNode,
  inputName: string,
  fallback: unknown,
  context: CompileContext,
  scopeGraph?: MaterialXNodeGraph
) => unknown;

export interface NodeHandlerDeps {
  resolveInputNode: ResolveInputNodeFn;
  compileTextureNode: (node: MaterialXNode, context: CompileContext, scopeGraph?: MaterialXNodeGraph) => unknown;
  compileGltfTextureSample: (node: MaterialXNode, context: CompileContext, scopeGraph?: MaterialXNodeGraph) => unknown;
  compileGltfImageNode: (node: MaterialXNode, context: CompileContext, scopeGraph?: MaterialXNodeGraph) => unknown;
  compileHexTiledTextureNode: (node: MaterialXNode, context: CompileContext, scopeGraph?: MaterialXNodeGraph) => unknown;
}

const register = (map: Map<string, NodeHandler>, keys: readonly string[], handler: NodeHandler): void => {
  for (const key of keys) {
    map.set(key, handler);
  }
};

const bin =
  (
    deps: NodeHandlerDeps,
    left: string,
    right: string,
    op: (a: unknown, b: unknown) => unknown
  ): NodeHandler =>
  (node, context, scopeGraph) =>
    compileBinaryMath(deps.resolveInputNode, node, left, right, context, scopeGraph, op);

export const buildNodeHandlerRegistry = (deps: NodeHandlerDeps): Map<string, NodeHandler> => {
  const { resolveInputNode, compileTextureNode, compileGltfTextureSample, compileGltfImageNode, compileHexTiledTextureNode } = deps;
  const r = resolveInputNode;
  const map = new Map<string, NodeHandler>();

  map.set('constant', (node, context, scopeGraph) => r(node, 'value', node.attributes.value ?? 0, context, scopeGraph));

  register(map, ['image', 'tiledimage'], (node, context, scopeGraph) => compileTextureNode(node, context, scopeGraph));

  map.set('gltf_image', (node, context, scopeGraph) => compileGltfImageNode(node, context, scopeGraph));

  map.set('gltf_colorimage', (node, context, scopeGraph, outputName) => {
    const sampled = compileGltfTextureSample(node, context, scopeGraph);
    const colorCorrected = applyTextureColorSpace(context.document.attributes.colorspace, sampled);
    const colorFactor = r(node, 'color', vec4(1, 1, 1, 1), context, scopeGraph);
    const geomColor = r(node, 'geomcolor', vec4(1, 1, 1, 1), context, scopeGraph);
    const modulated = mul(mul(colorCorrected as never, colorFactor as never) as never, geomColor as never);
    if (outputName === 'outa') {
      return (modulated as { a?: unknown }).a ?? modulated;
    }
    return (modulated as { rgb?: unknown }).rgb ?? modulated;
  });

  map.set('gltf_normalmap', (node, context, scopeGraph) => {
    const normalSample = compileGltfImageNode(node, context, scopeGraph);
    return normalMap(normalSample as never, float(1));
  });

  map.set('gltf_iridescence_thickness', (node, context, scopeGraph) => {
    const sampled = compileGltfTextureSample(node, context, scopeGraph);
    const sampledThickness = (sampled as { x?: unknown }).x ?? sampled;
    const thicknessMin = r(node, 'thicknessMin', 100, context, scopeGraph);
    const thicknessMax = r(node, 'thicknessMax', 400, context, scopeGraph);
    return add(thicknessMin as never, mul(sampledThickness as never, sub(thicknessMax as never, thicknessMin as never) as never));
  });

  map.set('gltf_anisotropy_image', (node, context, scopeGraph, outputName) => {
    const sampled = compileGltfTextureSample(node, context, scopeGraph);
    const anisotropyStrength = r(node, 'anisotropy_strength', 1, context, scopeGraph);
    const anisotropyRotation = r(node, 'anisotropy_rotation', 0, context, scopeGraph);
    if (outputName === 'anisotropy_rotation_out') {
      return anisotropyRotation;
    }
    const strengthChannel = (sampled as { z?: unknown }).z ?? sampled;
    return mul(strengthChannel as never, anisotropyStrength as never);
  });

  map.set('texcoord', (node) => {
    const indexInput = readInput(node, 'index');
    const index = parseFloatValue(indexInput?.value ?? indexInput?.attributes.value, 0);
    return uv(index);
  });

  map.set('position', () => positionWorld);
  map.set('normal', () => normalWorld);
  map.set('tangent', () => vec3(1, 0, 0));
  map.set('viewdirection', () => normalize(mul(positionWorld as never, float(-1)) as never));

  map.set('normalmap', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec3(0.5, 0.5, 1), context, scopeGraph);
    const scaleNode = r(node, 'scale', 1, context, scopeGraph);
    return normalMap(inNode as never, scaleNode as never);
  });

  map.set('heighttonormal', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', 0, context, scopeGraph);
    const scaleNode = r(node, 'scale', 1, context, scopeGraph);
    return mx_heighttonormal(inNode as never, scaleNode as never);
  });

  map.set('bump', (node, context, scopeGraph) => {
    const height = r(node, 'height', 0, context, scopeGraph);
    const scaleNode = r(node, 'scale', 1, context, scopeGraph);
    const normalFromHeight = mx_heighttonormal(height as never, float(1));
    return normalMap(normalFromHeight as never, scaleNode as never);
  });

  map.set('convert', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', 0, context, scopeGraph);
    if (node.type === 'vector2') {
      return vec2(inNode as never);
    }
    if (node.type === 'vector3' || node.type === 'color3') {
      return vec3(inNode as never);
    }
    if (node.type === 'vector4' || node.type === 'color4') {
      return vec4(inNode as never);
    }
    return float(inNode as never);
  });

  map.set('add', bin(deps, 'in1', 'in2', (left, right) => add(left as never, right as never)));
  map.set('subtract', bin(deps, 'in1', 'in2', (left, right) => sub(left as never, right as never)));
  map.set('multiply', bin(deps, 'in1', 'in2', (left, right) => mul(left as never, right as never)));
  map.set('divide', bin(deps, 'in1', 'in2', (left, right) => div(left as never, right as never)));

  map.set('clamp', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', 0, context, scopeGraph);
    const low = r(node, 'low', 0, context, scopeGraph);
    const high = r(node, 'high', 1, context, scopeGraph);
    return clamp(inNode as never, low as never, high as never);
  });

  map.set('min', bin(deps, 'in1', 'in2', (left, right) => min(left as never, right as never)));
  map.set('max', bin(deps, 'in1', 'in2', (left, right) => max(left as never, right as never)));

  map.set('mix', (node, context, scopeGraph) => {
    const fg = r(node, 'fg', 1, context, scopeGraph);
    const bg = r(node, 'bg', 0, context, scopeGraph);
    const mixAmount = r(node, 'mix', 0.5, context, scopeGraph);
    return mix(bg as never, fg as never, mixAmount as never);
  });

  map.set('and', (node, context, scopeGraph) => {
    const in1 = r(node, 'in1', 0, context, scopeGraph);
    const in2 = r(node, 'in2', 0, context, scopeGraph);
    return clamp(mul(in1 as never, in2 as never) as never, float(0), float(1));
  });

  map.set('or', (node, context, scopeGraph) => {
    const in1 = r(node, 'in1', 0, context, scopeGraph);
    const in2 = r(node, 'in2', 0, context, scopeGraph);
    return clamp(add(in1 as never, in2 as never) as never, float(0), float(1));
  });

  map.set('xor', (node, context, scopeGraph) => {
    const in1 = r(node, 'in1', 0, context, scopeGraph);
    const in2 = r(node, 'in2', 0, context, scopeGraph);
    return abs(sub(in1 as never, in2 as never) as never);
  });

  map.set('minus', (node, context, scopeGraph) => {
    const fg = r(node, 'fg', 0, context, scopeGraph);
    const bg = r(node, 'bg', 0, context, scopeGraph);
    const mixAmount = r(node, 'mix', 1, context, scopeGraph);
    const minusOut = sub(bg as never, fg as never);
    return add(mul(mixAmount as never, minusOut as never) as never, mul(sub(float(1), mixAmount as never) as never, bg as never) as never);
  });

  map.set('difference', (node, context, scopeGraph) => {
    const fg = r(node, 'fg', 0, context, scopeGraph);
    const bg = r(node, 'bg', 0, context, scopeGraph);
    const mixAmount = r(node, 'mix', 1, context, scopeGraph);
    const differenceOut = abs(sub(bg as never, fg as never) as never);
    return add(
      mul(mixAmount as never, differenceOut as never) as never,
      mul(sub(float(1), mixAmount as never) as never, bg as never) as never
    );
  });

  map.set('burn', (node, context, scopeGraph) => {
    const fg = r(node, 'fg', 0, context, scopeGraph);
    const bg = r(node, 'bg', 0, context, scopeGraph);
    const mixAmount = r(node, 'mix', 1, context, scopeGraph);
    const epsilon = float(1e-6);
    const safeFg = max(fg as never, epsilon);
    const burned = sub(float(1), div(sub(float(1), bg as never) as never, safeFg as never));
    return add(mul(mixAmount as never, burned as never) as never, mul(sub(float(1), mixAmount as never) as never, bg as never) as never);
  });

  map.set('dodge', (node, context, scopeGraph) => {
    const fg = r(node, 'fg', 0, context, scopeGraph);
    const bg = r(node, 'bg', 0, context, scopeGraph);
    const mixAmount = r(node, 'mix', 1, context, scopeGraph);
    const epsilon = float(1e-6);
    const safeDivisor = max(sub(float(1), fg as never) as never, epsilon);
    const dodged = div(bg as never, safeDivisor as never);
    return add(mul(mixAmount as never, dodged as never) as never, mul(sub(float(1), mixAmount as never) as never, bg as never) as never);
  });

  map.set('unpremult', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec4(0, 0, 0, 1), context, scopeGraph);
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
    return vec4(getNodeChannel(rgb, 0) as never, getNodeChannel(rgb, 1) as never, getNodeChannel(rgb, 2) as never, alpha as never);
  });

  map.set('screen', (node, context, scopeGraph) => {
    const fg = r(node, 'fg', 1, context, scopeGraph);
    const bg = r(node, 'bg', 0, context, scopeGraph);
    const mixAmount = r(node, 'mix', 1, context, scopeGraph);
    const screened = sub(float(1), mul(sub(float(1), fg as never) as never, sub(float(1), bg as never) as never));
    return mix(bg as never, screened as never, mixAmount as never);
  });

  map.set('overlay', (node, context, scopeGraph) => {
    const fg = r(node, 'fg', 1, context, scopeGraph);
    const bg = r(node, 'bg', 0, context, scopeGraph);
    const mixAmount = r(node, 'mix', 1, context, scopeGraph);
    const lowBranch = mul(mul(float(2), fg as never) as never, bg as never);
    const highBranch = sub(
      float(1),
      mul(mul(float(2), sub(float(1), fg as never) as never) as never, sub(float(1), bg as never) as never)
    );
    const overlayed = mix(lowBranch as never, highBranch as never, step(float(0.5), bg as never) as never);
    return mix(bg as never, overlayed as never, mixAmount as never);
  });

  map.set('checkerboard', (node, context, scopeGraph) => {
    const color1 = r(node, 'color1', vec3(1, 1, 1), context, scopeGraph);
    const color2 = r(node, 'color2', vec3(0, 0, 0), context, scopeGraph);
    const texcoord = r(node, 'texcoord', uv(0), context, scopeGraph);
    const uvTiling = r(node, 'uvtiling', vec2(8, 8), context, scopeGraph);
    const uvOffset = r(node, 'uvoffset', vec2(0, 0), context, scopeGraph);
    const transformedUv = add(mul(texcoord as never, uvTiling as never), uvOffset as never);
    const mask = clamp(checker(transformedUv as never) as never, float(0), float(1));
    return mix(color1 as never, color2 as never, mask as never);
  });

  map.set('circle', (node, context, scopeGraph) => {
    const texcoord = r(node, 'texcoord', uv(0), context, scopeGraph);
    const center = r(node, 'center', vec2(0.5, 0.5), context, scopeGraph);
    const radius = r(node, 'radius', 0.5, context, scopeGraph);
    const delta = sub(texcoord as never, center as never);
    const distanceSquared = dot(delta as never, delta as never);
    const radiusSquared = mul(radius as never, radius as never);
    return mx_ifgreater(distanceSquared as never, radiusSquared as never, float(0) as never, float(1) as never);
  });

  register(map, ['dot', 'dotproduct'], bin(deps, 'in1', 'in2', (left, right) => dot(left as never, right as never)));

  map.set('magnitude', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec3(0, 0, 0), context, scopeGraph);
    return length(inNode as never);
  });

  map.set('normalize', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec3(0, 0, 1), context, scopeGraph);
    return normalize(inNode as never);
  });

  map.set('modulo', bin(deps, 'in1', 'in2', (left, right) => mod(left as never, right as never)));

  map.set('absval', (node, context, scopeGraph) => abs(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('sign', (node, context, scopeGraph) => sign(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('floor', (node, context, scopeGraph) => floor(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('ceil', (node, context, scopeGraph) => ceil(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('round', (node, context, scopeGraph) => round(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('sin', (node, context, scopeGraph) => sin(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('cos', (node, context, scopeGraph) => cos(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('tan', (node, context, scopeGraph) => tan(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('asin', (node, context, scopeGraph) => asin(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('acos', (node, context, scopeGraph) => acos(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('sqrt', (node, context, scopeGraph) => sqrt(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('exp', (node, context, scopeGraph) => exp(r(node, 'in', 0, context, scopeGraph) as never));
  map.set('ln', (node, context, scopeGraph) => log(r(node, 'in', 1, context, scopeGraph) as never));
  map.set('fract', (node, context, scopeGraph) => fract(r(node, 'in', 0, context, scopeGraph) as never));

  map.set('atan2', (node, context, scopeGraph) => {
    const inY = r(node, 'iny', 0, context, scopeGraph);
    const inX = r(node, 'inx', 1, context, scopeGraph);
    return atan2(inY as never, inX as never);
  });

  map.set('power', bin(deps, 'in1', 'in2', (left, right) => pow(left as never, right as never)));
  map.set('safepower', bin(deps, 'in1', 'in2', (left, right) => mx_safepower(left as never, right as never)));
  map.set('distance', bin(deps, 'in1', 'in2', (left, right) => distance(left as never, right as never)));
  map.set('crossproduct', bin(deps, 'in1', 'in2', (left, right) => cross(left as never, right as never)));

  map.set('invert', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', 0, context, scopeGraph);
    const amount = r(node, 'amount', 1, context, scopeGraph);
    return sub(amount as never, inNode as never);
  });

  map.set('smoothstep', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', 0, context, scopeGraph);
    const low = r(node, 'low', 0, context, scopeGraph);
    const high = r(node, 'high', 1, context, scopeGraph);
    return smoothstep(low as never, high as never, inNode as never);
  });

  map.set('saturate', (node, context, scopeGraph) => clamp(r(node, 'in', 0, context, scopeGraph) as never, float(0), float(1)));

  map.set('remap', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', 0, context, scopeGraph);
    const inLow = r(node, 'inlow', 0, context, scopeGraph);
    const inHigh = r(node, 'inhigh', 1, context, scopeGraph);
    const outLow = r(node, 'outlow', 0, context, scopeGraph);
    const outHigh = r(node, 'outhigh', 1, context, scopeGraph);
    const rangeIn = sub(inHigh as never, inLow as never);
    const rangeOut = sub(outHigh as never, outLow as never);
    const normalized = div(sub(inNode as never, inLow as never), rangeIn as never);
    return add(outLow as never, mul(normalized as never, rangeOut as never));
  });

  map.set('range', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', 0, context, scopeGraph);
    const inLow = r(node, 'inlow', 0, context, scopeGraph);
    const inHigh = r(node, 'inhigh', 1, context, scopeGraph);
    const gamma = r(node, 'gamma', 1, context, scopeGraph);
    const outLow = r(node, 'outlow', 0, context, scopeGraph);
    const outHigh = r(node, 'outhigh', 1, context, scopeGraph);
    const doClamp = r(node, 'doclamp', false, context, scopeGraph);
    const remapped = div(sub(inNode as never, inLow as never), sub(inHigh as never, inLow as never));
    const reciprocalGamma = div(float(1), gamma as never);
    const gammaCorrected = mul(pow(abs(remapped as never) as never, reciprocalGamma as never), sign(remapped as never) as never);
    const scaled = add(outLow as never, mul(gammaCorrected as never, sub(outHigh as never, outLow as never) as never));
    const clamped = clamp(scaled as never, outLow as never, outHigh as never);
    return mx_ifequal(doClamp as never, float(1) as never, clamped as never, scaled as never);
  });

  map.set('open_pbr_anisotropy', (node, context, scopeGraph) => {
    const roughness = r(node, 'roughness', 0, context, scopeGraph);
    const anisotropy = r(node, 'anisotropy', 0, context, scopeGraph);
    const anisoInvert = sub(float(1), anisotropy as never);
    const anisoInvertSq = mul(anisoInvert as never, anisoInvert as never);
    const denom = add(anisoInvertSq as never, float(1));
    const fraction = div(float(2), denom as never);
    const sqrtFraction = sqrt(fraction as never);
    const roughSq = mul(roughness as never, roughness as never);
    const alphaX = mul(roughSq as never, sqrtFraction as never);
    const alphaY = mul(anisoInvert as never, alphaX as never);
    return vec2(alphaX as never, alphaY as never);
  });

  map.set('combine2', (node, context, scopeGraph) => {
    const x = r(node, 'in1', 0, context, scopeGraph);
    const y = r(node, 'in2', 0, context, scopeGraph);
    return vec2(x as never, y as never);
  });

  map.set('combine3', (node, context, scopeGraph) => {
    const x = r(node, 'in1', 0, context, scopeGraph);
    const y = r(node, 'in2', 0, context, scopeGraph);
    const z = r(node, 'in3', 0, context, scopeGraph);
    return vec3(x as never, y as never, z as never);
  });

  map.set('combine4', (node, context, scopeGraph) => {
    const x = r(node, 'in1', 0, context, scopeGraph);
    const y = r(node, 'in2', 0, context, scopeGraph);
    const z = r(node, 'in3', 0, context, scopeGraph);
    const w = r(node, 'in4', 1, context, scopeGraph);
    return vec4(x as never, y as never, z as never, w as never);
  });

  map.set('creatematrix', (node, context, scopeGraph) => {
    const nodeDefName = node.attributes.nodedef;
    if (node.type === 'matrix33') {
      const in1 = toVectorComponents(r(node, 'in1', vec3(1, 0, 0), context, scopeGraph), 3, [1, 0, 0]);
      const in2 = toVectorComponents(r(node, 'in2', vec3(0, 1, 0), context, scopeGraph), 3, [0, 1, 0]);
      const in3 = toVectorComponents(r(node, 'in3', vec3(0, 0, 1), context, scopeGraph), 3, [0, 0, 1]);
      return {
        kind: 'matrix33',
        values: [in1, in2, in3],
      } satisfies MatrixValue;
    }
    if (nodeDefName === 'ND_creatematrix_vector3_matrix44') {
      const in1 = toVectorComponents(r(node, 'in1', vec3(1, 0, 0), context, scopeGraph), 3, [1, 0, 0]);
      const in2 = toVectorComponents(r(node, 'in2', vec3(0, 1, 0), context, scopeGraph), 3, [0, 1, 0]);
      const in3 = toVectorComponents(r(node, 'in3', vec3(0, 0, 1), context, scopeGraph), 3, [0, 0, 1]);
      const in4 = toVectorComponents(r(node, 'in4', vec3(0, 0, 0), context, scopeGraph), 3, [0, 0, 0]);
      return {
        kind: 'matrix44',
        values: [
          [in1[0], in1[1], in1[2], 0],
          [in2[0], in2[1], in2[2], 0],
          [in3[0], in3[1], in3[2], 0],
          [in4[0], in4[1], in4[2], 1],
        ],
      } satisfies MatrixValue;
    }
    const in1 = toVectorComponents(r(node, 'in1', vec4(1, 0, 0, 0), context, scopeGraph), 4, [1, 0, 0, 0]);
    const in2 = toVectorComponents(r(node, 'in2', vec4(0, 1, 0, 0), context, scopeGraph), 4, [0, 1, 0, 0]);
    const in3 = toVectorComponents(r(node, 'in3', vec4(0, 0, 1, 0), context, scopeGraph), 4, [0, 0, 1, 0]);
    const in4 = toVectorComponents(r(node, 'in4', vec4(0, 0, 0, 1), context, scopeGraph), 4, [0, 0, 0, 1]);
    return {
      kind: 'matrix44',
      values: [in1, in2, in3, in4],
    } satisfies MatrixValue;
  });

  map.set('transpose', (node, context, scopeGraph) => {
    const inMatrix = r(
      node,
      'in',
      matrixIdentity(node.type === 'matrix33' ? 'matrix33' : 'matrix44'),
      context,
      scopeGraph
    );
    const matrix = asMatrixValue(inMatrix, node.type === 'matrix33' ? 'matrix33' : 'matrix44');
    return transposeMatrix(matrix);
  });

  map.set('determinant', (node, context, scopeGraph) => {
    const nodeDefName = node.attributes.nodedef;
    const inMatrix = r(
      node,
      'in',
      matrixIdentity(nodeDefName?.includes('matrix33') ? 'matrix33' : 'matrix44'),
      context,
      scopeGraph
    );
    const matrix = asMatrixValue(inMatrix, nodeDefName?.includes('matrix33') ? 'matrix33' : 'matrix44');
    return matrix.kind === 'matrix33' ? det3(matrix.values) : det4(matrix.values);
  });

  register(map, ['extract', 'extract3'], (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec4(0, 0, 0, 1), context, scopeGraph);
    const indexInput = readInput(node, 'index');
    const channelIndex = Math.max(0, Math.floor(parseFloatValue(indexInput?.value ?? indexInput?.attributes.value, 0)));
    return getNodeChannel(inNode, channelIndex);
  });

  register(map, ['separate2', 'separate3', 'separate4'], (node, context, scopeGraph, outputName) => {
    const inNode = r(node, 'in', vec4(0, 0, 0, 1), context, scopeGraph);
    const channelIndex = outputNameToChannelIndex(outputName);
    return getNodeChannel(inNode, channelIndex);
  });

  map.set('place2d', (node, context, scopeGraph) => {
    const texcoord = r(node, 'texcoord', uv(0), context, scopeGraph);
    const pivot = r(node, 'pivot', vec2(0.5, 0.5), context, scopeGraph);
    const scaleNode = r(node, 'scale', vec2(1, 1), context, scopeGraph);
    const rotate = r(node, 'rotate', 0, context, scopeGraph);
    const offset = r(node, 'offset', vec2(0, 0), context, scopeGraph);
    return mx_place2d(texcoord as never, pivot as never, scaleNode as never, rotate as never, offset as never);
  });

  map.set('transformmatrix', (node, context, scopeGraph) => {
    const nodeDefName = node.attributes.nodedef;
    const inNode = r(node, 'in', 0, context, scopeGraph);
    const matrixFallback =
      nodeDefName === 'ND_transformmatrix_vector2M3' || nodeDefName === 'ND_transformmatrix_vector3'
        ? matrixIdentity('matrix33')
        : matrixIdentity('matrix44');
    const matrixNode = r(node, 'mat', matrixFallback, context, scopeGraph);
    if (nodeDefName === 'ND_transformmatrix_vector2M3') {
      return applyMatrixTransform(inNode, matrixNode, 'vector2M3');
    }
    if (nodeDefName === 'ND_transformmatrix_vector3') {
      return applyMatrixTransform(inNode, matrixNode, 'vector3');
    }
    if (nodeDefName === 'ND_transformmatrix_vector3M4') {
      return applyMatrixTransform(inNode, matrixNode, 'vector3M4');
    }
    return applyMatrixTransform(inNode, matrixNode, 'vector4');
  });

  register(map, ['transformpoint', 'transformvector', 'transformnormal'], (node, context, scopeGraph) =>
    r(node, 'in', vec3(0, 0, 0), context, scopeGraph)
  );

  map.set('rotate2d', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec2(0, 0), context, scopeGraph);
    const amount = r(node, 'amount', 0, context, scopeGraph);
    const pivot = r(node, 'pivot', vec2(0.5, 0.5), context, scopeGraph);
    const centered = sub(inNode as never, pivot as never);
    return add(mx_rotate2d(centered as never, amount as never) as never, pivot as never);
  });

  map.set('rotate3d', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec3(0, 0, 0), context, scopeGraph);
    const amount = r(node, 'amount', 0, context, scopeGraph);
    const axis = r(node, 'axis', vec3(0, 0, 1), context, scopeGraph);
    return mx_rotate3d(inNode as never, amount as never, axis as never);
  });

  map.set('time', () => mx_timer());
  map.set('frame', () => mx_frame());

  map.set('ramplr', (node, context, scopeGraph) => {
    const valueL = r(node, 'valuel', 0, context, scopeGraph);
    const valueR = r(node, 'valuer', 0, context, scopeGraph);
    const texcoord = r(node, 'texcoord', uv(0), context, scopeGraph);
    return mx_ramplr(valueL as never, valueR as never, texcoord as never);
  });

  map.set('ramptb', (node, context, scopeGraph) => {
    const valueT = r(node, 'valuet', 0, context, scopeGraph);
    const valueB = r(node, 'valueb', 0, context, scopeGraph);
    const texcoord = r(node, 'texcoord', uv(0), context, scopeGraph);
    return mx_ramptb(valueT as never, valueB as never, texcoord as never);
  });

  map.set('splitlr', (node, context, scopeGraph) => {
    const valueL = r(node, 'valuel', 0, context, scopeGraph);
    const valueR = r(node, 'valuer', 0, context, scopeGraph);
    const center = r(node, 'center', 0.5, context, scopeGraph);
    const texcoord = r(node, 'texcoord', uv(0), context, scopeGraph);
    return mx_splitlr(valueL as never, valueR as never, center as never, texcoord as never);
  });

  map.set('splittb', (node, context, scopeGraph) => {
    const valueT = r(node, 'valuet', 0, context, scopeGraph);
    const valueB = r(node, 'valueb', 0, context, scopeGraph);
    const center = r(node, 'center', 0.5, context, scopeGraph);
    const texcoord = r(node, 'texcoord', uv(0), context, scopeGraph);
    return mx_splittb(valueT as never, valueB as never, center as never, texcoord as never);
  });

  map.set('ifgreater', (node, context, scopeGraph) => {
    const value1 = r(node, 'value1', 0, context, scopeGraph);
    const value2 = r(node, 'value2', 0, context, scopeGraph);
    const in1 = r(node, 'in1', 1, context, scopeGraph);
    const in2 = r(node, 'in2', 0, context, scopeGraph);
    return mx_ifgreater(value1 as never, value2 as never, in1 as never, in2 as never);
  });

  map.set('ifgreatereq', (node, context, scopeGraph) => {
    const value1 = r(node, 'value1', 0, context, scopeGraph);
    const value2 = r(node, 'value2', 0, context, scopeGraph);
    const in1 = r(node, 'in1', 1, context, scopeGraph);
    const in2 = r(node, 'in2', 0, context, scopeGraph);
    return mx_ifgreatereq(value1 as never, value2 as never, in1 as never, in2 as never);
  });

  map.set('ifequal', (node, context, scopeGraph) => {
    const value1 = r(node, 'value1', 0, context, scopeGraph);
    const value2 = r(node, 'value2', 0, context, scopeGraph);
    const in1 = r(node, 'in1', 1, context, scopeGraph);
    const in2 = r(node, 'in2', 0, context, scopeGraph);
    return mx_ifequal(value1 as never, value2 as never, in1 as never, in2 as never);
  });

  map.set('reflect', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec3(0, 0, 0), context, scopeGraph);
    const normal = r(node, 'normal', vec3(0, 0, 1), context, scopeGraph);
    return reflect(inNode as never, normal as never);
  });

  map.set('refract', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec3(0, 0, 0), context, scopeGraph);
    const normal = r(node, 'normal', vec3(0, 0, 1), context, scopeGraph);
    const ior = r(node, 'ior', 1.5, context, scopeGraph);
    return refract(inNode as never, normal as never, ior as never);
  });

  register(map, ['noise2d', 'noise3d'], (node, context, scopeGraph) => {
    const texcoord = r(node, 'texcoord', vec2(0, 0), context, scopeGraph);
    const amplitude = r(node, 'amplitude', 1, context, scopeGraph);
    const pivot = r(node, 'pivot', 0, context, scopeGraph);
    return mx_noise_float(texcoord as never, amplitude as never, pivot as never);
  });

  map.set('fractal3d', (node, context, scopeGraph) => {
    const position = r(node, 'position', vec3(0, 0, 0), context, scopeGraph);
    const octaves = r(node, 'octaves', 3, context, scopeGraph);
    const lacunarity = r(node, 'lacunarity', 2, context, scopeGraph);
    const diminish = r(node, 'diminish', 0.5, context, scopeGraph);
    const amplitude = r(node, 'amplitude', 1, context, scopeGraph);
    return mx_fractal_noise_float(position as never, octaves as never, lacunarity as never, diminish as never, amplitude as never);
  });

  register(map, ['cellnoise2d', 'cellnoise3d'], (node, context, scopeGraph) => {
    const texcoord = r(node, 'texcoord', vec2(0, 0), context, scopeGraph);
    return mx_cell_noise_float(texcoord as never);
  });

  register(map, ['worleynoise2d', 'worleynoise3d'], (node, context, scopeGraph) => {
    const texcoord = r(node, 'texcoord', vec2(0, 0), context, scopeGraph);
    const jitter = r(node, 'jitter', 1, context, scopeGraph);
    return mx_worley_noise_float(texcoord as never, jitter as never);
  });

  map.set('unifiednoise2d', (node, context, scopeGraph) => {
    const type = r(node, 'type', 0, context, scopeGraph);
    const texcoord = r(node, 'texcoord', vec2(0, 0), context, scopeGraph);
    const freq = r(node, 'freq', vec2(1, 1), context, scopeGraph);
    const offset = r(node, 'offset', vec2(0, 0), context, scopeGraph);
    const jitter = r(node, 'jitter', 1, context, scopeGraph);
    const outMin = r(node, 'outmin', 0, context, scopeGraph);
    const outMax = r(node, 'outmax', 1, context, scopeGraph);
    const clampOutput = r(node, 'clampoutput', 0, context, scopeGraph);
    const octaves = r(node, 'octaves', 3, context, scopeGraph);
    const lacunarity = r(node, 'lacunarity', 2, context, scopeGraph);
    const diminish = r(node, 'diminish', 0.5, context, scopeGraph);
    return mx_unifiednoise2d(
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
  });

  map.set('unifiednoise3d', (node, context, scopeGraph) => {
    const type = r(node, 'type', 0, context, scopeGraph);
    const texcoord = r(node, 'texcoord', vec3(0, 0, 0), context, scopeGraph);
    const freq = r(node, 'freq', vec3(1, 1, 1), context, scopeGraph);
    const offset = r(node, 'offset', vec3(0, 0, 0), context, scopeGraph);
    const jitter = r(node, 'jitter', 1, context, scopeGraph);
    const outMin = r(node, 'outmin', 0, context, scopeGraph);
    const outMax = r(node, 'outmax', 1, context, scopeGraph);
    const clampOutput = r(node, 'clampoutput', 0, context, scopeGraph);
    const octaves = r(node, 'octaves', 3, context, scopeGraph);
    const lacunarity = r(node, 'lacunarity', 2, context, scopeGraph);
    const diminish = r(node, 'diminish', 0.5, context, scopeGraph);
    return mx_unifiednoise3d(
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
  });

  map.set('hextiledimage', (node, context, scopeGraph) => compileHexTiledTextureNode(node, context, scopeGraph));

  map.set('hextilednormalmap', (node, context, scopeGraph) => {
    const normalSample = compileHexTiledTextureNode(node, context, scopeGraph);
    const scaleNode = r(node, 'scale', 1, context, scopeGraph);
    return normalMap(normalSample as never, scaleNode as never);
  });

  map.set('hsvtorgb', (node, context, scopeGraph) => mx_hsvtorgb(r(node, 'in', vec3(0, 0, 0), context, scopeGraph) as never));
  map.set('rgbtohsv', (node, context, scopeGraph) => mx_rgbtohsv(r(node, 'in', vec3(0, 0, 0), context, scopeGraph) as never));

  map.set('luminance', (node, context, scopeGraph) =>
    luminance(r(node, 'in', vec3(0, 0, 0), context, scopeGraph) as never, vec3(0.2126, 0.7152, 0.0722))
  );

  map.set('contrast', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', vec3(0, 0, 0), context, scopeGraph);
    const amount = r(node, 'amount', 1, context, scopeGraph);
    return mx_contrast(inNode as never, amount as never, float(0.5));
  });

  map.set('colorcorrect', (node, context, scopeGraph) => {
    const inNode = r(node, 'in', node.type === 'color4' ? vec4(0, 0, 0, 1) : vec3(0, 0, 0), context, scopeGraph);
    const hue = r(node, 'hue', 0, context, scopeGraph);
    const saturation = r(node, 'saturation', 1, context, scopeGraph);
    const gamma = r(node, 'gamma', 1, context, scopeGraph);
    const lift = r(node, 'lift', 0, context, scopeGraph);
    const gain = r(node, 'gain', 1, context, scopeGraph);
    const contrastAmount = r(node, 'contrast', 1, context, scopeGraph);
    const contrastPivot = r(node, 'contrastpivot', 0.5, context, scopeGraph);
    const exposure = r(node, 'exposure', 0, context, scopeGraph);
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
    return node.type === 'color4'
      ? vec4(
          getNodeChannel(colorOut, 0) as never,
          getNodeChannel(colorOut, 1) as never,
          getNodeChannel(colorOut, 2) as never,
          getNodeChannel(inNode, 3) as never
        )
      : colorOut;
  });

  map.set('blackbody', (node, context, scopeGraph) => {
    const temperature = r(node, 'temperature', 6500, context, scopeGraph);
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
      add(
        add(mul(float(3.2406), getNodeChannel(xyz, 0) as never) as never, mul(float(-0.9689), getNodeChannel(xyz, 1) as never) as never) as never,
        mul(float(0.0557), getNodeChannel(xyz, 2) as never) as never
      ) as never,
      add(
        add(mul(float(-1.5372), getNodeChannel(xyz, 0) as never) as never, mul(float(1.8758), getNodeChannel(xyz, 1) as never) as never) as never,
        mul(float(-0.204), getNodeChannel(xyz, 2) as never) as never
      ) as never,
      add(
        add(mul(float(-0.4986), getNodeChannel(xyz, 0) as never) as never, mul(float(0.0415), getNodeChannel(xyz, 1) as never) as never) as never,
        mul(float(1.057), getNodeChannel(xyz, 2) as never) as never
      ) as never
    );
    return max(rgb as never, vec3(0, 0, 0) as never);
  });

  map.set('artistic_ior', (node, context, scopeGraph, outputName) => {
    const reflectivity = r(node, 'reflectivity', vec3(0.8, 0.8, 0.8), context, scopeGraph);
    const edgeColor = r(node, 'edge_color', vec3(1, 1, 1), context, scopeGraph);
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
    return outputName === 'extinction' ? extinction : ior;
  });

  return map;
};
