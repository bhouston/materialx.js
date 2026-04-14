import { parseMaterialX } from '@materialx-js/materialx/dist/xml.js'
import { createThreeMaterialFromDocument } from '@materialx-js/materialx-three'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MeshPhysicalNodeMaterial } from 'three/webgpu'
import MaterialViewport from '../components/MaterialViewport'
import { loadMaterialXBackgroundPack, materialXBackgroundPacks } from '../lib/backgrounds'
import { createBrowserTextureResolver } from '../lib/browser-texture-resolver'
import { importMaterialXBundle } from '../lib/materialx-import'
import { loadMaterialXSamplePack, materialXSamplePacks } from '../lib/samples'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [selectedSample, setSelectedSample] = useState(materialXSamplePacks[0]?.id ?? '')
  const [xml, setXml] = useState('')
  const [sampleLabel, setSampleLabel] = useState(materialXSamplePacks[0]?.label ?? 'Custom')
  const [selectedBackground, setSelectedBackground] = useState(materialXBackgroundPacks[0]?.id ?? '')
  const [backgroundXml, setBackgroundXml] = useState('')
  const [backgroundError, setBackgroundError] = useState<string>()
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({})
  const [loadedAssets, setLoadedAssets] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dropMessage, setDropMessage] = useState('Drop a .mtlx and related textures, or click to select files')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadedObjectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => {
      for (const objectUrl of uploadedObjectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl)
      }
      uploadedObjectUrlsRef.current = []
    }
  }, [])

  const compileState = useMemo(() => {
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
        material: material as MeshPhysicalNodeMaterial,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to compile document',
        result: undefined,
        material: undefined,
      }
    }
  }, [assetUrls, xml])

  const backgroundCompileState = useMemo(() => {
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
        material: material as MeshPhysicalNodeMaterial,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to compile background document',
        material: undefined,
      }
    }
  }, [backgroundXml])

  const handleSampleChange = useCallback(async (sampleId: string) => {
    setSelectedSample(sampleId)
    const sample = materialXSamplePacks.find((entry) => entry.id === sampleId)
    if (!sample) {
      return
    }
    for (const objectUrl of uploadedObjectUrlsRef.current) {
      URL.revokeObjectURL(objectUrl)
    }
    uploadedObjectUrlsRef.current = []
    try {
      const loaded = await loadMaterialXSamplePack(sample)
      setSampleLabel(loaded.info || sample.label)
      setXml(loaded.xml)
      setAssetUrls(loaded.assets)
      setLoadedAssets(Object.keys(loaded.assets))
      setDropMessage('Drop a .mtlx and related textures, or click to select files')
    } catch (error) {
      setSampleLabel(sample.label)
      setXml('')
      setAssetUrls({})
      setLoadedAssets([])
      setDropMessage(error instanceof Error ? error.message : 'Could not load built-in sample')
    }
  }, [])

  useEffect(() => {
    const initial = materialXSamplePacks[0]
    if (!initial) {
      return
    }
    void handleSampleChange(initial.id)
  }, [handleSampleChange])

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
    if (!initial) {
      return
    }
    void handleBackgroundChange(initial.id)
  }, [handleBackgroundChange])

  const importFiles = useCallback(async (files: File[]) => {
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
      setDropMessage(
        bundle.objectUrls.length > 0
          ? `Loaded ${bundle.label} with ${bundle.objectUrls.length} related file(s)`
          : `Loaded ${bundle.label} (no related texture files provided)`,
      )
    } catch (error) {
      setDropMessage(error instanceof Error ? error.message : 'Could not import dropped files')
    }
  }, [])

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

  return (
    <main className="page-wrap px-4 py-6">
      <section className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <h1 className="mb-1 text-2xl font-semibold">MaterialX Viewer</h1>
          <p className="m-0 text-sm text-muted-foreground">
            Load a MaterialX document, compile it with <code>@materialx-js/materialx-three</code>, and inspect support
            diagnostics.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium" htmlFor="sample">
              Built-in sample
            </label>
            <select
              className="min-w-[280px] rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              id="sample"
              onChange={(event) => {
                void handleSampleChange(event.target.value)
              }}
              value={selectedSample}
            >
              {materialXSamplePacks.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.label} - {sample.description}
                </option>
              ))}
            </select>
          </div>
          <button
            className={`w-full rounded-md border-2 border-dashed px-4 py-3 text-left text-sm transition-colors ${
              isDragging ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDrop={handleDrop}
            type="button"
          >
            <input
              accept=".mtlx,.png,.jpg,.jpeg,.webp,.gif,.exr,.hdr"
              className="hidden"
              multiple
              onChange={handleFileInput}
              ref={fileInputRef}
              type="file"
            />
            <p className="m-0 font-medium">Drag and drop files</p>
            <p className="m-0 mt-1 text-muted-foreground">{dropMessage}</p>
          </button>
          <p className="mb-0 mt-3 text-xs text-muted-foreground">
            Active source: <code>{sampleLabel}</code>
          </p>
        </section>

        <MaterialViewport
          backgroundError={backgroundError ?? backgroundCompileState.error}
          backgroundMaterial={backgroundCompileState.material}
          backgroundPacks={materialXBackgroundPacks}
          nodeMaterial={compileState.material}
          onBackgroundChange={(backgroundId) => {
            void handleBackgroundChange(backgroundId)
          }}
          selectedBackground={selectedBackground}
        />

        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="mb-3 text-base font-semibold">Compilation Diagnostics</h2>
          {compileState.error ? (
            <p className="m-0 text-destructive">{compileState.error}</p>
          ) : (
            <div className="space-y-3">
              <p className="m-0">
                Material: <code>{compileState.result?.materialName ?? 'n/a'}</code>
              </p>
              <p className="m-0">
                Surface shader: <code>{compileState.result?.surfaceShaderName ?? 'n/a'}</code>
              </p>
              <p className="m-0">Supported in document: {compileState.result?.supportedCategories.length ?? 0}</p>
              <p className="m-0">Unsupported in document: {compileState.result?.unsupportedCategories.length ?? 0}</p>
              <p className="m-0">Related assets available: {loadedAssets.length}</p>
              <details>
                <summary className="cursor-pointer font-medium">Warnings ({compileState.result?.warnings.length ?? 0})</summary>
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
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-base font-semibold">MaterialX Source</h2>
          <textarea
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
            onChange={(event) => setXml(event.target.value)}
            rows={20}
            spellCheck={false}
            value={xml}
          />
        </section>
      </section>
    </main>
  )
}
