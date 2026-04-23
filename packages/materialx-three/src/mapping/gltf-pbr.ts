import type { MaterialXNode } from '@materialx-js/materialx';
import { mul, step } from 'three/tsl';
import type { MaterialSlotAssignments } from '../types.js';

export interface GltfPbrSurfaceInputs {
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

const multiplyNodeValues = (left: unknown, right: unknown): unknown =>
  (left as { mul?: (other: unknown) => unknown }).mul?.(right) ?? mul(left as never, right as never);

const toAttenuationDistance = (distance: unknown, hasAttenuationColorInput: boolean): unknown => {
  if (distance === undefined) {
    // When attenuation tint is authored without a distance, default to a
    // finite value so absorption tinting is visible.
    return hasAttenuationColorInput ? 1 : undefined;
  }
  if (typeof distance === 'number') {
    return distance > 0 ? distance : undefined;
  }
  return distance;
};

const buildOpacityNode = (alpha: unknown, alphaMode: unknown, alphaCutoff: unknown): unknown => {
  if (typeof alphaMode === 'number' && Math.round(alphaMode) === 1) {
    // Approximate glTF MASK mode by converting alpha into a 0/1 coverage signal.
    return step(alphaCutoff as never, alpha as never);
  }
  return alpha;
};

const toIridescenceThicknessNode = (value: unknown): unknown => {
  if (typeof value === 'number') {
    return value;
  }
  // MaterialX glTF thickness is authored in nanometers already.
  return value;
};

export const buildGltfPbrSurfaceAssignments = (
  surfaceNode: MaterialXNode,
  helpers: GltfPbrSurfaceInputs,
): MaterialSlotAssignments => {
  const hasInput = (name: string) => surfaceNode.inputs.some((input) => input.name === name);
  const baseColor = helpers.getInputNode(surfaceNode, 'base_color', [1, 1, 1]);
  const occlusion = hasInput('occlusion') ? helpers.getInputNode(surfaceNode, 'occlusion', 1) : undefined;
  const roughness = helpers.getInputNode(surfaceNode, 'roughness', 1);
  const metallic = helpers.getInputNode(surfaceNode, 'metallic', 1);
  const normal = helpers.getInputNode(surfaceNode, 'normal', undefined);
  const transmission = hasInput('transmission') ? helpers.getInputNode(surfaceNode, 'transmission', 0) : undefined;
  const specular = helpers.getInputNode(surfaceNode, 'specular', 1);
  const specularColor = helpers.getInputNode(surfaceNode, 'specular_color', [1, 1, 1]);
  const ior = helpers.getInputNode(surfaceNode, 'ior', 1.5);
  const alpha = helpers.getInputNode(surfaceNode, 'alpha', 1);
  const alphaMode = helpers.getInputNode(surfaceNode, 'alpha_mode', 0);
  const alphaCutoff = helpers.getInputNode(surfaceNode, 'alpha_cutoff', 0.5);
  const iridescence = helpers.getInputNode(surfaceNode, 'iridescence', 0);
  const iridescenceIor = helpers.getInputNode(surfaceNode, 'iridescence_ior', 1.3);
  const iridescenceThickness = helpers.getInputNode(surfaceNode, 'iridescence_thickness', 100);
  const sheenColor = helpers.getInputNode(surfaceNode, 'sheen_color', [0, 0, 0]);
  const sheenRoughness = helpers.getInputNode(surfaceNode, 'sheen_roughness', 0);
  const clearcoat = helpers.getInputNode(surfaceNode, 'clearcoat', 0);
  const clearcoatRoughness = helpers.getInputNode(surfaceNode, 'clearcoat_roughness', 0);
  const clearcoatNormal = helpers.getInputNode(surfaceNode, 'clearcoat_normal', undefined);
  const emissiveColor = helpers.getInputNode(surfaceNode, 'emissive', [0, 0, 0]);
  const emissiveStrength = helpers.getInputNode(surfaceNode, 'emissive_strength', 1);
  const attenuationDistance = hasInput('attenuation_distance')
    ? helpers.getInputNode(surfaceNode, 'attenuation_distance', undefined)
    : undefined;
  const attenuationColor = helpers.getInputNode(surfaceNode, 'attenuation_color', [1, 1, 1]);
  const thickness = hasInput('thickness') ? helpers.getInputNode(surfaceNode, 'thickness', 0) : undefined;
  const dispersion = hasInput('dispersion') ? helpers.getInputNode(surfaceNode, 'dispersion', 0) : undefined;
  const anisotropyStrength = hasInput('anisotropy_strength')
    ? helpers.getInputNode(surfaceNode, 'anisotropy_strength', 0)
    : undefined;
  const anisotropyRotation = hasInput('anisotropy_rotation')
    ? helpers.getInputNode(surfaceNode, 'anisotropy_rotation', 0)
    : undefined;

  const emissiveNode = multiplyNodeValues(emissiveColor, emissiveStrength);
  const opacityNode = buildOpacityNode(alpha, alphaMode, alphaCutoff);
  const attenuationDistanceNode = toAttenuationDistance(attenuationDistance, hasInput('attenuation_color'));
  const iridescenceThicknessNode = toIridescenceThicknessNode(iridescenceThickness);
  const transmissionEnabled = isEnabledWeightNode(transmission);
  const clearcoatEnabled = isEnabledWeightNode(clearcoat);
  const sheenEnabled = hasInput('sheen_color') || isEnabledWeightNode(sheenRoughness);
  const iridescenceEnabled = isEnabledWeightNode(iridescence);
  const anisotropyEnabled = !isEffectivelyZero(anisotropyStrength) || !isEffectivelyZero(anisotropyRotation);

  const assignments: MaterialSlotAssignments = {
    colorNode: baseColor,
    aoNode: occlusion,
    roughnessNode: roughness,
    metalnessNode: metallic,
    specularColorNode: specularColor,
    normalNode: normal,
    emissiveNode,
    attenuationColorNode: attenuationColor,
    attenuationDistanceNode,
  };

  if (!isEffectivelyOne(specular)) assignments.specularIntensityNode = specular;
  if (!isConstNear(ior, 1.5)) assignments.iorNode = ior;
  if (!isEffectivelyOne(opacityNode)) assignments.opacityNode = opacityNode;
  if (anisotropyEnabled) {
    assignments.anisotropyNode = anisotropyStrength;
    assignments.anisotropyRotation = anisotropyRotation;
  }
  if (clearcoatEnabled) {
    assignments.clearcoatNode = clearcoat;
    if (!isEffectivelyZero(clearcoatRoughness)) assignments.clearcoatRoughnessNode = clearcoatRoughness;
    assignments.clearcoatNormalNode = clearcoatNormal;
  }
  if (sheenEnabled) {
    assignments.sheenNode = sheenColor;
    assignments.sheenColorNode = sheenColor;
    if (!isEffectivelyZero(sheenRoughness)) assignments.sheenRoughnessNode = sheenRoughness;
  }
  if (transmissionEnabled) assignments.transmissionNode = transmission;
  if (thickness !== undefined && !isEffectivelyZero(thickness)) assignments.thicknessNode = thickness;
  if (dispersion !== undefined && !isEffectivelyZero(dispersion)) assignments.dispersionNode = dispersion;
  if (iridescenceEnabled) {
    assignments.iridescenceNode = iridescence;
    if (!isConstNear(iridescenceIor, 1.3)) assignments.iridescenceIORNode = iridescenceIor;
    if (!isConstNear(iridescenceThicknessNode, 100)) assignments.iridescenceThicknessNode = iridescenceThicknessNode;
  }

  return assignments;
};
