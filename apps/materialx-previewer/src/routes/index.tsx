import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { parseMaterialX } from '@materialx-js/materialx/dist/xml.js'
import { createThreeMaterialFromDocument } from '@materialx-js/materialx-three'
import type { MeshPhysicalNodeMaterial } from 'three/webgpu'
import MaterialViewport from '../components/MaterialViewport'
import { createBrowserTextureResolver } from '../lib/browser-texture-resolver'
import { importMaterialXBundle } from '../lib/materialx-import'
import { loadMaterialXSamplePack, materialXSamplePacks } from '../lib/samples'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [selectedSample, setSelectedSample] = useState(materialXSamplePacks[0]?.id ?? '')
  const [xml, setXml] = useState('')
  const [sampleLabel, setSampleLabel] = useState(materialXSamplePacks[0]?.label ?? 'Custom')
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
    const initial = materialXSamplePacks[0];
    if (!initial) {
      return;
    }
    void handleSampleChange(initial.id);
  }, [handleSampleChange]);

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
          : `Loaded ${bundle.label} (no related texture files provided)`
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
    [importFiles]
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
    [importFiles]
  )

  return (
    <main className="page-wrap px-4 pb-8 pt-10">
      <section className="island-shell rise-in rounded-2xl p-6">
        <p className="island-kicker mb-2">MaterialX + Three TSL Preview</p>
        <h1 className="display-title mb-2 text-3xl font-bold">MaterialX-to-TSL Previewer</h1>
        <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
          Load a MaterialX document, compile it with <code>@materialx-js/materialx-three</code>, and inspect supported nodes and warnings.
        </p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <section className="space-y-4">
          <section className="island-shell rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label htmlFor="sample" className="text-sm font-semibold">
                Built-in sample
              </label>
              <select
                id="sample"
                value={selectedSample}
                onChange={(event) => {
                  void handleSampleChange(event.target.value)
                }}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"
              >
                {materialXSamplePacks.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.label} - {sample.description}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className={`mb-3 w-full rounded-xl border-2 border-dashed px-4 py-4 text-left text-sm transition ${
                isDragging
                  ? 'border-[var(--lagoon)] bg-[rgba(79,184,178,0.16)]'
                  : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--lagoon-deep)]'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".mtlx,.png,.jpg,.jpeg,.webp,.gif,.exr,.hdr"
                className="hidden"
                onChange={handleFileInput}
              />
              <p className="m-0 font-semibold">Drag and drop files</p>
              <p className="m-0 mt-1 text-[var(--sea-ink-soft)]">{dropMessage}</p>
            </button>

            <p className="mb-2 mt-0 text-xs text-[var(--sea-ink-soft)]">
              Active source: <code>{sampleLabel}</code>
            </p>
            <textarea
              value={xml}
              onChange={(event) => setXml(event.target.value)}
              rows={20}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs"
              spellCheck={false}
            />
          </section>
        </section>

        <section className="space-y-4">
          <MaterialViewport nodeMaterial={compileState.material} />

          <section className="island-shell rounded-2xl p-4 text-sm">
            <h2 className="mb-2 text-base font-semibold">Compilation Diagnostics</h2>
            {compileState.error ? (
              <p className="m-0 text-red-700">{compileState.error}</p>
            ) : (
              <div className="space-y-3">
                <p className="m-0">
                  Material: <code>{compileState.result?.materialName ?? 'n/a'}</code>
                </p>
                <p className="m-0">
                  Surface shader: <code>{compileState.result?.surfaceShaderName ?? 'n/a'}</code>
                </p>
                <p className="m-0">
                  Supported in document: {compileState.result?.supportedCategories.length ?? 0}
                </p>
                <p className="m-0">
                  Unsupported in document: {compileState.result?.unsupportedCategories.length ?? 0}
                </p>
                <p className="m-0">
                  Related assets available: {loadedAssets.length}
                </p>
                <details>
                  <summary className="cursor-pointer font-semibold">
                    Warnings ({compileState.result?.warnings.length ?? 0})
                  </summary>
                  <ul className="m-0 mt-2 space-y-1 pl-5">
                    {(compileState.result?.warnings ?? []).map((warning) => (
                      <li key={`${warning.code}-${warning.nodeName ?? warning.message}`}>{warning.message}</li>
                    ))}
                    {(compileState.result?.warnings.length ?? 0) === 0 ? <li>No warnings.</li> : null}
                  </ul>
                </details>
                <details>
                  <summary className="cursor-pointer font-semibold">Unsupported categories</summary>
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
                  <summary className="cursor-pointer font-semibold">Loaded related files</summary>
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
        </section>
      </section>
    </main>
  )
}
