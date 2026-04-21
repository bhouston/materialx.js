import { useCallback, useState } from 'react';
import { importMaterialXBundle, importMaterialXFromUrl } from '../lib/materialx-import';
import { useObjectUrlStore } from './useObjectUrlStore';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : `Unknown error: ${String(error)}`;

export const useMaterialXBundleState = () => {
  const [xml, setXml] = useState('');
  const [sampleLabel, setSampleLabel] = useState('');
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [loadedAssets, setLoadedAssets] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { replaceObjectUrls, clearObjectUrls } = useObjectUrlStore();

  const clearBundle = useCallback(() => {
    clearObjectUrls();
    setXml('');
    setSampleLabel('');
    setAssetUrls({});
    setLoadedAssets([]);
    setLoadError(null);
  }, [clearObjectUrls]);

  const loadFromUrl = useCallback(
    async (url: string, explicitLabel?: string) => {
      clearObjectUrls();
      try {
        const bundle = await importMaterialXFromUrl(url);
        replaceObjectUrls(bundle.objectUrls);
        setSampleLabel(explicitLabel ?? bundle.label);
        setXml(bundle.xml);
        setAssetUrls(bundle.assetUrls);
        setLoadedAssets(Object.keys(bundle.assetUrls));
        setLoadError(null);
        return bundle;
      } catch (error) {
        setLoadError(getErrorMessage(error));
        throw error;
      }
    },
    [clearObjectUrls, replaceObjectUrls],
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      try {
        const bundle = await importMaterialXBundle(files);
        replaceObjectUrls(bundle.objectUrls);
        setSampleLabel(bundle.label);
        setXml(bundle.xml);
        setAssetUrls(bundle.assetUrls);
        setLoadedAssets(Object.keys(bundle.assetUrls));
        setLoadError(null);
        return bundle;
      } catch (error) {
        setLoadError(getErrorMessage(error));
        throw error;
      }
    },
    [replaceObjectUrls],
  );

  return {
    xml,
    setXml,
    sampleLabel,
    setSampleLabel,
    assetUrls,
    setAssetUrls,
    loadedAssets,
    setLoadedAssets,
    loadError,
    setLoadError,
    clearBundle,
    loadFromUrl,
    importFiles,
  };
};
