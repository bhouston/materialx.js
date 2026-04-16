import { createFileRoute, useHydrated } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import MaterialViewport from '../components/MaterialViewport';
import { useMaterialXBackground } from '../hooks/useMaterialXBackground';
import { useMaterialXBundleState } from '../hooks/useMaterialXBundleState';
import { useMaterialXCompile } from '../hooks/useMaterialXCompile';
import { useViewerTestInstrumentation } from '../hooks/useViewerTestInstrumentation';
import { materialXBackgroundPacks } from '../lib/backgrounds';
import type { PreviewGeometry } from '../components/Viewer';

const allowedModels = new Set<PreviewGeometry>(['totem', 'sphere', 'plane', 'cube']);
const allowedBackgrounds = new Set(materialXBackgroundPacks.map((entry) => entry.id));
const defaultBackground = materialXBackgroundPacks[0]?.id ?? 'checkerboard';

const embedSearchSchema = z.object({
  url: z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().optional()),
  model: z.preprocess(
    (value) => (typeof value === 'string' && allowedModels.has(value as PreviewGeometry) ? value : undefined),
    z.enum(['totem', 'sphere', 'plane', 'cube']).default('totem'),
  ),
  background: z.preprocess(
    (value) => (typeof value === 'string' && allowedBackgrounds.has(value) ? value : undefined),
    z.string().default(defaultBackground),
  ),
  static: z.preprocess((value) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0' || value === undefined) return false;
    return undefined;
  }, z.boolean().default(false)),
});

export const Route = createFileRoute('/embed')({
  validateSearch: embedSearchSchema,
  component: EmbedRouteComponent,
});

function EmbedRouteComponent() {
  const hydrated = useHydrated();
  const { url, model, background, static: staticPreview } = Route.useSearch();
  const { xml, assetUrls, loadFromUrl, clearBundle } = useMaterialXBundleState();
  const compileState = useMaterialXCompile({ xml, assetUrls, hydrated });
  const { selectedBackground, backgroundError, backgroundCompileState, onBackgroundChange } = useMaterialXBackground(
    hydrated,
    background,
  );
  useViewerTestInstrumentation(true, hydrated);

  useEffect(() => {
    const load = async () => {
      if (!url) {
        clearBundle();
        return;
      }
      try {
        await loadFromUrl(url);
      } catch (error) {
        clearBundle();
        console.error('Failed to load embed material:', error);
      }
    };

    void load();
  }, [clearBundle, loadFromUrl, url]);

  useEffect(() => {
    void onBackgroundChange(background);
  }, [background, onBackgroundChange]);

  const warningCount = compileState.result?.warnings.length ?? 0;
  const unsupportedCategoryCount = compileState.result?.unsupportedCategories.length ?? 0;
  const unsupportedWarningCount = (compileState.result?.warnings ?? []).filter(
    (warning) => warning.code === 'unsupported-node',
  ).length;
  const statusMessage = useMemo(() => {
    if (!url) {
      return 'Missing "url" query parameter';
    }
    if (!xml.trim()) {
      return 'Loading material...';
    }
    return 'Embed route active';
  }, [url, xml]);
  const homeHref = useMemo(() => {
    if (!url) {
      return '/';
    }
    return `/?material=${encodeURIComponent(url)}`;
  }, [url]);

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full" data-testid="drop-message">
        <MaterialViewport
          backgroundError={backgroundError ?? backgroundCompileState.error}
          backgroundMaterial={backgroundCompileState.material}
          backgroundPacks={materialXBackgroundPacks}
          enableOrbitControls
          initialPreviewGeometry={model}
          idleAutoRotate={!staticPreview}
          lockBackground
          lockPreviewGeometry
          nodeMaterial={compileState.material}
          onBackgroundChange={(backgroundId) => void onBackgroundChange(backgroundId)}
          selectedBackground={selectedBackground}
          showControls={false}
          variant="bare"
          viewerClassName="h-full w-full overflow-hidden bg-background"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute left-4 top-4">
          <a
            className="pointer-events-auto text-2xl font-bold text-foreground drop-shadow-sm transition-opacity hover:opacity-85"
            href={homeHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            MaterialX Viewer
          </a>
        </div>
        {url ? (
          <div className="absolute bottom-4 left-1/2 w-[80%] -translate-x-1/2 px-2">
            <a
              className="pointer-events-auto block w-full overflow-x-auto whitespace-nowrap text-center text-base text-foreground/90 drop-shadow-sm transition-opacity hover:opacity-85"
              href={homeHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              {url}
            </a>
          </div>
        ) : null}
      </div>
      <div
        className="sr-only"
        data-compile-error={compileState.error ? '1' : '0'}
        data-testid="compile-diagnostics"
        data-unsupported-category-count={unsupportedCategoryCount}
        data-unsupported-warning-count={unsupportedWarningCount}
        data-warning-count={warningCount}
      >
        {compileState.error ? <p data-testid="compile-error-message">{compileState.error}</p> : <p>{statusMessage}</p>}
        <p data-testid="active-source-label">{url ?? 'n/a'}</p>
      </div>
    </div>
  );
}
