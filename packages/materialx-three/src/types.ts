import type { MaterialXDocument, MaterialXNode } from '@materialx-js/materialx';
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
  roughnessNode?: unknown;
  metalnessNode?: unknown;
  clearcoatNode?: unknown;
  clearcoatRoughnessNode?: unknown;
  normalNode?: unknown;
  emissiveNode?: unknown;
  transmissionNode?: unknown;
  iorNode?: unknown;
  iridescenceNode?: unknown;
  iridescenceIORNode?: unknown;
  iridescenceThicknessNode?: unknown;
}

export interface MaterialXThreeCompileResult {
  materialName?: string;
  surfaceShaderName?: string;
  assignments: MaterialSlotAssignments;
  warnings: MaterialXThreeWarning[];
  supportedCategories: string[];
  unsupportedCategories: string[];
}
