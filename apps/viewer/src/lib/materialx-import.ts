import JSZip from 'jszip';

const isMaterialXFile = (name: string): boolean => name.toLowerCase().endsWith('.mtlx');
const isZipFile = (name: string): boolean => name.toLowerCase().endsWith('.zip');

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

const importFromZip = async (zipFile: File): Promise<ImportedMaterialXBundle> => {
  const arrayBuffer = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let mtlxPath: string | undefined;
  let mtlxContent: string | undefined;

  const entries: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, file) => {
    if (!file.dir) {
      entries.push({ path: relativePath, file });
    }
  });

  for (const { path, file } of entries) {
    if (isMaterialXFile(path)) {
      mtlxPath = path;
      mtlxContent = await file.async('string');
      break;
    }
  }

  if (!mtlxPath || !mtlxContent) {
    throw new Error('No .mtlx file found inside the zip archive');
  }

  const assetUrls: Record<string, string> = {};
  const objectUrls: string[] = [];

  const mtlxDir = mtlxPath.includes('/') ? mtlxPath.substring(0, mtlxPath.lastIndexOf('/') + 1) : '';

  for (const { path, file } of entries) {
    if (path === mtlxPath) continue;

    const data = await file.async('arraybuffer');
    const blob = new Blob([data]);
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.push(objectUrl);

    const relativePath = mtlxDir && path.startsWith(mtlxDir) ? path.slice(mtlxDir.length) : path;
    const basename = relativePath.includes('/') ? relativePath.substring(relativePath.lastIndexOf('/') + 1) : relativePath;

    assetUrls[relativePath] = objectUrl;
    if (basename !== relativePath) {
      assetUrls[basename] = objectUrl;
    }
  }

  const label = zipFile.name.replace(/\.zip$/i, '');

  return { label, xml: mtlxContent, assetUrls, objectUrls };
};

export const importMaterialXBundle = async (files: File[]): Promise<ImportedMaterialXBundle> => {
  const zipFile = files.find((file) => isZipFile(file.name));
  if (zipFile) {
    return importFromZip(zipFile);
  }

  const materialFile = files.find((file) => isMaterialXFile(file.name));
  if (!materialFile) {
    throw new Error('No .mtlx or .zip file found in dropped files');
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
