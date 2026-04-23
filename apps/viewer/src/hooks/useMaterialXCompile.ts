import { parseMaterialX } from '@material-viewer/materialx/dist/xml.js';
import { createThreeMaterialFromDocument } from '@material-viewer/materialx-three';
import { useEffect, useMemo, useRef } from 'react';
import { createBrowserTextureResolver } from '../lib/browser-texture-resolver';

interface UseMaterialXCompileOptions {
  xml: string;
  assetUrls: Record<string, string>;
  hydrated: boolean;
}

export const useMaterialXCompile = ({ xml, assetUrls, hydrated }: UseMaterialXCompileOptions) => {
  const compileState = useMemo(() => {
    if (!hydrated || !xml.trim()) {
      return { error: undefined, result: undefined, material: undefined };
    }

    try {
      const document = parseMaterialX(xml);
      const { material, result } = createThreeMaterialFromDocument(document, {
        textureResolver: createBrowserTextureResolver(assetUrls),
      });
      return { error: undefined, result, material };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to compile document',
        result: undefined,
        material: undefined,
      };
    }
  }, [assetUrls, hydrated, xml]);

  const previousMaterialRef = useRef(compileState.material);

  useEffect(() => {
    const previousMaterial = previousMaterialRef.current;
    if (previousMaterial && previousMaterial !== compileState.material) {
      previousMaterial.dispose();
    }
    previousMaterialRef.current = compileState.material;
  }, [compileState.material]);

  useEffect(() => {
    return () => {
      previousMaterialRef.current?.dispose();
      previousMaterialRef.current = undefined;
    };
  }, []);

  return compileState;
};
