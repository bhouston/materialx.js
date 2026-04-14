import type { MaterialXNode } from '@materialx-js/materialx';
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
  const emissionColor = helpers.getInputNode(surfaceNode, 'emission_color', [0, 0, 0]);
  const emissionAmount = helpers.getInputNode(surfaceNode, 'emission', 0);
  const transmission = helpers.getInputNode(surfaceNode, 'transmission', 0);
  const ior = helpers.getInputNode(surfaceNode, 'specular_IOR', 1.5);
  const normal = helpers.getInputNode(surfaceNode, 'normal', undefined);

  const colorNode = (baseColor as { mul?: (other: unknown) => unknown }).mul?.(base) ?? baseColor;
  const emissiveNode = (emissionColor as { mul?: (other: unknown) => unknown }).mul?.(emissionAmount) ?? emissionColor;

  return {
    colorNode,
    roughnessNode: roughness,
    metalnessNode: metalness,
    emissiveNode,
    transmissionNode: transmission,
    iorNode: ior,
    normalNode: normal,
  };
};
