const ZIP_SUFFIX = '.mtlx.zip';

export interface MaterialXSampleSource {
  id: string;
  directory: string;
}

export const buildSampleAssetUrl = (sampleId: string): string =>
  `/api/asset/${encodeURIComponent(sampleId)}${ZIP_SUFFIX}`;

const normalizeSourceUrlForMatching = (sourceUrl: string): string => {
  try {
    const parsed = new URL(sourceUrl, 'http://local.materialx');
    return parsed.pathname;
  } catch {
    return sourceUrl;
  }
};

export const findSampleBySourceUrl = (
  sourceUrl: string,
  samplePacks: MaterialXSampleSource[],
): MaterialXSampleSource | undefined => {
  const normalizedSourceUrl = normalizeSourceUrlForMatching(sourceUrl);
  return samplePacks.find((sample) => buildSampleAssetUrl(sample.id) === normalizedSourceUrl);
};

/**
 * Resolves a source query value to a canonical fetch URL and display label.
 * Returns null when source is empty or explicitly set to "none".
 */
export const resolveSourceToUrl = (
  source: string,
  samplePacks: MaterialXSampleSource[],
): { url: string; label: string } | null => {
  const resolved = source.trim();
  if (!resolved || resolved === 'none') return null;

  // Already a URL/path
  if (resolved.startsWith('http://') || resolved.startsWith('https://') || resolved.startsWith('/')) {
    return { url: resolved, label: '' };
  }

  // Built-in sample id
  const sample = samplePacks.find((entry) => entry.id === resolved);
  if (sample) {
    return {
      url: buildSampleAssetUrl(sample.id),
      label: sample.directory,
    };
  }

  // Unknown value - treat as-is
  return { url: resolved, label: '' };
};
