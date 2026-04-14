import type { MaterialXNode } from '@materialx-js/materialx';
import { mix, mul, step, vec3 } from 'three/tsl';
import type { MaterialSlotAssignments } from '../types.js';

export interface StandardSurfaceInputs {
  getInputNode(node: MaterialXNode, name: string, fallback: unknown): unknown;
}

export const buildStandardSurfaceAssignments = (
  surfaceNode: MaterialXNode,
  helpers: StandardSurfaceInputs
): MaterialSlotAssignments => {
  const base = helpers.getInputNode(surfaceNode, 'base', 1);
  const baseColor = helpers.getInputNode(surfaceNode, 'base_color', [0.8, 0.8, 0.8]);
  const roughness = helpers.getInputNode(surfaceNode, 'specular_roughness', 0.2);
  const metalness = helpers.getInputNode(surfaceNode, 'metalness', 0);
  const coat = helpers.getInputNode(surfaceNode, 'coat', 0);
  const coatColor = helpers.getInputNode(surfaceNode, 'coat_color', [1, 1, 1]);
  const coatRoughness = helpers.getInputNode(surfaceNode, 'coat_roughness', 0.1);
  const emissionColor = helpers.getInputNode(surfaceNode, 'emission_color', [0, 0, 0]);
  const emissionAmount = helpers.getInputNode(surfaceNode, 'emission', 0);
  const transmission = helpers.getInputNode(surfaceNode, 'transmission', 0);
  const ior = helpers.getInputNode(surfaceNode, 'specular_IOR', 1.5);
  const thinFilmThickness = helpers.getInputNode(surfaceNode, 'thin_film_thickness', 0);
  const thinFilmIOR = helpers.getInputNode(
    surfaceNode,
    'thin_film_IOR',
    helpers.getInputNode(surfaceNode, 'thin_film_ior', 1.3)
  );
  const normal = helpers.getInputNode(surfaceNode, 'normal', undefined);

  const baseLayerColor = mul(baseColor as never, base as never);
  // StandardSurface copper/brass examples tint via coat_color even when base_color is white.
  const coatTint = mix(vec3(1, 1, 1), coatColor as never, coat as never);
  const colorNode = mul(baseLayerColor as never, coatTint as never);
  const emissiveNode = (emissionColor as { mul?: (other: unknown) => unknown }).mul?.(emissionAmount) ?? emissionColor;
  // StandardSurface has no explicit thin-film weight. Derive a 0/1 iridescence
  // enable signal from thickness so this aligns with glTF/Three semantics.
  const thinFilmEnabled = step(0.0001, thinFilmThickness as never);

  return {
    colorNode,
    roughnessNode: roughness,
    metalnessNode: metalness,
    clearcoatNode: coat,
    clearcoatRoughnessNode: coatRoughness,
    emissiveNode,
    transmissionNode: transmission,
    iorNode: ior,
    iridescenceNode: thinFilmEnabled,
    iridescenceIORNode: thinFilmIOR,
    iridescenceThicknessNode: thinFilmThickness,
    normalNode: normal,
  };
};
