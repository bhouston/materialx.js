import type { TextureResolver } from '@material-viewer/materialx-three';
import { RepeatWrapping, TextureLoader } from 'three';
import type { Texture } from 'three';

const normalizePath = (value: string): string => {
  const raw = value.replaceAll('\\', '/');
  const out: string[] = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
};

const basename = (value: string): string => {
  const normalized = normalizePath(value);
  const parts = normalized.split('/');
  return parts[parts.length - 1] ?? normalized;
};

type AssetLookup = Record<string, string | undefined>;

const findAssetUrl = (uri: string, assets: AssetLookup, filePrefix?: string): string | undefined => {
  const resolved = normalizePath(`${filePrefix ?? ''}/${uri}`);
  return assets[resolved] ?? assets[uri] ?? assets[basename(resolved)] ?? assets[basename(uri)];
};

export const createBrowserTextureResolver = (assets: AssetLookup): TextureResolver => {
  const cache = new Map<string, Texture>();
  const loader = new TextureLoader();

  return {
    resolve(uri, context) {
      const url = findAssetUrl(uri, assets, context.document.attributes.fileprefix) ?? uri;
      const cached = cache.get(url);
      if (cached) {
        return cached;
      }

      const texture = loader.load(url);
      texture.name = url;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      cache.set(url, texture);
      return texture;
    },
  };
};
