import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  AmbientLight,
  BackSide,
  Box3,
  BoxGeometry,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import type { MeshPhysicalNodeMaterial } from 'three/webgpu'

export type PreviewGeometry = 'totem' | 'sphere' | 'cube' | 'plane'

export interface ViewerHandle {
  resetView: () => void
}

interface ViewerProps {
  nodeMaterial?: MeshPhysicalNodeMaterial
  backgroundMaterial?: MeshPhysicalNodeMaterial
  previewGeometry: PreviewGeometry
  captureMode?: boolean
  onRendererLabelChange: (label: string) => void
  onPreviewGeometryErrorChange: (message?: string) => void
  onPreviewGeometryFallback: (geometry: PreviewGeometry) => void
}

const ENV_MAP_URL = 'https://api.landofassets.com/media/BenHouston3D/Samples/PaulLobeHaus/image/hdr'
const DEFAULT_CAMERA_POSITION = { x: 0, y: 0, z: 3.2 }
const TOTEM_MODEL_URL = '/models/ShaderBall.glb'
const PREVIEW_TARGET_SIZE = 1.8

const createUvPlaneGeometry = (size: number) => {
  const geometry = new PlaneGeometry(size, size, 1, 1)
  const half = size / 2
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')

  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, position.getX(index) / half, position.getY(index) / half)
  }
  uv.needsUpdate = true

  return geometry
}

const normalizePreviewModel = (root: Group, targetSize: number) => {
  root.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(root)
  if (box.isEmpty()) {
    return
  }

  const size = new Vector3()
  const center = new Vector3()
  box.getSize(size)
  box.getCenter(center)

  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim <= Number.EPSILON) {
    return
  }

  const scale = targetSize / maxDim
  root.scale.multiplyScalar(scale)
  root.position.set(root.position.x - center.x * scale, root.position.y - center.y * scale, root.position.z - center.z * scale)
}

const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(
  {
    nodeMaterial,
    backgroundMaterial,
    previewGeometry,
    captureMode,
    onRendererLabelChange,
    onPreviewGeometryErrorChange,
    onPreviewGeometryFallback,
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const materialSphereRef = useRef<Mesh | null>(null)
  const materialCubeRef = useRef<Mesh | null>(null)
  const materialPlaneRef = useRef<Mesh | null>(null)
  const materialTotemRootRef = useRef<Group | null>(null)
  const materialTotemMeshesRef = useRef<Mesh[]>([])
  const backgroundSphereRef = useRef<Mesh | null>(null)
  const defaultMaterialRef = useRef<MeshStandardMaterial | null>(null)
  const defaultBackgroundMaterialRef = useRef<MeshStandardMaterial | null>(null)
  const cameraRef = useRef<PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const previewGeometryRef = useRef<PreviewGeometry>(previewGeometry)
  const onRendererLabelChangeRef = useRef(onRendererLabelChange)
  const onPreviewGeometryErrorChangeRef = useRef(onPreviewGeometryErrorChange)
  const onPreviewGeometryFallbackRef = useRef(onPreviewGeometryFallback)

  useEffect(() => {
    previewGeometryRef.current = previewGeometry
  }, [previewGeometry])

  useEffect(() => {
    onRendererLabelChangeRef.current = onRendererLabelChange
  }, [onRendererLabelChange])

  useEffect(() => {
    onPreviewGeometryErrorChangeRef.current = onPreviewGeometryErrorChange
  }, [onPreviewGeometryErrorChange])

  useEffect(() => {
    onPreviewGeometryFallbackRef.current = onPreviewGeometryFallback
  }, [onPreviewGeometryFallback])

  useImperativeHandle(ref, () => ({
    resetView: () => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) {
        return
      }
      camera.position.set(DEFAULT_CAMERA_POSITION.x, DEFAULT_CAMERA_POSITION.y, DEFAULT_CAMERA_POSITION.z)
      controls.target.set(0, 0, 0)
      controls.update()
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    let disposed = false
    let cleanup: (() => void) | undefined

    const start = async () => {
      const scene = new Scene()
      const camera = new PerspectiveCamera(40, 1, 0.1, 100)
      camera.position.set(DEFAULT_CAMERA_POSITION.x, DEFAULT_CAMERA_POSITION.y, DEFAULT_CAMERA_POSITION.z)
      camera.lookAt(0, 0, 0)
      cameraRef.current = camera

      const defaultMaterial = new MeshStandardMaterial({ color: 0xc5d4db, metalness: 0, roughness: 0.5 })
      const sphere = new Mesh(new SphereGeometry(0.9, 96, 96), defaultMaterial)
      const cube = new Mesh(new BoxGeometry(1.45, 1.45, 1.45), defaultMaterial)
      const plane = new Mesh(createUvPlaneGeometry(PREVIEW_TARGET_SIZE), defaultMaterial)
      defaultMaterialRef.current = defaultMaterial
      materialSphereRef.current = sphere
      materialCubeRef.current = cube
      materialPlaneRef.current = plane
      sphere.visible = false
      cube.visible = false
      plane.visible = false
      scene.add(sphere)
      scene.add(cube)
      scene.add(plane)

      try {
        const gltf = await new GLTFLoader().loadAsync(TOTEM_MODEL_URL)
        const totemRoot = gltf.scene
        normalizePreviewModel(totemRoot, PREVIEW_TARGET_SIZE)
        const allMeshes: Mesh[] = []
        totemRoot.traverse((entry) => {
          if ((entry as Mesh).isMesh) {
            allMeshes.push(entry as Mesh)
          }
        })
        const namedMeshes = allMeshes.filter((mesh) => mesh.name === 'Calibration_Mesh' || mesh.name === 'Preview_Mesh')
        materialTotemMeshesRef.current = namedMeshes.length > 0 ? namedMeshes : allMeshes
        materialTotemRootRef.current = totemRoot
        ;(totemRoot as unknown as { visible: boolean }).visible = true
        scene.add(totemRoot)
        onPreviewGeometryErrorChangeRef.current(undefined)
      } catch {
        onPreviewGeometryErrorChangeRef.current('Could not load ShaderBall totem model; falling back to primitive previews.')
        if (previewGeometryRef.current === 'totem') {
          onPreviewGeometryFallbackRef.current('sphere')
        }
      }

      const applyPreviewMaterial = (material: unknown) => {
        const sphereMesh = materialSphereRef.current
        const cubeMesh = materialCubeRef.current
        const planeMesh = materialPlaneRef.current
        if (sphereMesh) {
          ;(sphereMesh as unknown as { material: unknown }).material = material
        }
        if (cubeMesh) {
          ;(cubeMesh as unknown as { material: unknown }).material = material
        }
        if (planeMesh) {
          ;(planeMesh as unknown as { material: unknown }).material = material
        }
        for (const mesh of materialTotemMeshesRef.current) {
          ;(mesh as unknown as { material: unknown }).material = material
        }
      }

      const updatePreviewGeometryVisibility = (value: PreviewGeometry) => {
        const sphereMesh = materialSphereRef.current
        const cubeMesh = materialCubeRef.current
        const planeMesh = materialPlaneRef.current
        const totemRoot = materialTotemRootRef.current
        if (sphereMesh) {
          sphereMesh.visible = value === 'sphere'
        }
        if (cubeMesh) {
          cubeMesh.visible = value === 'cube'
        }
        if (planeMesh) {
          planeMesh.visible = value === 'plane'
        }
        if (totemRoot) {
          ;(totemRoot as unknown as { visible: boolean }).visible = value === 'totem'
        }
      }

      const defaultBackgroundMaterial = new MeshStandardMaterial({
        color: 0x999999,
        roughness: 1,
        metalness: 0,
        side: BackSide,
      })
      const backgroundSphere = new Mesh(new SphereGeometry(20, 64, 64), defaultBackgroundMaterial)
      defaultBackgroundMaterialRef.current = defaultBackgroundMaterial
      backgroundSphereRef.current = backgroundSphere
      scene.add(backgroundSphere)

      scene.add(new AmbientLight(0xffffff, 0.45))
      const keyLight = new DirectionalLight(0xffffff, 1.1)
      keyLight.position.set(2, 3, 4)
      scene.add(keyLight)

      let environmentTexture: Awaited<ReturnType<HDRLoader['loadAsync']>> | undefined
      try {
        environmentTexture = await new HDRLoader().loadAsync(ENV_MAP_URL)
        environmentTexture.mapping = EquirectangularReflectionMapping
        scene.environment = environmentTexture
      } catch (error) {
        console.warn('Failed to load viewer environment map', error)
      }

      applyPreviewMaterial(nodeMaterial ?? defaultMaterial)
      updatePreviewGeometryVisibility(previewGeometryRef.current)
      ;(backgroundSphere as unknown as { material: unknown }).material = backgroundMaterial ?? defaultBackgroundMaterial
      if (backgroundMaterial) {
        ;(backgroundMaterial as unknown as { side?: number }).side = BackSide
      }

      let renderer:
        | WebGLRenderer
        | { render: (scene: Scene, camera: PerspectiveCamera) => void; setSize: (w: number, h: number) => void; dispose: () => void }
      const useWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator
      if (useWebGPU) {
        try {
          const webgpu = await import('three/webgpu')
          const gpuRenderer = new webgpu.WebGPURenderer({ canvas, antialias: true })
          await gpuRenderer.init()
          renderer = gpuRenderer
          onRendererLabelChangeRef.current('WebGPU + TSL')
        } catch {
          renderer = new WebGLRenderer({ canvas, antialias: true })
          onRendererLabelChangeRef.current('WebGL fallback')
        }
      } else {
        renderer = new WebGLRenderer({ canvas, antialias: true })
        onRendererLabelChangeRef.current('WebGL fallback')
      }

      const resize = () => {
        const viewport = viewportRef.current
        const width = captureMode ? 512 : Math.max(1, Math.floor(viewport?.clientWidth ?? 640))
        const height = captureMode ? 512 : Math.max(1, Math.floor(viewport?.clientHeight ?? 360))
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
      }

      resize()
      const controls = new OrbitControls(camera, canvas)
      controls.enablePan = false
      controls.enableDamping = true
      controlsRef.current = controls
      let resizeFrame = 0
      let frameId = 0
      const tick = () => {
        if (disposed) {
          return
        }
        controls.update()
        renderer.render(scene, camera)
        frameId = window.requestAnimationFrame(tick)
      }
      tick()

      const observer = new ResizeObserver(() => {
        if (resizeFrame !== 0) {
          return
        }
        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = 0
          resize()
        })
      })
      observer.observe(viewportRef.current ?? canvas)

      cleanup = () => {
        disposed = true
        observer.disconnect()
        if (resizeFrame !== 0) {
          window.cancelAnimationFrame(resizeFrame)
        }
        window.cancelAnimationFrame(frameId)
        controls.dispose()
        renderer.dispose()
        environmentTexture?.dispose()
        sphere.geometry.dispose()
        cube.geometry.dispose()
        plane.geometry.dispose()
        defaultMaterial.dispose()
        defaultBackgroundMaterial.dispose()
        backgroundSphere.geometry.dispose()
        materialSphereRef.current = null
        materialCubeRef.current = null
        materialPlaneRef.current = null
        materialTotemRootRef.current?.traverse((entry) => {
          if ((entry as Mesh).isMesh) {
            ;(entry as Mesh).geometry.dispose()
          }
        })
        materialTotemRootRef.current = null
        materialTotemMeshesRef.current = []
        backgroundSphereRef.current = null
        defaultMaterialRef.current = null
        defaultBackgroundMaterialRef.current = null
        cameraRef.current = null
        controlsRef.current = null
      }
    }

    void start()

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  useEffect(() => {
    const sphere = materialSphereRef.current
    const cube = materialCubeRef.current
    const plane = materialPlaneRef.current
    const defaultMaterial = defaultMaterialRef.current
    const resolvedMaterial = nodeMaterial ?? defaultMaterial ?? sphere?.material ?? cube?.material ?? plane?.material
    if (sphere) {
      ;(sphere as unknown as { material: unknown }).material = resolvedMaterial
    }
    if (cube) {
      ;(cube as unknown as { material: unknown }).material = resolvedMaterial
    }
    if (plane) {
      ;(plane as unknown as { material: unknown }).material = resolvedMaterial
    }
    for (const mesh of materialTotemMeshesRef.current) {
      ;(mesh as unknown as { material: unknown }).material = resolvedMaterial
    }
  }, [nodeMaterial])

  useEffect(() => {
    const sphere = materialSphereRef.current
    const cube = materialCubeRef.current
    const plane = materialPlaneRef.current
    const totemRoot = materialTotemRootRef.current
    if (sphere) {
      sphere.visible = previewGeometry === 'sphere'
    }
    if (cube) {
      cube.visible = previewGeometry === 'cube'
    }
    if (plane) {
      plane.visible = previewGeometry === 'plane'
    }
    if (totemRoot) {
      ;(totemRoot as unknown as { visible: boolean }).visible = previewGeometry === 'totem'
    }
  }, [previewGeometry])

  useEffect(() => {
    const backgroundSphere = backgroundSphereRef.current
    if (!backgroundSphere) {
      return
    }
    const defaultBackgroundMaterial = defaultBackgroundMaterialRef.current
    if (backgroundMaterial) {
      ;(backgroundMaterial as unknown as { side?: number }).side = BackSide
    }
    ;(backgroundSphere as unknown as { material: unknown }).material =
      backgroundMaterial ?? defaultBackgroundMaterial ?? backgroundSphere.material
  }, [backgroundMaterial])

  return (
    <div
      ref={viewportRef}
      className={
        captureMode
          ? 'h-[512px] w-[512px] overflow-hidden rounded-lg border border-border/90 bg-background shadow-inner'
          : 'h-[420px] w-full overflow-hidden rounded-lg border border-border/90 bg-background shadow-inner'
      }
      data-testid="viewer-render-target"
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        data-testid="viewer-canvas"
        height={captureMode ? 512 : undefined}
        width={captureMode ? 512 : undefined}
      />
    </div>
  )
})

export default Viewer
