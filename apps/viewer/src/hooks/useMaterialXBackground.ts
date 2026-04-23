import { parseMaterialX } from '@material-viewer/materialx/dist/xml.js';
import { createThreeMaterialFromDocument } from '@material-viewer/materialx-three';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadMaterialXBackgroundPack, materialXBackgroundPacks } from '../lib/backgrounds';

const DEFAULT_BACKGROUND = materialXBackgroundPacks[0]?.id ?? 'checkerboard';

export const useMaterialXBackground = (hydrated: boolean, initialBackground = DEFAULT_BACKGROUND) => {
  const [selectedBackground, setSelectedBackground] = useState(initialBackground);
  const [backgroundXml, setBackgroundXml] = useState('');
  const [backgroundError, setBackgroundError] = useState<string>();

  const handleBackgroundChange = useCallback(async (backgroundId: string) => {
    setSelectedBackground(backgroundId);
    const background = materialXBackgroundPacks.find((entry) => entry.id === backgroundId);
    if (!background) {
      setBackgroundXml('');
      setBackgroundError('Unknown background preset');
      return;
    }

    try {
      const loadedXml = await loadMaterialXBackgroundPack(background);
      setBackgroundXml(loadedXml);
      setBackgroundError(undefined);
    } catch (error) {
      setBackgroundXml('');
      setBackgroundError(error instanceof Error ? error.message : 'Could not load built-in background');
    }
  }, []);

  useEffect(() => {
    void handleBackgroundChange(initialBackground);
  }, [handleBackgroundChange, initialBackground]);

  const backgroundCompileState = useMemo(() => {
    if (!hydrated) {
      return { error: undefined, material: undefined };
    }

    try {
      if (!backgroundXml.trim()) {
        return { error: undefined, material: undefined };
      }
      const document = parseMaterialX(backgroundXml);
      const { material } = createThreeMaterialFromDocument(document);
      return { error: undefined, material };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to compile background document',
        material: undefined,
      };
    }
  }, [backgroundXml, hydrated]);

  const previousMaterialRef = useRef(backgroundCompileState.material);

  useEffect(() => {
    const previousMaterial = previousMaterialRef.current;
    if (previousMaterial && previousMaterial !== backgroundCompileState.material) {
      previousMaterial.dispose();
    }
    previousMaterialRef.current = backgroundCompileState.material;
  }, [backgroundCompileState.material]);

  useEffect(() => {
    return () => {
      previousMaterialRef.current?.dispose();
      previousMaterialRef.current = undefined;
    };
  }, []);

  return {
    selectedBackground,
    setSelectedBackground,
    backgroundError,
    backgroundCompileState,
    onBackgroundChange: handleBackgroundChange,
  };
};
