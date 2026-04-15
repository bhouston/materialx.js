import { useEffect, useRef, useState } from 'react'
import type { MeshPhysicalNodeMaterial } from 'three/webgpu'
import type { MaterialXBackgroundPack } from '../lib/backgrounds'
import Viewer, { type PreviewGeometry, type ViewerHandle } from './Viewer'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'
import { Select } from './ui/select'

interface MaterialViewportProps {
  nodeMaterial?: MeshPhysicalNodeMaterial
  backgroundMaterial?: MeshPhysicalNodeMaterial
  backgroundPacks: MaterialXBackgroundPack[]
  selectedBackground: string
  onBackgroundChange: (backgroundId: string) => void
  backgroundError?: string
  captureMode?: boolean
}

export default function MaterialViewport({
  nodeMaterial,
  backgroundMaterial,
  backgroundPacks,
  selectedBackground,
  onBackgroundChange,
  backgroundError,
  captureMode,
}: MaterialViewportProps) {
  const viewerRef = useRef<ViewerHandle | null>(null)
  const [rendererLabel, setRendererLabel] = useState('WebGL fallback')
  const [previewGeometry, setPreviewGeometry] = useState<PreviewGeometry>(captureMode ? 'sphere' : 'totem')
  const [previewGeometryError, setPreviewGeometryError] = useState<string>()

  useEffect(() => {
    if (captureMode) {
      setPreviewGeometry('sphere')
    }
  }, [captureMode])

  const handleResetView = () => {
    viewerRef.current?.resetView()
  }

  return (
    <Card className="panel-surface">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Preview</CardTitle>
          <span className="rounded-md border border-border/80 bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
            {rendererLabel}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,140px)_minmax(0,220px)_auto] md:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground" htmlFor="preview-geometry">
              Model
            </Label>
            <Select
              className="text-xs"
              id="preview-geometry"
              data-testid="preview-geometry-select"
              disabled={captureMode}
              onChange={(event) => setPreviewGeometry(event.target.value as PreviewGeometry)}
              value={previewGeometry}
            >
              <option value="totem">Totem</option>
              <option value="sphere">Sphere</option>
              <option value="cube">Cube</option>
              <option value="plane">Plane</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground" htmlFor="background">
              Background
            </Label>
            <Select
              className="text-xs"
              id="background"
              data-testid="background-select"
              disabled={captureMode}
              onChange={(event) => onBackgroundChange(event.target.value)}
              value={selectedBackground}
            >
              {backgroundPacks.map((background) => (
                <option key={background.id} value={background.id}>
                  {background.directory}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:justify-self-end">
            <Button
              className="w-full md:w-auto"
              data-testid="preview-reset-view"
              onClick={handleResetView}
              size="sm"
              type="button"
              variant="outline"
            >
              Reset view
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {backgroundError ? (
          <p className="m-0 text-xs text-destructive" data-testid="background-error-message">
            {backgroundError}
          </p>
        ) : null}
        {previewGeometryError ? (
          <p className="m-0 text-xs text-destructive" data-testid="preview-geometry-error-message">
            {previewGeometryError}
          </p>
        ) : null}
        <Viewer
          ref={viewerRef}
          backgroundMaterial={backgroundMaterial}
          captureMode={captureMode}
          nodeMaterial={nodeMaterial}
          onPreviewGeometryErrorChange={setPreviewGeometryError}
          onPreviewGeometryFallback={setPreviewGeometry}
          onRendererLabelChange={setRendererLabel}
          previewGeometry={previewGeometry}
        />
      </CardContent>
    </Card>
  )
}
