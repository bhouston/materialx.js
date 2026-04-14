import type { MaterialXNode } from '@materialx-js/materialx';
import { mul } from 'three/tsl';
import type { MaterialSlotAssignments } from '../types.js';

export interface OpenPbrSurfaceInputs {
  getInputNode(node: MaterialXNode, name: string, fallback: unknown): unknown;
}

export const buildOpenPbrSurfaceAssignments = (
  surfaceNode: MaterialXNode,
  helpers: OpenPbrSurfaceInputs
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
  const transmissionColor = hasInput('transmission_color')
    ? helpers.getInputNode(surfaceNode, 'transmission_color', [1, 1, 1])
    : undefined;
  const transmissionDepth = hasInput('transmission_depth')
    ? helpers.getInputNode(surfaceNode, 'transmission_depth', undefined)
    : undefined;
  const ior = helpers.getInputNode(surfaceNode, 'specular_ior', 1.5);
  const normal = helpers.getInputNode(surfaceNode, 'geometry_normal', undefined);
  const opacity = helpers.getInputNode(surfaceNode, 'geometry_opacity', undefined);
  const thinFilmWeight = helpers.getInputNode(surfaceNode, 'thin_film_weight', 0);
  const thinFilmThicknessMicrometers = helpers.getInputNode(surfaceNode, 'thin_film_thickness', 0);
  const thinFilmIor = helpers.getInputNode(surfaceNode, 'thin_film_ior', 1.4);
  const emissionColor = helpers.getInputNode(surfaceNode, 'emission_color', [1, 1, 1]);
  const emissionLuminance = helpers.getInputNode(surfaceNode, 'emission_luminance', 0);

  const colorNode = (baseColor as { mul?: (other: unknown) => unknown }).mul?.(baseWeight) ?? mul(baseColor as never, baseWeight as never);
  const sheenNode = (fuzzColor as { mul?: (other: unknown) => unknown }).mul?.(fuzz) ?? mul(fuzzColor as never, fuzz as never);
  const emissiveNode =
    (emissionColor as { mul?: (other: unknown) => unknown }).mul?.(emissionLuminance) ??
    mul(emissionColor as never, emissionLuminance as never);
  const thinFilmThicknessNanometers = mul(thinFilmThicknessMicrometers as never, 1000 as never);

  return {
    colorNode,
    roughnessNode: roughness,
    metalnessNode: metalness,
    specularIntensityNode: specular,
    specularColorNode: specularColor,
    anisotropyNode: anisotropy,
    clearcoatNode: coat,
    clearcoatRoughnessNode: coatRoughness,
    clearcoatNormalNode: coatNormal,
    sheenNode,
    sheenRoughnessNode: fuzzRoughness,
    emissiveNode,
    opacityNode: opacity,
    transmissionNode: transmission,
    attenuationColorNode: transmissionColor,
    attenuationDistanceNode: transmissionDepth,
    iorNode: ior,
    iridescenceNode: thinFilmWeight,
    iridescenceIORNode: thinFilmIor,
    iridescenceThicknessNode: thinFilmThicknessNanometers,
    normalNode: normal,
  };
};
