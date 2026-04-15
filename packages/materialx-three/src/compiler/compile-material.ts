import type { MaterialXDocument, MaterialXNode, MaterialXNodeGraph } from '@materialx-js/materialx';
import { buildGraphIndex, resolveInputReference } from '../graph/resolve.js';
import { buildGltfPbrSurfaceAssignments } from '../mapping/gltf-pbr.js';
import { supportedNodeCategories } from '../mapping/mx-node-map.js';
import { buildOpenPbrSurfaceAssignments } from '../mapping/open-pbr-surface.js';
import { buildStandardSurfaceAssignments } from '../mapping/standard-surface.js';
import type { MaterialXThreeCompileOptions, MaterialXThreeCompileResult, MaterialXThreeWarning } from '../types.js';
import { resolveInputNode } from './compile-node.js';
import type { CompileContext } from './internal-types.js';
import { readInput } from './inputs.js';
import { getCoveredCategories, warnGltfPbrLimitations, warnOpenPbrLimitations, warnStandardSurfaceLimitations } from './warnings.js';

const findMaterialNode = (document: MaterialXDocument, materialName?: string): MaterialXNode | undefined => {
  const materials = document.nodes.filter((node) => node.category === 'surfacematerial');
  if (materials.length === 0) {
    return undefined;
  }
  if (!materialName) {
    return materials[0];
  }
  return materials.find((node) => node.name === materialName);
};

const resolveSurfaceShaderNode = (
  materialNode: MaterialXNode,
  context: CompileContext
): { node: MaterialXNode; scopeGraph?: MaterialXNodeGraph } | undefined => {
  const surfaceInput = readInput(materialNode, 'surfaceshader');
  if (!surfaceInput) {
    return undefined;
  }
  const reference = resolveInputReference(surfaceInput, undefined, context.index);
  if (!reference?.fromNode) {
    return undefined;
  }
  return {
    node: reference.fromNode,
    scopeGraph: reference.fromGraph,
  };
};

export const compileMaterialXToTSL = (
  document: MaterialXDocument,
  options: MaterialXThreeCompileOptions = {}
): MaterialXThreeCompileResult => {
  const warnings: MaterialXThreeWarning[] = [];
  const context: CompileContext = {
    document,
    warnings,
    index: buildGraphIndex(document),
    options,
    cache: new Map(),
  };

  const materialNode = findMaterialNode(document, options.materialName);
  if (!materialNode) {
    warnings.push({
      code: 'missing-material',
      message: options.materialName
        ? `Could not find surfacematerial named "${options.materialName}"`
        : 'Document does not include a surfacematerial node',
    });
    return {
      assignments: {},
      warnings,
      supportedCategories: [],
      unsupportedCategories: [],
    };
  }

  const surfaceShader = resolveSurfaceShaderNode(materialNode, context);
  if (!surfaceShader || !['standard_surface', 'open_pbr_surface', 'gltf_pbr'].includes(surfaceShader.node.category)) {
    warnings.push({
      code: 'unsupported-node',
      message: 'Only standard_surface, open_pbr_surface, and gltf_pbr are supported for surfacematerial compilation',
      category: surfaceShader?.node.category,
      nodeName: surfaceShader?.node.name,
    });
    return {
      materialName: materialNode.name,
      assignments: {},
      warnings,
      supportedCategories: [],
      unsupportedCategories: [],
    };
  }

  const getInputNode = (node: MaterialXNode, name: string, fallback: unknown): unknown =>
    resolveInputNode(node, name, fallback, context, surfaceShader.scopeGraph);

  const assignments =
    surfaceShader.node.category === 'standard_surface'
      ? buildStandardSurfaceAssignments(surfaceShader.node, { getInputNode })
      : surfaceShader.node.category === 'open_pbr_surface'
        ? buildOpenPbrSurfaceAssignments(surfaceShader.node, { getInputNode })
        : buildGltfPbrSurfaceAssignments(surfaceShader.node, { getInputNode });

  if (surfaceShader.node.category === 'standard_surface') {
    warnStandardSurfaceLimitations(surfaceShader.node, context);
  } else if (surfaceShader.node.category === 'open_pbr_surface') {
    warnOpenPbrLimitations(surfaceShader.node, context);
  } else {
    warnGltfPbrLimitations(surfaceShader.node, context);
  }

  const coveredCategories = getCoveredCategories(document);
  const supportedCategories = [...coveredCategories].filter((entry) => supportedNodeCategories.has(entry)).sort();
  const unsupportedCategories = [...coveredCategories].filter((entry) => !supportedNodeCategories.has(entry)).sort();

  return {
    materialName: materialNode.name,
    surfaceShaderName: surfaceShader.node.name,
    assignments,
    warnings,
    supportedCategories,
    unsupportedCategories,
  };
};
