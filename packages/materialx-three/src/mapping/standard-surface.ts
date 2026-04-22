import type { MaterialXNode } from '@materialx-js/materialx';
import { dot, mix, mul, step, vec3 } from 'three/tsl';
import type { MaterialSlotAssignments } from '../types.js';

export interface StandardSurfaceInputs {
  getInputNode(node: MaterialXNode, name: string, fallback: unknown): unknown;
}

const multiplyNodeValues = (left: unknown, right: unknown): unknown =>
  (left as { mul?: (other: unknown) => unknown }).mul?.(right) ?? mul(left as never, right as never);

const mixUnsafe = mix as unknown as (left: unknown, right: unknown, alpha: unknown) => unknown;
const dotUnsafe = dot as unknown as (left: unknown, right: unknown) => unknown;

const mixNodeValues = (left: unknown, right: unknown, alpha: unknown): unknown =>
  (left as { mix?: (other: unknown, factor: unknown) => unknown }).mix?.(right, alpha) ?? mixUnsafe(left, right, alpha);

const toOpacityScalar = (opacity: unknown): unknown => {
  if (typeof opacity === 'number') {
    return opacity;
  }
  if (Array.isArray(opacity) && opacity.length >= 3) {
    const [r, g, b] = opacity;
    if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    }
  }
  return dotUnsafe(opacity, vec3(0.2126, 0.7152, 0.0722));
};

const toAttenuationDistance = (depth: unknown, hasTransmissionColorInput: boolean): unknown => {
  if (depth === undefined) {
    // When transmission tint is authored without depth, default to a finite
    // distance so attenuation visibly contributes instead of acting clear.
    return hasTransmissionColorInput ? 1 : undefined;
  }
  if (typeof depth === 'number') {
    return depth > 0 ? depth : undefined;
  }
  return depth;
};

export const buildStandardSurfaceAssignments = (
  surfaceNode: MaterialXNode,
  helpers: StandardSurfaceInputs,
): MaterialSlotAssignments => {
  const hasInput = (name: string) => surfaceNode.inputs.some((input) => input.name === name);
  const base = helpers.getInputNode(surfaceNode, 'base', 1);
  const baseColor = helpers.getInputNode(surfaceNode, 'base_color', [0.8, 0.8, 0.8]);
  const roughness = helpers.getInputNode(surfaceNode, 'specular_roughness', 0.2);
  const metalness = helpers.getInputNode(surfaceNode, 'metalness', 0);
  const specular = helpers.getInputNode(surfaceNode, 'specular', 1);
  const specularColor = helpers.getInputNode(surfaceNode, 'specular_color', [1, 1, 1]);
  const anisotropy = helpers.getInputNode(surfaceNode, 'specular_anisotropy', 0);
  const anisotropyRotation = helpers.getInputNode(surfaceNode, 'specular_rotation', 0);
  const coat = helpers.getInputNode(surfaceNode, 'coat', 0);
  const coatColor = helpers.getInputNode(surfaceNode, 'coat_color', [1, 1, 1]);
  const coatRoughness = helpers.getInputNode(surfaceNode, 'coat_roughness', 0.1);
  const coatNormal = helpers.getInputNode(surfaceNode, 'coat_normal', undefined);
  const sheen = helpers.getInputNode(surfaceNode, 'sheen', 0);
  const sheenColor = helpers.getInputNode(surfaceNode, 'sheen_color', [1, 1, 1]);
  const sheenRoughness = helpers.getInputNode(surfaceNode, 'sheen_roughness', 0.3);
  const emissionColor = helpers.getInputNode(surfaceNode, 'emission_color', [0, 0, 0]);
  const emissionAmount = helpers.getInputNode(surfaceNode, 'emission', 0);
  const opacity = helpers.getInputNode(surfaceNode, 'opacity', undefined);
  const hasTransmission = hasInput('transmission');
  const transmission = hasTransmission ? helpers.getInputNode(surfaceNode, 'transmission', 0) : undefined;
  const hasTransmissionColorInput = hasInput('transmission_color');
  const transmissionColor = hasTransmission
    ? helpers.getInputNode(surfaceNode, 'transmission_color', [1, 1, 1])
    : undefined;
  const transmissionDepth = hasInput('transmission_depth')
    ? helpers.getInputNode(surfaceNode, 'transmission_depth', undefined)
    : undefined;
  const ior = hasInput('specular_IOR')
    ? helpers.getInputNode(surfaceNode, 'specular_IOR', 1.5)
    : helpers.getInputNode(surfaceNode, 'ior', 1.5);
  const thinFilmThickness = helpers.getInputNode(surfaceNode, 'thin_film_thickness', 0);
  const thinFilmIOR = helpers.getInputNode(
    surfaceNode,
    'thin_film_IOR',
    helpers.getInputNode(surfaceNode, 'thin_film_ior', 1.3),
  );
  const normal = helpers.getInputNode(surfaceNode, 'normal', undefined);

  const baseLayerColor = multiplyNodeValues(baseColor, base);
  // Standard Surface "base" controls diffuse only; with transmission-heavy
  // materials (e.g. glass) base is commonly zero and should not black out the
  // transmitted result in Three's physical model.
  const transmissionSafeBaseColor = hasTransmission
    ? mixNodeValues(baseLayerColor, vec3(1, 1, 1), transmission)
    : baseLayerColor;
  // StandardSurface copper/brass examples tint via coat_color even when base_color is white.
  const coatTint = mixNodeValues(vec3(1, 1, 1), coatColor, coat);
  const colorNode = mul(transmissionSafeBaseColor as never, coatTint as never);
  const emissiveNode = multiplyNodeValues(emissionColor, emissionAmount);
  const sheenNode = multiplyNodeValues(sheenColor, sheen);
  const opacityNode = opacity === undefined ? undefined : toOpacityScalar(opacity);
  const attenuationDistanceNode = toAttenuationDistance(transmissionDepth, hasTransmissionColorInput);
  // StandardSurface has no explicit thin-film weight. Derive a 0/1 iridescence
  // enable signal from thickness so this aligns with glTF/Three semantics.
  const thinFilmEnabled = step(0.0001, thinFilmThickness as never);

  return {
    colorNode,
    roughnessNode: roughness,
    metalnessNode: metalness,
    specularIntensityNode: specular,
    specularColorNode: specularColor,
    anisotropyNode: anisotropy,
    anisotropyRotation,
    clearcoatNode: coat,
    clearcoatRoughnessNode: coatRoughness,
    clearcoatNormalNode: coatNormal,
    sheenNode,
    sheenRoughnessNode: sheenRoughness,
    emissiveNode,
    opacityNode,
    transmissionNode: transmission,
    attenuationColorNode: transmissionColor,
    attenuationDistanceNode,
    iorNode: ior,
    iridescenceNode: thinFilmEnabled,
    iridescenceIORNode: thinFilmIOR,
    iridescenceThicknessNode: thinFilmThickness,
    normalNode: normal,
  };
};
