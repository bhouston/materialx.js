import { parseMaterialX } from '@materialx-js/materialx/dist/xml.js'
import { createThreeMaterialFromDocument } from '@materialx-js/materialx-three'
import { ClientOnly, createFileRoute, useHydrated, useNavigate } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MaterialViewport from '../components/MaterialViewport'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Separator } from '../components/ui/separator'
import { loadMaterialXBackgroundPack, materialXBackgroundPacks } from '../lib/backgrounds'
import { createBrowserTextureResolver } from '../lib/browser-texture-resolver'
import { downloadMaterialXZip } from '../lib/materialx-download'
import { importMaterialXBundle } from '../lib/materialx-import'
import { getMaterialXSamplePacks, loadMaterialXSampleById } from '../lib/materialx-samples.functions'
import { cn } from '../lib/utils'

interface ViewerTestState {
  consoleErrors: string[]
  uncaughtErrors: string[]
  failedRequests: string[]
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    capture: search.capture === '1' || search.capture === 'true' ? '1' : undefined,
    material: typeof search.material === 'string' && search.material.length > 0 ? search.material : undefined,
  }),
  loader: async () => {
    const samplePacks = await getMaterialXSamplePacks()
    return { samplePacks }
  },
  component: App,
})

function App() {
  const { samplePacks } = Route.useLoaderData()
  const { capture, material: materialParam } = Route.useSearch()
  const navigate = useNavigate()
  const captureMode =
    capture === '1' ||
    (typeof window !== 'undefined' &&
      (() => {
        const raw = new URLSearchParams(window.location.search).get('capture')
        return raw === '1' || raw === 'true'
      })())
  const hydrated = useHydrated()

  const [selectedSample, setSelectedSample] = useState('')
  const [xml, setXml] = useState('')
  const [sampleLabel, setSampleLabel] = useState('')
  const [selectedBackground, setSelectedBackground] = useState(materialXBackgroundPacks[0]?.id ?? '')
  const [backgroundXml, setBackgroundXml] = useState('')
  const [backgroundError, setBackgroundError] = useState<string>()
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({})
  const [loadedAssets, setLoadedAssets] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadedObjectUrlsRef = useRef<string[]>([])

  const materialLoaded = xml.trim() !== ''

  useEffect(() => {
    if (!captureMode || !hydrated || typeof window === 'undefined') {
      return
    }

    const scopedWindow = window as Window & { __viewerTestState?: ViewerTestState }
    const state: ViewerTestState = {
      consoleErrors: [],
      uncaughtErrors: [],
      failedRequests: [],
    }
    scopedWindow.__viewerTestState = state

    const originalConsoleError = console.error
    const originalFetch = window.fetch.bind(window)
    const stringifyError = (value: unknown): string => {
      if (value instanceof Error) {
        return value.message
      }
      if (typeof value === 'string') {
        return value
      }
      return JSON.stringify(value)
    }
    console.error = (...args: unknown[]) => {
      state.consoleErrors.push(args.map((arg) => stringifyError(arg)).join(' '))
      originalConsoleError(...args)
    }
    const handleError = (event: ErrorEvent) => {
      state.uncaughtErrors.push(event.message || stringifyError(event.error))
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      state.uncaughtErrors.push(`Unhandled rejection: ${stringifyError(event.reason)}`)
    }

    window.fetch = async (...args: Parameters<typeof window.fetch>) => {
      try {
        const response = await originalFetch(...args)
        if (!response.ok) {
          state.failedRequests.push(`${response.status} ${String(args[0])}`)
        }
        return response
      } catch (error) {
        state.failedRequests.push(`network-error ${String(args[0])}: ${stringifyError(error)}`)
        throw error
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      console.error = originalConsoleError
      window.fetch = originalFetch
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [captureMode, hydrated])

  useEffect(() => {
    return () => {
      for (const objectUrl of uploadedObjectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl)
      }
      uploadedObjectUrlsRef.current = []
    }
  }, [])

  const compileState = useMemo(() => {
    if (!hydrated || !xml.trim()) {
      return { error: undefined, result: undefined, material: undefined }
    }
    try {
      const document = parseMaterialX(xml)
      const { material, result } = createThreeMaterialFromDocument(document, {
        textureResolver: createBrowserTextureResolver(assetUrls),
      })
      return { error: undefined, result, material }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to compile document',
        result: undefined,
        material: undefined,
      }
    }
  }, [assetUrls, hydrated, xml])
  const warningCount = compileState.result?.warnings.length ?? 0
  const unsupportedCategoryCount = compileState.result?.unsupportedCategories.length ?? 0
  const unsupportedWarningCount = (compileState.result?.warnings ?? []).filter((warning) => warning.code === 'unsupported-node').length

  const backgroundCompileState = useMemo(() => {
    if (!hydrated) {
      return { error: undefined, material: undefined }
    }
    try {
      if (!backgroundXml.trim()) {
        return { error: undefined, material: undefined }
      }
      const document = parseMaterialX(backgroundXml)
      const { material } = createThreeMaterialFromDocument(document)
      return { error: undefined, material }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to compile background document',
        material: undefined,
      }
    }
  }, [backgroundXml, hydrated])

  const loadSample = useCallback(
    async (sampleId: string) => {
      const sample = samplePacks.find((entry) => entry.id === sampleId)
      if (!sample) {
        return
      }
      setSelectedSample(sampleId)
      for (const objectUrl of uploadedObjectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl)
      }
      uploadedObjectUrlsRef.current = []
      try {
        const loaded = await loadMaterialXSampleById({ data: { id: sample.id } })
        setSampleLabel(sample.directory)
        setXml(loaded.xml)
        setAssetUrls(loaded.assets)
        setLoadedAssets(Object.keys(loaded.assets))
      } catch (error) {
        setSampleLabel(sample.directory)
        setXml('')
        setAssetUrls({})
        setLoadedAssets([])
        console.error('Failed to load sample:', error)
      }
    },
    [samplePacks],
  )

  useEffect(() => {
    if (!materialParam) return
    void loadSample(materialParam)
  }, [materialParam, loadSample])

  const handleDropdownChange = useCallback(
    (sampleId: string) => {
      if (sampleId) {
        void navigate({ to: '/', search: { capture, material: sampleId } })
      } else {
        setSelectedSample('')
        setXml('')
        setAssetUrls({})
        setLoadedAssets([])
        setSampleLabel('')
        for (const objectUrl of uploadedObjectUrlsRef.current) {
          URL.revokeObjectURL(objectUrl)
        }
        uploadedObjectUrlsRef.current = []
        void navigate({ to: '/', search: { capture, material: undefined } })
      }
    },
    [navigate, capture],
  )

  const handleBackgroundChange = useCallback(async (backgroundId: string) => {
    setSelectedBackground(backgroundId)
    const background = materialXBackgroundPacks.find((entry) => entry.id === backgroundId)
    if (!background) {
      return
    }
    try {
      const loadedXml = await loadMaterialXBackgroundPack(background)
      setBackgroundXml(loadedXml)
      setBackgroundError(undefined)
    } catch (error) {
      setBackgroundXml('')
      setBackgroundError(error instanceof Error ? error.message : 'Could not load built-in background')
    }
  }, [])

  useEffect(() => {
    const initial = materialXBackgroundPacks[0]
    void handleBackgroundChange(initial.id)
  }, [handleBackgroundChange])

  const importFiles = useCallback(
    async (files: File[]) => {
      try {
        const bundle = await importMaterialXBundle(files)
        for (const objectUrl of uploadedObjectUrlsRef.current) {
          URL.revokeObjectURL(objectUrl)
        }
        uploadedObjectUrlsRef.current = bundle.objectUrls
        setSelectedSample('')
        setSampleLabel(bundle.label)
        setXml(bundle.xml)
        setAssetUrls(bundle.assetUrls)
        setLoadedAssets(Object.keys(bundle.assetUrls))
        void navigate({ to: '/', search: { capture, material: undefined } })
      } catch (error) {
        console.error('Import failed:', error)
      }
    },
    [navigate],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault()
      setIsDragging(false)
      const files = [...event.dataTransfer.files]
      if (files.length === 0) {
        return
      }
      void importFiles(files)
    },
    [importFiles],
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? [...event.target.files] : []
      if (files.length === 0) {
        return
      }
      void importFiles(files)
      event.target.value = ''
    },
    [importFiles],
  )

  const handleDownload = useCallback(async () => {
    if (!xml.trim()) return
    setIsDownloading(true)
    try {
      await downloadMaterialXZip(xml, assetUrls, sampleLabel || 'material')
    } finally {
      setIsDownloading(false)
    }
  }, [xml, assetUrls, sampleLabel])

  const viewportElement = (
    <MaterialViewport
      backgroundError={backgroundError ?? backgroundCompileState.error}
      backgroundMaterial={backgroundCompileState.material}
      backgroundPacks={materialXBackgroundPacks}
      captureMode={captureMode}
      nodeMaterial={compileState.material}
      onBackgroundChange={(backgroundId) => {
        void handleBackgroundChange(backgroundId)
      }}
      selectedBackground={selectedBackground}
    />
  )

  return (
    <div className="page-wrap space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          className="min-w-[280px] flex-1 sm:flex-none"
          data-testid="sample-select"
          onChange={(event) => handleDropdownChange(event.target.value)}
          value={selectedSample}
        >
          <option value="">Select a material...</option>
          {samplePacks.map((sample) => (
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
        <input
          accept=".mtlx,.zip,.png,.jpg,.jpeg,.webp,.gif,.exr,.hdr"
          className="sr-only"
          multiple
          onChange={handleFileInput}
          ref={fileInputRef}
          type="file"
        />
        {materialLoaded ? (
          captureMode ? (
            viewportElement
          ) : (
            <ClientOnly
              fallback={
                <div className="flex h-[420px] w-full items-center justify-center rounded-lg border border-border/90 bg-muted/40">
                  <p className="text-sm text-muted-foreground">Initializing 3D viewport...</p>
                </div>
              }
            >
              {viewportElement}
            </ClientOnly>
          )
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
          <button className="underline hover:text-foreground" onClick={() => fileInputRef.current?.click()} type="button">
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
                <span className="text-xs text-muted-foreground">({warningCount} warning{warningCount !== 1 ? 's' : ''})</span>
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
  )
}
