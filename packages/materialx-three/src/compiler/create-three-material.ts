import type { MaterialXDocument } from '@material-viewer/materialx';
import { Color } from 'three';
import { cos, float, mul, sin, vec2 } from 'three/tsl';
import { DoubleSide, MeshPhysicalNodeMaterial } from 'three/webgpu';
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
  options: MaterialXThreeCompileOptions = {},
): { material: MeshPhysicalNodeMaterial; result: MaterialXThreeCompileResult } => {
  const result = compileMaterialXToTSL(document, options);
  const material = new MeshPhysicalNodeMaterial();
  const opacityAssignment = result.assignments.opacityNode;
  const transmissionAssignment = result.assignments.transmissionNode;
  const gltfAlphaMode = result.assignments.gltfAlphaMode;
  const gltfAlphaCutoffAssignment = result.assignments.gltfAlphaCutoffNode;
  const isAlphaMaskMode = gltfAlphaMode === 'mask';
  const isAlphaBlendMode = gltfAlphaMode === 'blend';
  const opacityLiteral = readNumberLiteral(opacityAssignment);
  const transmissionLiteral = readNumberLiteral(transmissionAssignment);
  const hasTransmission =
    transmissionAssignment !== undefined && (transmissionLiteral === undefined ? true : transmissionLiteral > 0);
  const hasFractionalOpacity =
    opacityAssignment !== undefined && (opacityLiteral === undefined ? true : opacityLiteral < 0.9999);
  const materialWithExtraNodes = material as MeshPhysicalNodeMaterial & {
    transmissionColorNode?: unknown;
  };

  material.color = new Color(1, 1, 1);
  material.colorNode = result.assignments.colorNode as never;
  if (result.assignments.aoNode !== undefined) {
    material.aoNode = result.assignments.aoNode as never;
  }
  material.roughnessNode = result.assignments.roughnessNode as never;
  material.metalnessNode = result.assignments.metalnessNode as never;
  material.specularIntensityNode = result.assignments.specularIntensityNode as never;
  material.specularColorNode = result.assignments.specularColorNode as never;
  const anisotropyStrengthAssignment = result.assignments.anisotropyNode;
  const anisotropyRotationAssignment = result.assignments.anisotropyRotation;
  if (anisotropyStrengthAssignment !== undefined || anisotropyRotationAssignment !== undefined) {
    const anisotropyStrengthNode =
      anisotropyStrengthAssignment === undefined
        ? float(0)
        : typeof anisotropyStrengthAssignment === 'number'
          ? float(anisotropyStrengthAssignment)
          : (anisotropyStrengthAssignment as never);
    const anisotropyRotationNode =
      anisotropyRotationAssignment === undefined
        ? float(0)
        : typeof anisotropyRotationAssignment === 'number'
          ? float(anisotropyRotationAssignment)
          : (anisotropyRotationAssignment as never);
    const anisotropyDirection = vec2(
      cos(anisotropyRotationNode as never) as never,
      sin(anisotropyRotationNode as never) as never,
    );

    // Encode anisotropy direction directly in the vector assignment.
    material.anisotropyNode = mul(anisotropyDirection as never, anisotropyStrengthNode as never) as never;

    // Avoid a second rotation pass from MeshPhysicalMaterial defaults/properties.
    material.anisotropyRotation = 0;
  }
  material.clearcoatNode = result.assignments.clearcoatNode as never;
  material.clearcoatRoughnessNode = result.assignments.clearcoatRoughnessNode as never;
  material.clearcoatNormalNode = result.assignments.clearcoatNormalNode as never;
  material.sheenNode = result.assignments.sheenNode as never;
  material.sheenRoughnessNode = result.assignments.sheenRoughnessNode as never;
  material.normalNode = result.assignments.normalNode as never;
  material.emissiveNode = result.assignments.emissiveNode as never;
  material.opacityNode = opacityAssignment as never;
  const shouldUseOpacityBlending = isAlphaBlendMode || gltfAlphaMode === undefined;
  material.transparent = hasTransmission ? true : shouldUseOpacityBlending && hasFractionalOpacity;
  if (isAlphaMaskMode) {
    if (gltfAlphaCutoffAssignment !== undefined) {
      material.alphaTestNode =
        (typeof gltfAlphaCutoffAssignment === 'number' ? float(gltfAlphaCutoffAssignment) : gltfAlphaCutoffAssignment) as never;
    }
    const alphaCutoffLiteral = readNumberLiteral(gltfAlphaCutoffAssignment);
    if (alphaCutoffLiteral !== undefined) {
      material.alphaTest = alphaCutoffLiteral;
    } else {
      material.alphaTest = 0.5;
    }
  }
  material.transmissionNode = transmissionAssignment as never;
  if (result.assignments.thicknessNode !== undefined) {
    material.thicknessNode = result.assignments.thicknessNode as never;
  } else if (hasTransmission) {
    // Default transmissive materials to non-zero volume so attenuation/tint
    // can participate even when source data omits explicit thickness.
    material.thickness = 1;
  }
  if (result.assignments.dispersionNode !== undefined) {
    material.dispersionNode = result.assignments.dispersionNode as never;
  }
  if (hasTransmission) {
    // Keep the non-node scalar enabled so Three routes the material through
    // its transmission render path in both WebGL and WebGPU backends.
    material.side = DoubleSide;
    material.transmission = transmissionLiteral ?? 1;
    material.opacity = 1;
  } else if (shouldUseOpacityBlending && opacityLiteral !== undefined) {
    material.opacity = opacityLiteral;
  } else {
    material.opacity = 1;
  }
  materialWithExtraNodes.transmissionColorNode =
    (result.assignments.transmissionColorNode ?? result.assignments.attenuationColorNode) as never;
  material.attenuationColorNode = result.assignments.attenuationColorNode as never;
  material.attenuationDistanceNode = result.assignments.attenuationDistanceNode as never;
  material.iorNode = result.assignments.iorNode as never;
  material.iridescenceNode = result.assignments.iridescenceNode as never;
  material.iridescenceIORNode = result.assignments.iridescenceIORNode as never;
  material.iridescenceThicknessNode = result.assignments.iridescenceThicknessNode as never;

  return { material, result };
};
