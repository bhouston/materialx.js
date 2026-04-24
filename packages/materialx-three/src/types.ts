import type { MaterialXDocument, MaterialXNode } from '@material-viewer/materialx';
import type { Texture } from 'three';

export interface MaterialXThreeWarning {
  code: 'unsupported-node' | 'missing-reference' | 'missing-material' | 'invalid-value';
  message: string;
  category?: string;
  nodeName?: string;
}

export interface TextureResolverContext {
  document: MaterialXDocument;
  material?: MaterialXNode;
  node?: MaterialXNode;
}

export interface TextureResolver {
  resolve(uri: string, context: TextureResolverContext): Texture;
}

export interface MaterialXThreeCompileOptions {
  materialName?: string;
  basePath?: string;
  textureResolver?: TextureResolver;
}

export interface MaterialSlotAssignments {
  colorNode?: unknown;
  aoNode?: unknown;
  roughnessNode?: unknown;
  metalnessNode?: unknown;
  specularIntensityNode?: unknown;
  specularColorNode?: unknown;
  anisotropyNode?: unknown;
  anisotropyRotation?: unknown;
  clearcoatNode?: unknown;
  clearcoatRoughnessNode?: unknown;
  clearcoatNormalNode?: unknown;
  sheenNode?: unknown;
  sheenRoughnessNode?: unknown;
  normalNode?: unknown;
  emissiveNode?: unknown;
  opacityNode?: unknown;
  transmissionNode?: unknown;
  transmissionColorNode?: unknown;
  thicknessNode?: unknown;
  dispersionNode?: unknown;
  attenuationColorNode?: unknown;
  attenuationDistanceNode?: unknown;
  iorNode?: unknown;
  iridescenceNode?: unknown;
  iridescenceIORNode?: unknown;
  iridescenceThicknessNode?: unknown;
  gltfAlphaMode?: 'opaque' | 'mask' | 'blend';
  gltfAlphaCutoffNode?: unknown;
}

export interface MaterialXThreeCompileResult {
  materialName?: string;
  surfaceShaderName?: string;
  assignments: MaterialSlotAssignments;
  warnings: MaterialXThreeWarning[];
  supportedCategories: string[];
  unsupportedCategories: string[];
}
