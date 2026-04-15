import type { MaterialXDocument } from '@materialx-js/materialx';
import { Color } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import type { MaterialXThreeCompileOptions, MaterialXThreeCompileResult } from '../types.js';
import { compileMaterialXToTSL } from './compile-material.js';

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

export const createThreeMaterialFromDocument = (
  document: MaterialXDocument,
  options: MaterialXThreeCompileOptions = {}
): { material: MeshPhysicalNodeMaterial; result: MaterialXThreeCompileResult } => {
  const result = compileMaterialXToTSL(document, options);
  const material = new MeshPhysicalNodeMaterial();
  const opacityAssignment = result.assignments.opacityNode;
  const transmissionAssignment = result.assignments.transmissionNode;
  const hasTransmission =
    transmissionAssignment !== undefined && (typeof transmissionAssignment !== 'number' || transmissionAssignment > 0.0001);
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
