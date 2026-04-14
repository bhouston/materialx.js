export interface MaterialXBackgroundPack {
  id: string;
  directory: string;
  materialFile: string;
}

export const materialXBackgroundPacks: MaterialXBackgroundPack[] = [
  {
    id: 'checkerboard',
    directory: 'checkerboard',
    materialFile: 'material.mtlx',
  },
  {
    id: 'black',
    directory: 'black',
    materialFile: 'material.mtlx',
  },
  {
    id: 'white',
    directory: 'white',
    materialFile: 'material.mtlx',
  },
];

export const loadMaterialXBackgroundPack = async (background: MaterialXBackgroundPack): Promise<string> => {
  const root = `/backgrounds/${background.directory}`;
  const xmlResponse = await fetch(`${root}/${background.materialFile}`);
  if (!xmlResponse.ok) {
    throw new Error(`Could not load background material file: ${background.materialFile}`);
  }
  return xmlResponse.text();
};
