import type { MaterialXNode } from '@materialx-js/materialx';
import { clamp, float, mul } from 'three/tsl';
import type { MaterialSlotAssignments } from '../types.js';

export interface StandardSurfaceInputs {
  getInputNode(node: MaterialXNode, name: string, fallback: unknown): unknown;
}

const readNumberLiteral = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return undefined;
  const nodeValue = (value as { value?: unknown }).value;
  if (typeof nodeValue === 'number') return nodeValue;
  const nestedNodeValue = (value as { node?: { value?: unknown } }).node?.value;
  if (typeof nestedNodeValue === 'number') return nestedNodeValue;
  return undefined;
};

const isConstNear = (value: unknown, target: number, epsilon = 1e-6): boolean => {
  const literal = readNumberLiteral(value);
  if (literal === undefined) return false;
  return Math.abs(literal - target) <= epsilon;
};

const isEffectivelyZero = (value: unknown): boolean => isConstNear(value, 0);
const isEffectivelyOne = (value: unknown): boolean => isConstNear(value, 1);
const isEnabledWeightNode = (value: unknown): boolean => value !== undefined && value !== null && !isEffectivelyZero(value);

export const buildStandardSurfaceAssignments = (
  surfaceNode: MaterialXNode,
  helpers: StandardSurfaceInputs,
): MaterialSlotAssignments => {
  const hasInput = (name: string) => surfaceNode.inputs.some((input) => input.name === name);
  const hasBaseInput = hasInput('base');
  const hasBaseColorInput = hasInput('base_color');
  const base = hasBaseInput ? helpers.getInputNode(surfaceNode, 'base', 1) : undefined;
  const baseColor = hasBaseColorInput ? helpers.getInputNode(surfaceNode, 'base_color', [0.8, 0.8, 0.8]) : undefined;
  const roughness = hasInput('specular_roughness')
    ? helpers.getInputNode(surfaceNode, 'specular_roughness', 0.2)
    : helpers.getInputNode(surfaceNode, 'roughness', 0.2);
  const metalness = helpers.getInputNode(surfaceNode, 'metalness', 0);
  const specular = helpers.getInputNode(surfaceNode, 'specular', 1);
  const specularColor = helpers.getInputNode(surfaceNode, 'specular_color', [1, 1, 1]);
  const anisotropy = helpers.getInputNode(surfaceNode, 'specular_anisotropy', 0);
  const anisotropyRotation = helpers.getInputNode(surfaceNode, 'specular_rotation', 0);
  const coat = helpers.getInputNode(surfaceNode, 'coat', 0);
  const coatColor = hasInput('coat_color') ? helpers.getInputNode(surfaceNode, 'coat_color', [1, 1, 1]) : undefined;
  const coatRoughness = helpers.getInputNode(surfaceNode, 'coat_roughness', 0.1);
  const coatNormal = helpers.getInputNode(surfaceNode, 'coat_normal', undefined);
  const sheen = helpers.getInputNode(surfaceNode, 'sheen', 0);
  const sheenColor = helpers.getInputNode(surfaceNode, 'sheen_color', [1, 1, 1]);
  const sheenRoughness = helpers.getInputNode(surfaceNode, 'sheen_roughness', 0.3);
  const hasEmissionColor = hasInput('emission_color');
  const hasLegacyEmissionColor = hasInput('emissionColor');
  const emissionColor =
    hasEmissionColor || hasLegacyEmissionColor
      ? helpers.getInputNode(surfaceNode, hasEmissionColor ? 'emission_color' : 'emissionColor', [0, 0, 0])
      : undefined;
  const emissionAmount = hasInput('emission') ? helpers.getInputNode(surfaceNode, 'emission', 0) : undefined;
  const opacity = helpers.getInputNode(surfaceNode, 'opacity', undefined);
  const transmission = helpers.getInputNode(surfaceNode, 'transmission', 0);
  const transmissionColor = helpers.getInputNode(surfaceNode, 'transmission_color', [1, 1, 1]);
  const transmissionDepth = helpers.getInputNode(surfaceNode, 'transmission_depth', 0);
  const ior = hasInput('specular_IOR')
    ? helpers.getInputNode(surfaceNode, 'specular_IOR', 1.5)
    : helpers.getInputNode(surfaceNode, 'ior', 1.5);
  const thinFilmThickness = hasInput('thin_film_thickness')
    ? helpers.getInputNode(surfaceNode, 'thin_film_thickness', 0)
    : undefined;
  const thinFilmIOR = clamp(
    helpers.getInputNode(
      surfaceNode,
      'thin_film_ior',
      helpers.getInputNode(surfaceNode, 'thin_film_IOR', 1.5),
    ) as never,
    float(1.0),
    float(2.333),
  );
  const normal = helpers.getInputNode(surfaceNode, 'normal', undefined);

  let colorNode: unknown;
  if (base !== undefined && baseColor !== undefined) {
    colorNode = mul(base as never, baseColor as never);
  } else if (base !== undefined) {
    colorNode = base;
  } else if (baseColor !== undefined) {
    colorNode = baseColor;
  }
  if (coatColor !== undefined) {
    colorNode = colorNode ? mul(colorNode as never, coatColor as never) : colorNode;
  }

  let emissiveNode = emissionAmount;
  if (emissionColor !== undefined) {
    emissiveNode = emissiveNode ? mul(emissiveNode as never, emissionColor as never) : emissionColor;
  }

  const transmissionEnabled = isEnabledWeightNode(transmission);
  const clearcoatEnabled = isEnabledWeightNode(coat);
  const sheenEnabled = isEnabledWeightNode(sheen);
  const thinFilmEnabled = isEnabledWeightNode(thinFilmThickness);
  const anisotropyEnabled = !isEffectivelyZero(anisotropy) || !isEffectivelyZero(anisotropyRotation);

  const assignments: MaterialSlotAssignments = {
    colorNode,
    roughnessNode: roughness,
    specularColorNode: specularColor,
    sheenColorNode: sheenColor,
    emissiveNode,
    normalNode: normal,
  };

  if (!isEffectivelyZero(metalness)) assignments.metalnessNode = metalness;
  if (!isEffectivelyOne(specular)) assignments.specularIntensityNode = specular;
  if (!isConstNear(ior, 1.5)) assignments.iorNode = ior;
  if (anisotropyEnabled) {
    assignments.anisotropyNode = anisotropy;
    assignments.anisotropyRotation = anisotropyRotation;
  }
  if (clearcoatEnabled) {
    assignments.clearcoatNode = coat;
    assignments.clearcoatRoughnessNode = coatRoughness;
    assignments.clearcoatNormalNode = coatNormal;
  }
  if (sheenEnabled) {
    assignments.sheenNode = sheen;
    if (!isConstNear(sheenRoughness, 0.3)) assignments.sheenRoughnessNode = sheenRoughness;
  }
  if (!isEffectivelyOne(opacity)) assignments.opacityNode = opacity;
  if (transmissionEnabled) {
    assignments.transmissionNode = transmission;
    assignments.transmissionColorNode = transmissionColor;
    if (!isEffectivelyZero(transmissionDepth)) assignments.thicknessNode = transmissionDepth;
  }
  if (thinFilmEnabled) {
    assignments.iridescenceNode = float(1);
    assignments.iridescenceIORNode = thinFilmIOR;
    assignments.iridescenceThicknessNode = thinFilmThickness;
  }

  return assignments;
};
