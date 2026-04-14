export interface MaterialXSamplePack {
  id: string;
  label: string;
  description: string;
  directory: string;
  materialFile: string;
  assets: string[];
  infoFile: string;
}

export const materialXSamplePacks: MaterialXSamplePack[] = [
  {
    id: 'simple-standard-surface',
    label: 'Simple Standard Surface',
    description: 'Constant color and roughness baseline',
    directory: 'simple-standard-surface',
    materialFile: 'material.mtlx',
    assets: ['swatch.svg'],
    infoFile: 'info.txt',
  },
  {
    id: 'textured-standard-surface',
    label: 'Textured Standard Surface',
    description: 'Tiled textures for base color and roughness',
    directory: 'textured-standard-surface',
    materialFile: 'material.mtlx',
    assets: ['checker.svg', 'roughness.svg'],
    infoFile: 'info.txt',
  },
  {
    id: 'graph-standard-surface',
    label: 'Graph Mix with Texture',
    description: 'Nodegraph mix driven by a texture mask',
    directory: 'graph-standard-surface',
    materialFile: 'material.mtlx',
    assets: ['mask.svg'],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-brass-tiled',
    label: 'Standard Surface Brass Tiled',
    description: 'Upstream MaterialX standard_surface_brass_tiled',
    directory: 'standard_surface_brass_tiled',
    materialFile: 'material.mtlx',
    assets: ['brass_color.jpg', 'brass_roughness.jpg'],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-carpaint',
    label: 'Standard Surface Carpaint',
    description: 'Upstream MaterialX standard_surface_carpaint',
    directory: 'standard_surface_carpaint',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-chrome',
    label: 'Standard Surface Chrome',
    description: 'Upstream MaterialX standard_surface_chrome',
    directory: 'standard_surface_chrome',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-copper',
    label: 'Standard Surface Copper',
    description: 'Upstream MaterialX standard_surface_copper',
    directory: 'standard_surface_copper',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-default',
    label: 'Standard Surface Default',
    description: 'Upstream MaterialX standard_surface_default',
    directory: 'standard_surface_default',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-glass',
    label: 'Standard Surface Glass',
    description: 'Upstream MaterialX standard_surface_glass',
    directory: 'standard_surface_glass',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-glass-tinted',
    label: 'Standard Surface Glass Tinted',
    description: 'Upstream MaterialX standard_surface_glass_tinted',
    directory: 'standard_surface_glass_tinted',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-gold',
    label: 'Standard Surface Gold',
    description: 'Upstream MaterialX standard_surface_gold',
    directory: 'standard_surface_gold',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-greysphere',
    label: 'Standard Surface Greysphere',
    description: 'Upstream MaterialX standard_surface_greysphere',
    directory: 'standard_surface_greysphere',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-greysphere-calibration',
    label: 'Standard Surface Greysphere Calibration',
    description: 'Upstream MaterialX standard_surface_greysphere_calibration',
    directory: 'standard_surface_greysphere_calibration',
    materialFile: 'material.mtlx',
    assets: ['greysphere_calibration.png'],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-jade',
    label: 'Standard Surface Jade',
    description: 'Upstream MaterialX standard_surface_jade',
    directory: 'standard_surface_jade',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-marble-solid',
    label: 'Standard Surface Marble Solid',
    description: 'Upstream MaterialX standard_surface_marble_solid',
    directory: 'standard_surface_marble_solid',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-metal-brushed',
    label: 'Standard Surface Metal Brushed',
    description: 'Upstream MaterialX standard_surface_metal_brushed',
    directory: 'standard_surface_metal_brushed',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-plastic',
    label: 'Standard Surface Plastic',
    description: 'Upstream MaterialX standard_surface_plastic',
    directory: 'standard_surface_plastic',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-thin-film',
    label: 'Standard Surface Thin Film',
    description: 'Upstream MaterialX standard_surface_thin_film',
    directory: 'standard_surface_thin_film',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-velvet',
    label: 'Standard Surface Velvet',
    description: 'Upstream MaterialX standard_surface_velvet',
    directory: 'standard_surface_velvet',
    materialFile: 'material.mtlx',
    assets: [],
    infoFile: 'info.txt',
  },
  {
    id: 'standard-surface-wood-tiled',
    label: 'Standard Surface Wood Tiled',
    description: 'Upstream MaterialX standard_surface_wood_tiled',
    directory: 'standard_surface_wood_tiled',
    materialFile: 'material.mtlx',
    assets: ['wood_color.jpg', 'wood_roughness.jpg'],
    infoFile: 'info.txt',
  },
];

export interface LoadedMaterialXSample {
  xml: string;
  assets: Record<string, string>;
  info: string;
}

export const loadMaterialXSamplePack = async (sample: MaterialXSamplePack): Promise<LoadedMaterialXSample> => {
  const root = `/examples/${sample.directory}`;
  const xmlResponse = await fetch(`${root}/${sample.materialFile}`);
  if (!xmlResponse.ok) {
    throw new Error(`Could not load sample material file: ${sample.materialFile}`);
  }
  const xml = await xmlResponse.text();

  const infoResponse = await fetch(`${root}/${sample.infoFile}`);
  const info = infoResponse.ok ? (await infoResponse.text()).trim() : sample.label;

  const assets: Record<string, string> = {};
  for (const asset of sample.assets) {
    assets[asset] = `${root}/${asset}`;
  }

  return { xml, assets, info };
};
