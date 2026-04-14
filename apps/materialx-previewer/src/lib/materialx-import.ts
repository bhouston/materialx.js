const isMaterialXFile = (name: string): boolean => name.toLowerCase().endsWith('.mtlx');

const makeAssetKeys = (file: File): string[] => {
  const keys = new Set<string>();
  keys.add(file.name);
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (relative) {
    keys.add(relative);
  }
  return [...keys];
};

export interface ImportedMaterialXBundle {
  label: string;
  xml: string;
  assetUrls: Record<string, string>;
  objectUrls: string[];
}

export const importMaterialXBundle = async (files: File[]): Promise<ImportedMaterialXBundle> => {
  const materialFile = files.find((file) => isMaterialXFile(file.name));
  if (!materialFile) {
    throw new Error('No .mtlx file found in dropped files');
  }

  const xml = await materialFile.text();
  const assetUrls: Record<string, string> = {};
  const objectUrls: string[] = [];

  for (const file of files) {
    if (file === materialFile) {
      continue;
    }
    const objectUrl = URL.createObjectURL(file);
    objectUrls.push(objectUrl);
    for (const key of makeAssetKeys(file)) {
      assetUrls[key] = objectUrl;
    }
  }

  return {
    label: materialFile.name,
    xml,
    assetUrls,
    objectUrls,
  };
};
