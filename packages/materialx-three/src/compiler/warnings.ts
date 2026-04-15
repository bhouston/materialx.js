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

const warnIgnoredSurfaceInputs = (
  surfaceNode: MaterialXNode,
  mappedInputs: ReadonlySet<string>,
  context: CompileContext
): void => {
  const authoredInputs = [...new Set(surfaceNode.inputs.map((input) => input.name))];
  for (const inputName of authoredInputs) {
    if (mappedInputs.has(inputName)) {
      continue;
    }
    warn(context, {
      code: 'unsupported-node',
      category: surfaceNode.category,
      nodeName: surfaceNode.name,
      message: `${surfaceNode.category} input "${inputName}" is currently ignored in the MaterialX to Three.js TSL translation`,
    });
  }
};

const mappedStandardSurfaceInputs = new Set<string>([
  'base',
  'base_color',
  'specular_roughness',
  'metalness',
  'specular',
  'specular_color',
  'specular_anisotropy',
  'specular_rotation',
  'coat',
  'coat_color',
  'coat_roughness',
  'coat_normal',
  'sheen',
  'sheen_color',
  'sheen_roughness',
  'emission',
  'emission_color',
  'opacity',
  'transmission',
  'transmission_color',
  'transmission_depth',
  'specular_IOR',
  'ior',
  'thin_film_thickness',
  'thin_film_IOR',
  'thin_film_ior',
  'normal',
]);

const mappedOpenPbrInputs = new Set<string>([
  'base_weight',
  'base_color',
  'specular_roughness',
  'base_metalness',
  'specular_weight',
  'specular_color',
  'specular_roughness_anisotropy',
  'coat_weight',
  'coat_roughness',
  'geometry_coat_normal',
  'fuzz_weight',
  'fuzz_color',
  'fuzz_roughness',
  'transmission_weight',
  'transmission_color',
  'transmission_depth',
  'transmission_dispersion_scale',
  'transmission_dispersion_abbe_number',
  'specular_ior',
  'geometry_normal',
  'geometry_opacity',
  'thin_film_weight',
  'thin_film_thickness',
  'thin_film_ior',
  'emission_color',
  'emission_luminance',
]);

const mappedGltfPbrInputs = new Set<string>([
  'base_color',
  'occlusion',
  'roughness',
  'metallic',
  'normal',
  'transmission',
  'specular',
  'specular_color',
  'ior',
  'alpha',
  'alpha_mode',
  'alpha_cutoff',
  'iridescence',
  'iridescence_ior',
  'iridescence_thickness',
  'sheen_color',
  'sheen_roughness',
  'clearcoat',
  'clearcoat_roughness',
  'clearcoat_normal',
  'emissive',
  'emissive_strength',
  'attenuation_distance',
  'attenuation_color',
  'thickness',
  'dispersion',
  'anisotropy_strength',
  'anisotropy_rotation',
]);

export const warnStandardSurfaceLimitations = (surfaceNode: MaterialXNode, context: CompileContext): void =>
  warnIgnoredSurfaceInputs(surfaceNode, mappedStandardSurfaceInputs, context);

export const warnOpenPbrLimitations = (surfaceNode: MaterialXNode, context: CompileContext): void =>
  warnIgnoredSurfaceInputs(surfaceNode, mappedOpenPbrInputs, context);

export const warnGltfPbrLimitations = (surfaceNode: MaterialXNode, context: CompileContext): void =>
  warnIgnoredSurfaceInputs(surfaceNode, mappedGltfPbrInputs, context);
