import { parseMaterialX } from '@materialx-js/materialx/dist/xml.js'
import { createThreeMaterialFromDocument } from '@materialx-js/materialx-three'
import { createFileRoute, useHydrated } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MaterialViewport from '../components/MaterialViewport'
import { Select } from '../components/ui/select'
import { loadMaterialXBackgroundPack, materialXBackgroundPacks } from '../lib/backgrounds'
import { createBrowserTextureResolver } from '../lib/browser-texture-resolver'
import { getMaterialXSamplePacks, loadMaterialXSampleById } from '../lib/materialx-samples.functions'

interface ViewerTestState {
  consoleErrors: string[]
  uncaughtErrors: string[]
  failedRequests: string[]
}

export const Route = createFileRoute('/capture')({
  loader: async () => {
    const samplePacks = await getMaterialXSamplePacks()
    const firstSampleId = samplePacks[0]?.id
    const initialSample = firstSampleId ? await loadMaterialXSampleById({ data: { id: firstSampleId } }) : undefined
    return { samplePacks, initialSample }
  },
  component: CapturePage,
})

function CapturePage() {
  const { samplePacks, initialSample } = Route.useLoaderData()
  const hydrated = useHydrated()
  const [selectedSample, setSelectedSample] = useState(samplePacks[0]?.id ?? '')
  const [xml, setXml] = useState(initialSample?.xml ?? '')
  const [sampleLabel, setSampleLabel] = useState(samplePacks[0]?.label ?? 'Custom')
  const [selectedBackground, setSelectedBackground] = useState(materialXBackgroundPacks[0]?.id ?? '')
  const [backgroundXml, setBackgroundXml] = useState('')
  const [backgroundError, setBackgroundError] = useState<string>()
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>(initialSample?.assets ?? {})
  const [loadedAssets, setLoadedAssets] = useState<string[]>(Object.keys(initialSample?.assets ?? {}))
  const [dropMessage, setDropMessage] = useState('Capture route active')
  const uploadedObjectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') {
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
  }, [hydrated])

  useEffect(() => {
    return () => {
      for (const objectUrl of uploadedObjectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl)
      }
      uploadedObjectUrlsRef.current = []
    }
  }, [])

  const compileState = useMemo(() => {
    if (!hydrated) {
      return {
        error: 'Preparing client-side compiler...',
        result: undefined,
        material: undefined,
      }
    }
    try {
      if (!xml.trim()) {
        return {
          error: 'Loading sample...',
          result: undefined,
          material: undefined,
        }
      }
      const document = parseMaterialX(xml)
      const { material, result } = createThreeMaterialFromDocument(document, {
        textureResolver: createBrowserTextureResolver(assetUrls),
      })
      return {
        error: undefined,
        result,
        material,
      }
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
      return {
        error: undefined,
        material: undefined,
      }
    }
    try {
      if (!backgroundXml.trim()) {
        return {
          error: undefined,
          material: undefined,
        }
      }
      const document = parseMaterialX(backgroundXml)
      const { material } = createThreeMaterialFromDocument(document)
      return {
        error: undefined,
        material,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to compile background document',
        material: undefined,
      }
    }
  }, [backgroundXml, hydrated])

  const handleSampleChange = useCallback(async (sampleId: string) => {
    setSelectedSample(sampleId)
    const sample = samplePacks.find((entry) => entry.id === sampleId)
    if (!sample) {
      return
    }
    try {
      const loaded = await loadMaterialXSampleById({ data: { id: sample.id } })
      setSampleLabel(sample.label)
      setXml(loaded.xml)
      setAssetUrls(loaded.assets)
      setLoadedAssets(Object.keys(loaded.assets))
      setDropMessage('Capture route active')
    } catch (error) {
      setSampleLabel(sample.label)
      setXml('')
      setAssetUrls({})
      setLoadedAssets([])
      setDropMessage(error instanceof Error ? error.message : 'Could not load built-in sample')
    }
  }, [samplePacks])

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

  return (
    <main className="page-wrap space-y-4">
      <section className="rounded-lg border border-border bg-card p-3">
        <Select
          className="w-[360px]"
          data-testid="sample-select"
          id="sample"
          onChange={(event) => {
            void handleSampleChange(event.target.value)
          }}
          value={selectedSample}
        >
          {samplePacks.map((sample) => (
            <option key={sample.id} data-directory={sample.directory} value={sample.id}>
              {sample.label}
            </option>
          ))}
        </Select>
        <p className="m-0 mt-2 text-xs text-muted-foreground" data-testid="drop-message">
          {dropMessage}
        </p>
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          Active source: <code data-testid="active-source-label">{sampleLabel}</code>
        </p>
      </section>

      <MaterialViewport
        backgroundError={backgroundError ?? backgroundCompileState.error}
        backgroundMaterial={backgroundCompileState.material}
        backgroundPacks={materialXBackgroundPacks}
        captureMode
        nodeMaterial={compileState.material}
        onBackgroundChange={(backgroundId) => {
          void handleBackgroundChange(backgroundId)
        }}
        selectedBackground={selectedBackground}
      />

      <section
        className="rounded-lg border border-border bg-card p-3 text-sm"
        data-compile-error={compileState.error ? '1' : '0'}
        data-testid="compile-diagnostics"
        data-unsupported-category-count={unsupportedCategoryCount}
        data-unsupported-warning-count={unsupportedWarningCount}
        data-warning-count={warningCount}
      >
        {compileState.error ? (
          <p className="m-0 text-destructive" data-testid="compile-error-message">
            {compileState.error}
          </p>
        ) : (
          <p className="m-0 text-xs text-muted-foreground">Compilation complete</p>
        )}
        <p className="m-0 mt-1 text-xs" data-testid="unsupported-category-count">
          Unsupported in document: {unsupportedCategoryCount}
        </p>
        <p className="m-0 text-xs" data-testid="loaded-assets-count">
          Related assets available: {loadedAssets.length}
        </p>
        <p className="m-0 text-xs" data-testid="warnings-summary">
          Warnings ({warningCount})
        </p>
      </section>
    </main>
  )
}
