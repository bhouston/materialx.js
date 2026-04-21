import { createFileRoute, useHydrated, useNavigate } from '@tanstack/react-router';
import { Check, Code2, Copy, Download } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import MaterialViewport from '../components/MaterialViewport';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { useMaterialXBackground } from '../hooks/useMaterialXBackground';
import { useMaterialXBundleState } from '../hooks/useMaterialXBundleState';
import { useMaterialXCompile } from '../hooks/useMaterialXCompile';
import { useViewerTestInstrumentation } from '../hooks/useViewerTestInstrumentation';
import { downloadMaterialXZip } from '../lib/materialx-download';
import { materialXBackgroundPacks } from '../lib/backgrounds';
import { getMaterialXSamplePacks } from '../lib/materialx-samples.functions';
import { buildSampleAssetUrl, findSampleBySourceUrl, resolveSourceToUrl } from '../lib/materialx-source';
import type { PreviewGeometry } from '../components/Viewer';
import { cn } from '../lib/utils';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : `Unknown error: ${String(error)}`;

const indexSearchSchema = z.object({
  sourceUrl: z.preprocess(
    (value) => (typeof value === 'string' && value.length > 0 ? value : undefined),
    z.string().optional(),
  ),
  url: z.preprocess(
    (value) => (typeof value === 'string' && value.length > 0 ? value : undefined),
    z.string().optional(),
  ),
  material: z.preprocess(
    (value) => (typeof value === 'string' && value.length > 0 ? value : undefined),
    z.string().optional(),
  ),
});

export const Route = createFileRoute('/')({
  validateSearch: indexSearchSchema,
  loader: async () => {
    const samplePacks = await getMaterialXSamplePacks();
    return { samplePacks };
  },
  component: App,
});

const DEFAULT_MATERIAL = 'open-pbr-soapbubble';

function App() {
  const { samplePacks } = Route.useLoaderData();
  const { sourceUrl: sourceUrlParam, url: urlParam, material: materialParam } = Route.useSearch();
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const [selectedSample, setSelectedSample] = useState('');
  const [currentPreviewGeometry, setCurrentPreviewGeometry] = useState<PreviewGeometry>('totem');
  const [materialSourceUrl, setMaterialSourceUrl] = useState<string | null>(null);

  const {
    xml,
    sampleLabel,
    assetUrls,
    loadedAssets,
    loadError,
    setLoadError,
    clearBundle,
    loadFromUrl,
    importFiles: importBundleFiles,
  } = useMaterialXBundleState();
  const { selectedBackground, backgroundError, backgroundCompileState, onBackgroundChange } =
    useMaterialXBackground(hydrated);
  const compileState = useMaterialXCompile({ xml, assetUrls, hydrated });

  const [isDragging, setIsDragging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const materialLoaded = xml.trim() !== '';
  useViewerTestInstrumentation(false, hydrated);

  const warningCount = compileState.result?.warnings.length ?? 0;
  const unsupportedCategoryCount = compileState.result?.unsupportedCategories.length ?? 0;
  const unsupportedWarningCount = (compileState.result?.warnings ?? []).filter(
    (warning) => warning.code === 'unsupported-node',
  ).length;

  // Unified material loading: resolve param -> canonical URL -> loadFromUrl
  useEffect(() => {
    const paramValue = sourceUrlParam ?? urlParam ?? materialParam ?? DEFAULT_MATERIAL;
    const resolved = resolveSourceToUrl(paramValue, samplePacks);

    if (!resolved) {
      clearBundle();
      setSelectedSample('');
      setMaterialSourceUrl(null);
      return;
    }

    const { url, label } = resolved;

    const syncFromSearch = async () => {
      try {
        await loadFromUrl(url, label || undefined);
        // Track which sample is selected in the dropdown (if any)
        const matchingSample = findSampleBySourceUrl(url, samplePacks);
        setSelectedSample(matchingSample?.id ?? '');
        setMaterialSourceUrl(url);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        clearBundle();
        setLoadError(errorMessage);
        setMaterialSourceUrl(null);
        console.error('Failed to load material:', error);
      }
    };

    void syncFromSearch();
  }, [clearBundle, loadFromUrl, materialParam, samplePacks, setLoadError, sourceUrlParam, urlParam]);

  const handleDropdownChange = useCallback(
    (sampleId: string) => {
      if (sampleId) {
        void navigate({ to: '/', search: { sourceUrl: buildSampleAssetUrl(sampleId) } });
      } else {
        setSelectedSample('');
        clearBundle();
        void navigate({ to: '/', search: { sourceUrl: 'none' } });
      }
    },
    [clearBundle, navigate],
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      try {
        await importBundleFiles(files);
        setSelectedSample('');
        setMaterialSourceUrl(null);
        void navigate({ to: '/', search: { sourceUrl: undefined } });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        setLoadError(errorMessage);
        console.error('Import failed:', error);
      }
    },
    [importBundleFiles, navigate, setLoadError],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const files = [...event.dataTransfer.files];
      if (files.length === 0) return;
      void importFiles(files);
    },
    [importFiles],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? [...event.target.files] : [];
      if (files.length === 0) return;
      void importFiles(files);
      event.target.value = '';
    },
    [importFiles],
  );

  const handleDownload = useCallback(async () => {
    if (!xml.trim()) return;
    setIsDownloading(true);
    try {
      await downloadMaterialXZip(xml, assetUrls, sampleLabel || 'material');
    } finally {
      setIsDownloading(false);
    }
  }, [xml, assetUrls, sampleLabel]);

  // Build the /embed URL reflecting current viewer state
  const embedUrl = (() => {
    if (!materialSourceUrl) return null;
    const params = new URLSearchParams();
    // Use an absolute URL for the material so it works when embedded cross-origin
    const absUrl = materialSourceUrl.startsWith('/')
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}${materialSourceUrl}`
      : materialSourceUrl;
    params.set('sourceUrl', absUrl);
    if (currentPreviewGeometry !== 'totem') params.set('model', currentPreviewGeometry);
    const defaultBg = materialXBackgroundPacks[0]?.id ?? '';
    if (selectedBackground && selectedBackground !== defaultBg) params.set('background', selectedBackground);
    const base = typeof window !== 'undefined' ? `${window.location.origin}/embed` : '/embed';
    return `${base}?${params.toString()}`;
  })();

  const handleCopyEmbedUrl = useCallback(async () => {
    if (!embedUrl) return;
    await navigator.clipboard.writeText(embedUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [embedUrl]);

  const viewportElement = (
    <MaterialViewport
      backgroundError={backgroundError ?? backgroundCompileState.error}
      backgroundMaterial={backgroundCompileState.material}
      backgroundPacks={materialXBackgroundPacks}
      nodeMaterial={compileState.material}
      onBackgroundChange={(backgroundId) => void onBackgroundChange(backgroundId)}
      onPreviewGeometryChange={setCurrentPreviewGeometry}
      selectedBackground={selectedBackground}
    />
  );

  return (
    <div className="page-wrap space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          className="min-w-[280px] flex-1 sm:flex-none"
          data-testid="sample-select"
          onChange={(event) => handleDropdownChange(event.target.value)}
          value={selectedSample}
        >
          <option value="">None</option>
          {[...samplePacks]
            .toSorted((a, b) => a.directory.localeCompare(b.directory))
            .map((sample) => (
              <option key={sample.id} data-directory={sample.directory} value={sample.id}>
                {sample.directory}
              </option>
            ))}
        </Select>
        {materialLoaded && (
          <Button
            disabled={isDownloading}
            onClick={() => void handleDownload()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Download className="mr-1.5 size-4" />
            {isDownloading ? 'Downloading...' : 'Download .mtlx.zip'}
          </Button>
        )}
        {materialLoaded && (
          <Dialog onOpenChange={() => setIsCopied(false)}>
            <DialogTrigger asChild>
              <Button disabled={!embedUrl} size="sm" type="button" variant="outline">
                <Code2 className="mr-1.5 size-4" />
                Embed
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Embed this material</DialogTitle>
                <DialogDescription>
                  Use the URL below to embed the current material in an iframe or share a standalone preview.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={embedUrl ?? ''}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="icon"
                  type="button"
                  variant="outline"
                  onClick={() => void handleCopyEmbedUrl()}
                  aria-label="Copy embed URL"
                >
                  {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              {isCopied && <p className="text-xs text-muted-foreground">Copied!</p>}
              <p className="text-xs text-muted-foreground">Example iframe usage:</p>
              <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
                {`<iframe\n  src="${embedUrl ?? ''}"\n  width="640"\n  height="480"\n  frameborder="0"\n  allowfullscreen\n></iframe>`}
              </pre>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div
        className={cn(
          'rounded-lg border-2 border-dashed transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : materialLoaded
              ? 'border-transparent'
              : 'border-muted-foreground/25 bg-muted/30',
        )}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {loadError ? (
          <div className="mx-3 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p className="m-0 font-medium" data-testid="load-error-message">
              Failed to load material.
            </p>
            <p className="m-0 mt-1 break-all text-xs">{loadError}</p>
          </div>
        ) : null}
        <input
          accept=".mtlx,.zip,.png,.jpg,.jpeg,.webp,.gif,.exr,.hdr"
          className="sr-only"
          multiple
          onChange={handleFileInput}
          ref={fileInputRef}
          type="file"
        />
        {materialLoaded ? (
          viewportElement
        ) : (
          <button
            className="flex min-h-[400px] w-full cursor-pointer items-center justify-center rounded-lg bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">{isDragging ? 'Drop the file here' : 'Drop a .mtlx file here'}</p>
              <p className="mt-1 text-sm">with optional textures or a .mtlx.zip archive</p>
              <p className="mt-1 text-sm">or click to select files</p>
              <p className="mt-3 text-sm">
                Or load a preset from the <b>dropdown above</b>.
              </p>
            </div>
          </button>
        )}
      </div>

      {materialLoaded && (
        <p className="text-center text-xs text-muted-foreground">
          Drag a .mtlx file onto the viewer or{' '}
          <button
            className="underline hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            click here
          </button>{' '}
          to load a different material.
        </p>
      )}

      {materialLoaded && (
        <div
          data-compile-error={compileState.error ? '1' : '0'}
          data-testid="compile-diagnostics"
          data-unsupported-category-count={unsupportedCategoryCount}
          data-unsupported-warning-count={unsupportedWarningCount}
          data-warning-count={warningCount}
        >
          <details open={!!compileState.error}>
            <summary className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/50">
              {compileState.error ? (
                <Badge className="bg-red-600 text-white hover:bg-red-600">ERROR</Badge>
              ) : (
                <Badge className="bg-green-600 text-white hover:bg-green-600">SUCCESS</Badge>
              )}
              Compilation
              {!compileState.error && warningCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({warningCount} warning{warningCount !== 1 ? 's' : ''})
                </span>
              )}
            </summary>
            <div className="mt-2 space-y-4 rounded-md border border-border/80 px-4 py-3 text-sm">
              {compileState.error ? (
                <p className="m-0 text-destructive" data-testid="compile-error-message">
                  {compileState.error}
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="m-0">
                      Material: <code>{compileState.result?.materialName ?? 'n/a'}</code>
                    </p>
                    <p className="m-0">
                      Surface shader: <code>{compileState.result?.surfaceShaderName ?? 'n/a'}</code>
                    </p>
                    <p className="m-0">Supported in document: {compileState.result?.supportedCategories.length ?? 0}</p>
                    <p className="m-0" data-testid="unsupported-category-count">
                      Unsupported in document: {unsupportedCategoryCount}
                    </p>
                    <p className="m-0" data-testid="loaded-assets-count">
                      Related assets available: {loadedAssets.length}
                    </p>
                  </div>
                  <Separator />
                  <details>
                    <summary className="cursor-pointer font-medium" data-testid="warnings-summary">
                      Warnings ({warningCount})
                    </summary>
                    <ul className="m-0 mt-2 space-y-1 pl-5">
                      {(compileState.result?.warnings ?? []).map((warning) => (
                        <li key={`${warning.code}-${warning.nodeName ?? warning.message}`}>{warning.message}</li>
                      ))}
                      {(compileState.result?.warnings.length ?? 0) === 0 ? <li>No warnings.</li> : null}
                    </ul>
                  </details>
                  <details>
                    <summary className="cursor-pointer font-medium">Unsupported categories</summary>
                    <ul className="m-0 mt-2 max-h-44 overflow-auto pl-5">
                      {(compileState.result?.unsupportedCategories ?? []).map((entry) => (
                        <li key={entry}>
                          <code>{entry}</code>
                        </li>
                      ))}
                      {(compileState.result?.unsupportedCategories.length ?? 0) === 0 ? <li>None</li> : null}
                    </ul>
                  </details>
                  <details>
                    <summary className="cursor-pointer font-medium">Loaded related files</summary>
                    <ul className="m-0 mt-2 max-h-44 overflow-auto pl-5">
                      {loadedAssets.map((entry) => (
                        <li key={entry}>
                          <code>{entry}</code>
                        </li>
                      ))}
                      {loadedAssets.length === 0 ? <li>None</li> : null}
                    </ul>
                  </details>
                </>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
