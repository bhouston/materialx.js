import type { MaterialXNode } from '@materialx-js/materialx';
import { div, max, mul, pow } from 'three/tsl';
import type { MaterialSlotAssignments } from '../types.js';

export interface OpenPbrSurfaceInputs {
  getInputNode(node: MaterialXNode, name: string, fallback: unknown): unknown;
}

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
  const nestedNodeValue = (value as { node?: { value?: unknown } }).node?.value;
  if (typeof nestedNodeValue === 'number') {
    return nestedNodeValue;
  }
  return undefined;
};

const toGltfDispersion = (abbeNumber: unknown, dispersionScale: unknown): unknown => {
  const abbeNumberLiteral = readNumberLiteral(abbeNumber);
  const dispersionScaleLiteral = readNumberLiteral(dispersionScale);
  if (abbeNumberLiteral !== undefined && dispersionScaleLiteral !== undefined) {
    if (abbeNumberLiteral <= 0) {
      return 0;
    }
    return (20 / abbeNumberLiteral) * dispersionScaleLiteral;
  }
  const safeAbbeNumber = max(abbeNumber as never, 1e-6 as never);
  return mul(dispersionScale as never, div(20 as never, safeAbbeNumber as never));
};

const hasNodeValue = (value: unknown): boolean => value !== undefined && value !== null;
const isConstNear = (value: unknown, target: number, epsilon = 1e-6): boolean => {
  const literal = readNumberLiteral(value);
  if (literal === undefined) return false;
  return Math.abs(literal - target) <= epsilon;
};
const isEffectivelyZero = (value: unknown): boolean => isConstNear(value, 0);
const isEffectivelyOne = (value: unknown): boolean => isConstNear(value, 1);
const isEnabledWeightNode = (value: unknown): boolean => hasNodeValue(value) && !isEffectivelyZero(value);

const multiplyNodeValues = (left: unknown, right: unknown): unknown =>
  (left as { mul?: (other: unknown) => unknown }).mul?.(right) ?? mul(left as never, right as never);

const applyThinWalledThickness = (thinWalled: unknown, transmissionDepth: unknown): unknown => {
  if (!hasNodeValue(transmissionDepth)) {
    return undefined;
  }
  if (!hasNodeValue(thinWalled)) {
    return transmissionDepth;
  }
  if (typeof thinWalled === 'boolean') {
    return thinWalled ? 0 : transmissionDepth;
  }
  const select = (thinWalled as { select?: (whenTrue: unknown, whenFalse: unknown) => unknown }).select;
  if (typeof select === 'function') {
    return select(0, transmissionDepth);
  }
  return transmissionDepth;
};

export const buildOpenPbrSurfaceAssignments = (
  surfaceNode: MaterialXNode,
  helpers: OpenPbrSurfaceInputs,
): MaterialSlotAssignments => {
  const hasInput = (name: string) => surfaceNode.inputs.some((input) => input.name === name);
  const baseWeight = helpers.getInputNode(surfaceNode, 'base_weight', 1);
  const baseColor = helpers.getInputNode(surfaceNode, 'base_color', [0.8, 0.8, 0.8]);
  const roughness = helpers.getInputNode(surfaceNode, 'specular_roughness', 0.3);
  const metalness = helpers.getInputNode(surfaceNode, 'base_metalness', 0);
  const specular = helpers.getInputNode(surfaceNode, 'specular_weight', 1);
  const specularColor = helpers.getInputNode(surfaceNode, 'specular_color', [1, 1, 1]);
  const anisotropy = helpers.getInputNode(surfaceNode, 'specular_roughness_anisotropy', 0);
  const coat = helpers.getInputNode(surfaceNode, 'coat_weight', 0);
  const coatRoughness = helpers.getInputNode(surfaceNode, 'coat_roughness', 0);
  const coatNormal = helpers.getInputNode(surfaceNode, 'geometry_coat_normal', undefined);
  const fuzz = helpers.getInputNode(surfaceNode, 'fuzz_weight', 0);
  const fuzzColor = helpers.getInputNode(surfaceNode, 'fuzz_color', [1, 1, 1]);
  const fuzzRoughness = helpers.getInputNode(surfaceNode, 'fuzz_roughness', 0.5);
  const transmission = helpers.getInputNode(surfaceNode, 'transmission_weight', 0);
  const transmissionColor = helpers.getInputNode(surfaceNode, 'transmission_color', [1, 1, 1]);
  const transmissionDepth = hasInput('transmission_depth')
    ? helpers.getInputNode(surfaceNode, 'transmission_depth', undefined)
    : undefined;
  const geometryThinWalled = hasInput('geometry_thin_walled')
    ? helpers.getInputNode(surfaceNode, 'geometry_thin_walled', undefined)
    : undefined;
  const hasTransmissionDispersionScale = hasInput('transmission_dispersion_scale');
  const hasTransmissionDispersionAbbe = hasInput('transmission_dispersion_abbe_number');
  const dispersion =
    hasTransmissionDispersionScale || hasTransmissionDispersionAbbe
      ? toGltfDispersion(
          helpers.getInputNode(surfaceNode, 'transmission_dispersion_abbe_number', 20),
          helpers.getInputNode(surfaceNode, 'transmission_dispersion_scale', 0),
        )
      : undefined;
  const ior = hasInput('specular_ior')
    ? helpers.getInputNode(surfaceNode, 'specular_ior', 1.5)
    : helpers.getInputNode(surfaceNode, 'specular_ior_level', 1.5);
  const normal = helpers.getInputNode(surfaceNode, 'geometry_normal', undefined);
  const opacity = helpers.getInputNode(surfaceNode, 'geometry_opacity', 1);
  const thinFilmWeight = helpers.getInputNode(surfaceNode, 'thin_film_weight', 0);
  const thinFilmThicknessMicrometers = helpers.getInputNode(surfaceNode, 'thin_film_thickness', 0);
  const thinFilmIor = helpers.getInputNode(surfaceNode, 'thin_film_ior', 1.4);
  const emissionColor = helpers.getInputNode(surfaceNode, 'emission_color', [1, 1, 1]);
  const emissionLuminance = helpers.getInputNode(surfaceNode, 'emission_luminance', 0);

  const colorNode = multiplyNodeValues(baseColor, baseWeight);
  const sheenNode =
    (fuzzColor as { mul?: (other: unknown) => unknown }).mul?.(fuzz) ?? mul(fuzzColor as never, fuzz as never);
  const sheenRoughnessNode =
    typeof fuzzRoughness === 'number' ? Math.pow(fuzzRoughness, 2.5) : pow(fuzzRoughness as never, 2.5 as never);
  const emissiveNode =
    (emissionColor as { mul?: (other: unknown) => unknown }).mul?.(emissionLuminance) ??
    mul(emissionColor as never, emissionLuminance as never);
  const thinFilmThicknessNanometers = mul(thinFilmThicknessMicrometers as never, 1000 as never);

  const thicknessNode = applyThinWalledThickness(geometryThinWalled, transmissionDepth);
  const coatEnabled = isEnabledWeightNode(coat);
  const fuzzEnabled = isEnabledWeightNode(fuzz);
  const transmissionEnabled = isEnabledWeightNode(transmission);
  const thinFilmEnabled = isEnabledWeightNode(thinFilmWeight);
  const anisotropyEnabled = !isEffectivelyZero(anisotropy);

  const assignments: MaterialSlotAssignments = {
    colorNode,
    roughnessNode: roughness,
    specularColorNode: specularColor,
    emissiveNode,
    normalNode: normal,
  };

  if (!isEffectivelyZero(metalness)) assignments.metalnessNode = metalness;
  if (!isEffectivelyOne(specular)) assignments.specularIntensityNode = specular;
  if (!isConstNear(ior, 1.5)) assignments.iorNode = ior;
  if (anisotropyEnabled) {
    assignments.anisotropyNode = anisotropy;
    assignments.anisotropyRotation = 0;
  }
  if (coatEnabled) {
    assignments.clearcoatNode = coat;
    if (!isEffectivelyZero(coatRoughness)) assignments.clearcoatRoughnessNode = coatRoughness;
    assignments.clearcoatNormalNode = coatNormal;
  }
  if (fuzzEnabled) {
    assignments.sheenNode = sheenNode;
    if (!isConstNear(fuzzRoughness, 0.5)) assignments.sheenRoughnessNode = sheenRoughnessNode;
  }
  if (!isEffectivelyOne(opacity)) assignments.opacityNode = opacity;
  if (transmissionEnabled) {
    assignments.transmissionNode = transmission;
    assignments.attenuationColorNode = transmissionColor;
    if (thicknessNode !== undefined && !isEffectivelyZero(thicknessNode)) {
      assignments.thicknessNode = thicknessNode;
      assignments.attenuationDistanceNode = transmissionDepth;
    }
    if (dispersion !== undefined && !isEffectivelyZero(dispersion)) assignments.dispersionNode = dispersion;
  }
  if (thinFilmEnabled) {
    assignments.iridescenceNode = thinFilmWeight;
    if (!isConstNear(thinFilmIor, 1.4)) assignments.iridescenceIORNode = thinFilmIor;
    if (!isEffectivelyZero(thinFilmThicknessMicrometers)) assignments.iridescenceThicknessNode = thinFilmThicknessNanometers;
  }

  return assignments;
};
