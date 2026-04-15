import type { MaterialXDocument, MaterialXNode } from '@materialx-js/materialx';
import type { CompileContext } from './internal-types.js';

export const warn = (context: CompileContext, warning: CompileContext['warnings'][number]): void => {
  context.warnings.push(warning);
};

export const getCoveredCategories = (document: MaterialXDocument): Set<string> => {
  const categories = new Set<string>();
  for (const node of document.nodes) {
    categories.add(node.category);
  }
  for (const graph of document.nodeGraphs) {
    for (const node of graph.nodes) {
      categories.add(node.category);
    }
  }
  return categories;
};

export const toScalar = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number.isFinite(Number.parseFloat(value)) ? Number.parseFloat(value) : undefined;
  }
  return undefined;
};

const readInput = (node: MaterialXNode, name: string) => node.inputs.find((entry) => entry.name === name);

const readScalarInput = (node: MaterialXNode, name: string): number | undefined => {
  const input = readInput(node, name);
  if (!input) {
    return undefined;
  }
  return toScalar(input.value ?? input.attributes.value);
};

export const warnOpenPbrLimitations = (surfaceNode: MaterialXNode, context: CompileContext): void => {
  const unsupportedLobeInputs: Array<{ name: string; expected?: number }> = [
    { name: 'subsurface_weight', expected: 0 },
    { name: 'transmission_scatter_anisotropy', expected: 0 },
    { name: 'transmission_dispersion_scale', expected: 0 },
    { name: 'coat_darkening', expected: 1 },
  ];

  const activeUnsupportedInputs = unsupportedLobeInputs.filter((entry) => {
    const value = readScalarInput(surfaceNode, entry.name);
    if (value === undefined) {
      return false;
    }
    if (entry.expected === undefined) {
      return true;
    }
    return Math.abs(value - entry.expected) > Number.EPSILON;
  });

  if (activeUnsupportedInputs.length === 0) {
    return;
  }

  warn(context, {
    code: 'unsupported-node',
    category: surfaceNode.category,
    nodeName: surfaceNode.name,
    message: `OpenPBR inputs currently map to core MeshPhysical slots only; advanced lobes are ignored (${activeUnsupportedInputs
      .map((entry) => entry.name)
      .join(', ')})`,
  });
};

export const warnGltfPbrLimitations = (surfaceNode: MaterialXNode, context: CompileContext): void => {
  const unsupportedInputs = ['occlusion', 'tangent', 'dispersion', 'thickness'];
  const activeUnsupportedInputs = unsupportedInputs.filter((name) => {
    const input = readInput(surfaceNode, name);
    if (!input) {
      return false;
    }
    return input.value !== undefined || input.attributes.value !== undefined || input.attributes.nodename || input.attributes.nodegraph;
  });

  if (activeUnsupportedInputs.length === 0) {
    return;
  }

  warn(context, {
    code: 'unsupported-node',
    nodeName: surfaceNode.name,
    message: `glTF PBR inputs currently map to core MeshPhysical slots only; these inputs are ignored (${activeUnsupportedInputs.join(', ')})`,
  });
};
