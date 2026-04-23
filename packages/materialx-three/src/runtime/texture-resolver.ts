import { Texture } from 'three';
import type { MaterialXDocument } from '@material-viewer/materialx';
import type { TextureResolver, TextureResolverContext } from '../types.js';

export interface CreateTextureResolverOptions {
  basePath?: string;
  cache?: Map<string, Texture>;
}

const joinPathParts = (...parts: string[]): string => {
  const raw = parts
    .filter((entry) => entry.length > 0)
    .join('/')
    .replaceAll('\\', '/');
  const normalized: string[] = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized.join('/');
};

const canonicalizeTextureUri = (uri: string, document: MaterialXDocument, basePath?: string): string => {
  const filePrefix = document.attributes.fileprefix ?? '';
  const joined = joinPathParts(filePrefix, uri);
  if (!basePath) {
    return joined;
  }
  return joinPathParts(basePath, joined);
};

export const createTextureResolver = (options: CreateTextureResolverOptions = {}): TextureResolver => {
  const cache = options.cache ?? new Map<string, Texture>();

  return {
    resolve(uri: string, context: TextureResolverContext): Texture {
      const key = canonicalizeTextureUri(uri, context.document, options.basePath);
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }

      const texture = new Texture();
      texture.name = key;
      cache.set(key, texture);
      return texture;
    },
  };
};
