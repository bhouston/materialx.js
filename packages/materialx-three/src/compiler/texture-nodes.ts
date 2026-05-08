import type { MaterialXNode, MaterialXNodeGraph } from '@material-viewer/mtlx-core';
import {
  abs,
  add,
  clamp,
  div,
  dot,
  element,
  floor,
  fract,
  max,
  mix,
  mul,
  pow,
  sin,
  cos,
  step,
  sub,
  texture,
  uv,
  dFdx,
  dFdy,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
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

const HEXTILE_SQRT3_2 = Math.sqrt(3) * 2;
const HEXTILE_EPSILON = 1e-6;
const HEXTILE_PI_OVER_180 = Math.PI / 180;

const toRadians = (degrees: unknown): unknown => mul(degrees as never, HEXTILE_PI_OVER_180 as never);

const mxHextileHash = (point: unknown): unknown => {
  const x = element(point as never, 0 as never);
  const y = element(point as never, 1 as never);
  const p3Base = vec3(x as never, y as never, x as never);
  const p3Scaled = mul(p3Base as never, vec3(0.1031, 0.103, 0.0973) as never);
  const p3Fract = fract(p3Scaled as never);
  const p3YZX = vec3(
    element(p3Fract as never, 1 as never) as never,
    element(p3Fract as never, 2 as never) as never,
    element(p3Fract as never, 0 as never) as never,
  );
  const p3Offset = add(p3YZX as never, 33.33 as never);
  const p3 = add(p3Fract as never, dot(p3Fract as never, p3Offset as never) as never);
  const lhs = add(
    vec2(element(p3 as never, 0 as never) as never, element(p3 as never, 0 as never) as never) as never,
    vec2(element(p3 as never, 1 as never) as never, element(p3 as never, 2 as never) as never) as never,
  );
  const rhs = vec2(element(p3 as never, 2 as never) as never, element(p3 as never, 1 as never) as never);
  return fract(mul(lhs as never, rhs as never) as never);
};

const mxSchlickGain = (x: unknown, r: unknown): unknown => {
  const rr = clamp(r as never, 0.001 as never, 0.999 as never);
  const a = mul(
    sub(div(1 as never, rr as never) as never, 2 as never) as never,
    sub(1 as never, mul(2 as never, x as never) as never) as never,
  );
  const low = div(x as never, add(a as never, 1 as never) as never);
  const high = div(sub(a as never, x as never) as never, sub(a as never, 1 as never) as never);
  return mix(low as never, high as never, step(0.5 as never, x as never) as never);
};

const normalizeBlendWeights = (weights: unknown): unknown => {
  const wx = element(weights as never, 0 as never);
  const wy = element(weights as never, 1 as never);
  const wz = element(weights as never, 2 as never);
  const sum = max(add(add(wx as never, wy as never) as never, wz as never) as never, HEXTILE_EPSILON as never);
  return div(weights as never, sum as never);
};

const mxHextileComputeBlendWeights = (luminanceWeights: unknown, tileWeights: unknown, falloff: unknown): unknown => {
  const weighted = mul(
    luminanceWeights as never,
    pow(
      max(tileWeights as never, vec3(HEXTILE_EPSILON, HEXTILE_EPSILON, HEXTILE_EPSILON) as never) as never,
      vec3(7, 7, 7) as never,
    ) as never,
  );
  const normalized = normalizeBlendWeights(weighted);
  const gained = vec3(
    mxSchlickGain(element(normalized as never, 0 as never), falloff) as never,
    mxSchlickGain(element(normalized as never, 1 as never), falloff) as never,
    mxSchlickGain(element(normalized as never, 2 as never), falloff) as never,
  );
  const gainedNormalized = normalizeBlendWeights(gained);
  const applyFalloff = step(HEXTILE_EPSILON as never, abs(sub(falloff as never, 0.5 as never) as never) as never);
  return mix(normalized as never, gainedNormalized as never, applyFalloff as never);
};

const mxRotate2d = (point: unknown, sine: unknown, cosine: unknown): unknown =>
  vec2(
    sub(
      mul(cosine as never, element(point as never, 0 as never) as never) as never,
      mul(sine as never, element(point as never, 1 as never) as never) as never,
    ) as never,
    add(
      mul(sine as never, element(point as never, 0 as never) as never) as never,
      mul(cosine as never, element(point as never, 1 as never) as never) as never,
    ) as never,
  );

const rotate2dMaterialX = (inNode: unknown, amount: unknown): unknown => {
  const rotationRadians = mul(amount as never, (Math.PI / 180.0) as never);
  const sa = sin(rotationRadians as never);
  const ca = cos(rotationRadians as never);
  const x = element(inNode as never, 0 as never);
  const y = element(inNode as never, 1 as never);
  return vec2(
    add(mul(ca as never, x as never) as never, mul(sa as never, y as never) as never) as never,
    sub(mul(ca as never, y as never) as never, mul(sa as never, x as never) as never) as never,
  );
};

const place2dMaterialX = (
  texcoord: unknown,
  pivot: unknown,
  scaleNode: unknown,
  rotate: unknown,
  offset: unknown,
  operationorder: unknown,
): unknown => {
  const centered = sub(texcoord as never, pivot as never);
  const srt = add(
    sub(rotate2dMaterialX(div(centered as never, scaleNode as never), rotate) as never, offset as never),
    pivot as never,
  );
  const trs = add(
    div(rotate2dMaterialX(sub(centered as never, offset as never), rotate) as never, scaleNode as never),
    pivot as never,
  );
  if (typeof operationorder === 'number') {
    return Math.abs(operationorder) > Number.EPSILON ? trs : srt;
  }
  return mix(srt as never, trs as never, step(0.5 as never, operationorder as never) as never);
};

const mxToUvSpace = (uvNode: unknown): unknown =>
  vec2(
    element(uvNode as never, 0 as never) as never,
    sub(1 as never, element(uvNode as never, 1 as never) as never) as never,
  );

const mxFromUvSpace = (uvNode: unknown): unknown =>
  vec2(
    element(uvNode as never, 0 as never) as never,
    sub(1 as never, element(uvNode as never, 1 as never) as never) as never,
  );

const mxHextileCoord = (
  coord: unknown,
  rotation: unknown,
  rotationRange: unknown,
  scale: unknown,
  scaleRange: unknown,
  offset: unknown,
  offsetRange: unknown,
): {
  coords: [unknown, unknown, unknown];
  ddx: [unknown, unknown, unknown];
  ddy: [unknown, unknown, unknown];
  weights: unknown;
} => {
  const st = mul(coord as never, HEXTILE_SQRT3_2 as never);
  const stSkewed = vec2(
    add(
      element(st as never, 0 as never) as never,
      mul(-0.57735027 as never, element(st as never, 1 as never) as never) as never,
    ) as never,
    mul(1.15470054 as never, element(st as never, 1 as never) as never) as never,
  );
  const stFrac = fract(stSkewed as never);
  const tx = element(stFrac as never, 0 as never);
  const ty = element(stFrac as never, 1 as never);
  const tz = sub(sub(1 as never, tx as never) as never, ty as never);
  const s = step(0 as never, sub(0 as never, tz as never) as never);
  const s2 = sub(mul(2 as never, s as never) as never, 1 as never);
  const w1 = mul(sub(0 as never, tz as never) as never, s2 as never);
  const w2 = sub(s as never, mul(ty as never, s2 as never) as never);
  const w3 = sub(s as never, mul(tx as never, s2 as never) as never);
  const baseId = floor(stSkewed as never);
  const oneMinusS = sub(1 as never, s as never);
  const id1 = add(baseId as never, vec2(s as never, s as never) as never);
  const id2 = add(baseId as never, vec2(s as never, oneMinusS as never) as never);
  const id3 = add(baseId as never, vec2(oneMinusS as never, s as never) as never);

  const toTileCenter = (tileId: unknown): unknown => {
    const scaled = div(tileId as never, HEXTILE_SQRT3_2 as never);
    const sx = element(scaled as never, 0 as never);
    const sy = element(scaled as never, 1 as never);
    return vec2(
      add(sx as never, mul(0.5 as never, sy as never) as never) as never,
      mul(0.8660254 as never, sy as never) as never,
    );
  };

  const ctr1 = toTileCenter(id1);
  const ctr2 = toTileCenter(id2);
  const ctr3 = toTileCenter(id3);

  const seedOffset = vec2(0.12345, 0.12345);
  const rand1 = mxHextileHash(add(id1 as never, seedOffset as never));
  const rand2 = mxHextileHash(add(id2 as never, seedOffset as never));
  const rand3 = mxHextileHash(add(id3 as never, seedOffset as never));

  const rr = vec2(
    toRadians(element(rotationRange as never, 0 as never)) as never,
    toRadians(element(rotationRange as never, 1 as never)) as never,
  );
  const rrMin = element(rr as never, 0 as never);
  const rrMax = element(rr as never, 1 as never);
  const rotationMin = vec3(rrMin as never, rrMin as never, rrMin as never);
  const rotationMax = vec3(rrMax as never, rrMax as never, rrMax as never);
  const randX = vec3(
    element(rand1 as never, 0 as never) as never,
    element(rand2 as never, 0 as never) as never,
    element(rand3 as never, 0 as never) as never,
  );
  const rotations = mix(rotationMin as never, rotationMax as never, mul(randX as never, rotation as never) as never);

  const randY = vec3(
    element(rand1 as never, 1 as never) as never,
    element(rand2 as never, 1 as never) as never,
    element(rand3 as never, 1 as never) as never,
  );
  const scaleMin = element(scaleRange as never, 0 as never);
  const scaleMax = element(scaleRange as never, 1 as never);
  const randomScale = mix(
    vec3(scaleMin as never, scaleMin as never, scaleMin as never) as never,
    vec3(scaleMax as never, scaleMax as never, scaleMax as never) as never,
    randY as never,
  );
  const scales = mix(vec3(1, 1, 1) as never, randomScale as never, scale as never);

  const offsetMin = element(offsetRange as never, 0 as never);
  const offsetMax = element(offsetRange as never, 1 as never);
  const offset1 = mix(
    vec2(offsetMin as never, offsetMin as never) as never,
    vec2(offsetMax as never, offsetMax as never) as never,
    mul(rand1 as never, offset as never) as never,
  );
  const offset2 = mix(
    vec2(offsetMin as never, offsetMin as never) as never,
    vec2(offsetMax as never, offsetMax as never) as never,
    mul(rand2 as never, offset as never) as never,
  );
  const offset3 = mix(
    vec2(offsetMin as never, offsetMin as never) as never,
    vec2(offsetMax as never, offsetMax as never) as never,
    mul(rand3 as never, offset as never) as never,
  );

  const sampleCoord = (
    center: unknown,
    randomOffset: unknown,
    rotationValue: unknown,
    sampleScale: unknown,
  ): unknown => {
    const delta = sub(coord as never, center as never);
    const rotated = mxRotate2d(delta, sin(rotationValue as never), cos(rotationValue as never));
    const safeScale = max(sampleScale as never, HEXTILE_EPSILON as never);
    return add(
      add(
        div(rotated as never, vec2(safeScale as never, safeScale as never) as never) as never,
        center as never,
      ) as never,
      randomOffset as never,
    );
  };

  const sampleDerivative = (derivative: unknown, rotationValue: unknown, sampleScale: unknown): unknown => {
    const rotated = mxRotate2d(derivative, sin(rotationValue as never), cos(rotationValue as never));
    const safeScale = max(sampleScale as never, HEXTILE_EPSILON as never);
    return div(rotated as never, vec2(safeScale as never, safeScale as never) as never);
  };

  const ddx = dFdx(coord as never);
  const ddy = dFdy(coord as never);

  return {
    coords: [
      sampleCoord(ctr1, offset1, element(rotations as never, 0 as never), element(scales as never, 0 as never)),
      sampleCoord(ctr2, offset2, element(rotations as never, 1 as never), element(scales as never, 1 as never)),
      sampleCoord(ctr3, offset3, element(rotations as never, 2 as never), element(scales as never, 2 as never)),
    ],
    ddx: [
      sampleDerivative(ddx, element(rotations as never, 0 as never), element(scales as never, 0 as never)),
      sampleDerivative(ddx, element(rotations as never, 1 as never), element(scales as never, 1 as never)),
      sampleDerivative(ddx, element(rotations as never, 2 as never), element(scales as never, 2 as never)),
    ],
    ddy: [
      sampleDerivative(ddy, element(rotations as never, 0 as never), element(scales as never, 0 as never)),
      sampleDerivative(ddy, element(rotations as never, 1 as never), element(scales as never, 1 as never)),
      sampleDerivative(ddy, element(rotations as never, 2 as never), element(scales as never, 2 as never)),
    ],
    weights: vec3(w1 as never, w2 as never, w3 as never),
  };
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

    const uvNode = resolveInputNode(node, 'texcoord', mxToUvSpace(uv(0)), context, scopeGraph);
    const uvTiling = resolveInputNode(node, 'uvtiling', vec2(1, 1), context, scopeGraph);
    const uvOffset = resolveInputNode(node, 'uvoffset', vec2(0, 0), context, scopeGraph);
    const transformedUv =
      node.category === 'tiledimage' ? add(mul(uvNode as never, uvTiling as never), uvOffset as never) : uvNode;

    const textureResolver =
      context.options.textureResolver ?? createTextureResolver({ basePath: context.options.basePath });
    const tex = textureResolver.resolve(uri, { document: context.document, node });
    const sampled = texture(tex, mxFromUvSpace(transformedUv) as never);
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

    const texcoord = resolveInputNode(node, 'texcoord', mxToUvSpace(uv(0)), context, scopeGraph);
    const pivot = resolveInputNode(node, 'pivot', vec2(0, 0), context, scopeGraph);
    const scaleNode = resolveInputNode(node, 'scale', vec2(1, 1), context, scopeGraph);
    const rotate = resolveInputNode(node, 'rotate', 0, context, scopeGraph);
    const offset = resolveInputNode(node, 'offset', vec2(0, 0), context, scopeGraph);
    const operationOrderInput = readInput(node, 'operationorder');
    const operationOrderScalar = toScalar(operationOrderInput?.value ?? operationOrderInput?.attributes.value);
    const operationOrder =
      operationOrderScalar === undefined
        ? resolveInputNode(node, 'operationorder', 0, context, scopeGraph)
        : operationOrderScalar;
    const transformedUv = place2dMaterialX(texcoord, pivot, scaleNode, rotate, offset, operationOrder);

    const textureResolver =
      context.options.textureResolver ?? createTextureResolver({ basePath: context.options.basePath });
    const tex = textureResolver.resolve(uri, { document: context.document, node });
    return texture(tex, mxFromUvSpace(transformedUv) as never);
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

    const uvNode = resolveInputNode(node, 'texcoord', mxToUvSpace(uv(0)), context, scopeGraph);
    const tiling = resolveInputNode(node, 'tiling', vec2(1, 1), context, scopeGraph);
    const rotation = resolveInputNode(node, 'rotation', 1, context, scopeGraph);
    const rotationRange = resolveInputNode(node, 'rotationrange', vec2(0, 360), context, scopeGraph);
    const scale = resolveInputNode(node, 'scale', 1, context, scopeGraph);
    const scaleRange = resolveInputNode(node, 'scalerange', vec2(0.5, 2), context, scopeGraph);
    const offset = resolveInputNode(node, 'offset', 1, context, scopeGraph);
    const offsetRange = resolveInputNode(node, 'offsetrange', vec2(0, 1), context, scopeGraph);
    const falloff = resolveInputNode(node, 'falloff', 0.5, context, scopeGraph);
    const falloffContrast = resolveInputNode(node, 'falloffcontrast', 0.5, context, scopeGraph);
    const lumaCoeffs = resolveInputNode(node, 'lumacoeffs', vec3(0.2722287, 0.6740818, 0.0536895), context, scopeGraph);
    const transformedUv = mul(uvNode as never, tiling as never);

    const textureResolver =
      context.options.textureResolver ?? createTextureResolver({ basePath: context.options.basePath });
    const tex = textureResolver.resolve(uri, { document: context.document, node });
    const tileData = mxHextileCoord(transformedUv, rotation, rotationRange, scale, scaleRange, offset, offsetRange) as {
      coords: [unknown, unknown, unknown];
      ddx: [unknown, unknown, unknown];
      ddy: [unknown, unknown, unknown];
      weights: unknown;
    };

    const invertY = (v: unknown): unknown =>
      vec2(element(v as never, 0 as never) as never, mul(element(v as never, 1 as never) as never, -1) as never);

    const sample0Raw = texture(tex, mxFromUvSpace(tileData.coords[0]) as never).grad(
      invertY(tileData.ddx[0]) as never,
      invertY(tileData.ddy[0]) as never,
    );
    const sample1Raw = texture(tex, mxFromUvSpace(tileData.coords[1]) as never).grad(
      invertY(tileData.ddx[1]) as never,
      invertY(tileData.ddy[1]) as never,
    );
    const sample2Raw = texture(tex, mxFromUvSpace(tileData.coords[2]) as never).grad(
      invertY(tileData.ddx[2]) as never,
      invertY(tileData.ddy[2]) as never,
    );
    const sample0 = applyTextureColorSpace(
      fileInput?.attributes.colorspace,
      context.document.attributes.colorspace,
      sample0Raw,
    );
    const sample1 = applyTextureColorSpace(
      fileInput?.attributes.colorspace,
      context.document.attributes.colorspace,
      sample1Raw,
    );
    const sample2 = applyTextureColorSpace(
      fileInput?.attributes.colorspace,
      context.document.attributes.colorspace,
      sample2Raw,
    );

    const c0 = vec3(
      element(sample0 as never, 0 as never) as never,
      element(sample0 as never, 1 as never) as never,
      element(sample0 as never, 2 as never) as never,
    );
    const c1 = vec3(
      element(sample1 as never, 0 as never) as never,
      element(sample1 as never, 1 as never) as never,
      element(sample1 as never, 2 as never) as never,
    );
    const c2 = vec3(
      element(sample2 as never, 0 as never) as never,
      element(sample2 as never, 1 as never) as never,
      element(sample2 as never, 2 as never) as never,
    );
    const cw = mix(
      vec3(1, 1, 1) as never,
      vec3(
        dot(c0 as never, lumaCoeffs as never) as never,
        dot(c1 as never, lumaCoeffs as never) as never,
        dot(c2 as never, lumaCoeffs as never) as never,
      ) as never,
      vec3(falloffContrast as never, falloffContrast as never, falloffContrast as never) as never,
    );
    const blendWeights = mxHextileComputeBlendWeights(cw, tileData.weights, falloff);
    const alphaWeights = mxHextileComputeBlendWeights(vec3(1, 1, 1), tileData.weights, falloff);
    const blendedRgb = add(
      add(
        mul(element(blendWeights as never, 0 as never) as never, c0 as never) as never,
        mul(element(blendWeights as never, 1 as never) as never, c1 as never) as never,
      ) as never,
      mul(element(blendWeights as never, 2 as never) as never, c2 as never) as never,
    );
    const blendedAlpha = add(
      add(
        mul(
          element(alphaWeights as never, 0 as never) as never,
          element(sample0Raw as never, 3 as never) as never,
        ) as never,
        mul(
          element(alphaWeights as never, 1 as never) as never,
          element(sample1Raw as never, 3 as never) as never,
        ) as never,
      ) as never,
      mul(
        element(alphaWeights as never, 2 as never) as never,
        element(sample2Raw as never, 3 as never) as never,
      ) as never,
    );
    const blendedSample = vec4(blendedRgb as never, blendedAlpha as never);
    return selectTextureSample(blendedSample, node.type);
  };

  return {
    compileTextureNode,
    compileGltfTextureSample,
    compileGltfImageNode,
    compileHexTiledTextureNode,
  };
};
