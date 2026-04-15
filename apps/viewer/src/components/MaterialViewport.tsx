import { useEffect, useRef, useState } from 'react';
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
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import type { MeshPhysicalNodeMaterial } from 'three/webgpu';
import type { MaterialXBackgroundPack } from '../lib/backgrounds';

interface MaterialViewportProps {
  nodeMaterial?: MeshPhysicalNodeMaterial;
  backgroundMaterial?: MeshPhysicalNodeMaterial;
  backgroundPacks: MaterialXBackgroundPack[];
  selectedBackground: string;
  onBackgroundChange: (backgroundId: string) => void;
  backgroundError?: string;
}

const ENV_MAP_URL =
  'https://api.landofassets.com/media/BenHouston3D/Samples/PaulLobeHaus/image/hdr';
const DEFAULT_CAMERA_POSITION = { x: 0, y: 0, z: 3.2 };
type PreviewGeometry = 'totem' | 'sphere' | 'cube';
const TOTEM_MODEL_URL = '/models/ShaderBall.glb';
const PREVIEW_TARGET_SIZE = 1.8;

const normalizePreviewModel = (root: Group, targetSize: number) => {
  root.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) {
    return;
  }

  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim <= Number.EPSILON) {
    return;
  }

  const scale = targetSize / maxDim;
  root.scale.multiplyScalar(scale);
  root.position.set(
    root.position.x - center.x * scale,
    root.position.y - center.y * scale,
    root.position.z - center.z * scale
  );
};

export default function MaterialViewport({
  nodeMaterial,
  backgroundMaterial,
  backgroundPacks,
  selectedBackground,
  onBackgroundChange,
  backgroundError,
}: MaterialViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const materialSphereRef = useRef<Mesh | null>(null);
  const materialCubeRef = useRef<Mesh | null>(null);
  const materialTotemRootRef = useRef<Group | null>(null);
  const materialTotemMeshesRef = useRef<Mesh[]>([]);
  const backgroundSphereRef = useRef<Mesh | null>(null);
  const defaultMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const defaultBackgroundMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [rendererLabel, setRendererLabel] = useState('WebGL fallback');
  const [previewGeometry, setPreviewGeometry] = useState<PreviewGeometry>('totem');
  const [previewGeometryError, setPreviewGeometryError] = useState<string>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      const scene = new Scene();
      const camera = new PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(DEFAULT_CAMERA_POSITION.x, DEFAULT_CAMERA_POSITION.y, DEFAULT_CAMERA_POSITION.z);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      const defaultMaterial = new MeshStandardMaterial({ color: 0xc5d4db, metalness: 0, roughness: 0.5 });
      const sphere = new Mesh(new SphereGeometry(0.9, 96, 96), defaultMaterial);
      const cube = new Mesh(new BoxGeometry(1.45, 1.45, 1.45), defaultMaterial);
      defaultMaterialRef.current = defaultMaterial;
      materialSphereRef.current = sphere;
      materialCubeRef.current = cube;
      sphere.visible = false;
      cube.visible = false;
      scene.add(sphere);
      scene.add(cube);

      try {
        const gltf = await new GLTFLoader().loadAsync(TOTEM_MODEL_URL);
        const totemRoot = gltf.scene;
        normalizePreviewModel(totemRoot, PREVIEW_TARGET_SIZE);
        const allMeshes: Mesh[] = [];
        totemRoot.traverse((entry) => {
          if ((entry as Mesh).isMesh) {
            allMeshes.push(entry as Mesh);
          }
        });
        const namedMeshes = allMeshes.filter((mesh) => mesh.name === 'Calibration_Mesh' || mesh.name === 'Preview_Mesh');
        materialTotemMeshesRef.current = namedMeshes.length > 0 ? namedMeshes : allMeshes;
        materialTotemRootRef.current = totemRoot;
        (totemRoot as unknown as { visible: boolean }).visible = true;
        scene.add(totemRoot);
        setPreviewGeometryError(undefined);
      } catch (error) {
        setPreviewGeometryError('Could not load ShaderBall totem model; falling back to primitive previews.');
        if (previewGeometry === 'totem') {
          setPreviewGeometry('sphere');
        }
      }

      const applyPreviewMaterial = (material: unknown) => {
        const sphereMesh = materialSphereRef.current;
        const cubeMesh = materialCubeRef.current;
        if (sphereMesh) {
          (sphereMesh as unknown as { material: unknown }).material = material;
        }
        if (cubeMesh) {
          (cubeMesh as unknown as { material: unknown }).material = material;
        }
        for (const mesh of materialTotemMeshesRef.current) {
          (mesh as unknown as { material: unknown }).material = material;
        }
      };
      const updatePreviewGeometryVisibility = (value: PreviewGeometry) => {
        const sphereMesh = materialSphereRef.current;
        const cubeMesh = materialCubeRef.current;
        const totemRoot = materialTotemRootRef.current;
        if (sphereMesh) {
          sphereMesh.visible = value === 'sphere';
        }
        if (cubeMesh) {
          cubeMesh.visible = value === 'cube';
        }
        if (totemRoot) {
          (totemRoot as unknown as { visible: boolean }).visible = value === 'totem';
        }
      };
      const defaultBackgroundMaterial = new MeshStandardMaterial({
        color: 0x999999,
        roughness: 1,
        metalness: 0,
        side: BackSide,
      });
      const backgroundSphere = new Mesh(new SphereGeometry(20, 64, 64), defaultBackgroundMaterial);
      defaultBackgroundMaterialRef.current = defaultBackgroundMaterial;
      backgroundSphereRef.current = backgroundSphere;
      scene.add(backgroundSphere);

      scene.add(new AmbientLight(0xffffff, 0.45));
      const keyLight = new DirectionalLight(0xffffff, 1.1);
      keyLight.position.set(2, 3, 4);
      scene.add(keyLight);

      let environmentTexture: Awaited<ReturnType<RGBELoader['loadAsync']>> | undefined;
      try {
        environmentTexture = await new RGBELoader().loadAsync(ENV_MAP_URL);
        environmentTexture.mapping = EquirectangularReflectionMapping;
        scene.environment = environmentTexture;
      } catch (error) {
        console.warn('Failed to load viewer environment map', error);
      }

      applyPreviewMaterial(nodeMaterial ?? defaultMaterial);
      updatePreviewGeometryVisibility(previewGeometry);
      (backgroundSphere as unknown as { material: unknown }).material = backgroundMaterial ?? defaultBackgroundMaterial;
      if (backgroundMaterial) {
        (backgroundMaterial as unknown as { side?: number }).side = BackSide;
      }

      let renderer: WebGLRenderer | { render: (scene: Scene, camera: PerspectiveCamera) => void; setSize: (w: number, h: number) => void; dispose: () => void };
      const useWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
      if (useWebGPU) {
        try {
          const webgpu = await import('three/webgpu');
          const gpuRenderer = new webgpu.WebGPURenderer({ canvas, antialias: true });
          await gpuRenderer.init();
          renderer = gpuRenderer;
          setRendererLabel('WebGPU + TSL');
        } catch {
          renderer = new WebGLRenderer({ canvas, antialias: true });
          setRendererLabel('WebGL fallback');
        }
      } else {
        renderer = new WebGLRenderer({ canvas, antialias: true });
        setRendererLabel('WebGL fallback');
      }

      const resize = () => {
        const viewport = viewportRef.current;
        const width = Math.max(1, Math.floor(viewport?.clientWidth ?? 640));
        const height = Math.max(1, Math.floor(viewport?.clientHeight ?? 360));
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      resize();
      const controls = new OrbitControls(camera, canvas);
      controls.enablePan = false;
      controls.enableDamping = true;
      controlsRef.current = controls;
      let resizeFrame = 0;
      let frameId = 0;
      const tick = () => {
        if (disposed) {
          return;
        }
        controls.update();
        renderer.render(scene, camera);
        frameId = window.requestAnimationFrame(tick);
      };
      tick();

      const observer = new ResizeObserver(() => {
        if (resizeFrame !== 0) {
          return;
        }
        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = 0;
          resize();
        });
      });
      observer.observe(viewportRef.current ?? canvas);

      cleanup = () => {
        disposed = true;
        observer.disconnect();
        if (resizeFrame !== 0) {
          window.cancelAnimationFrame(resizeFrame);
        }
        window.cancelAnimationFrame(frameId);
        controls.dispose();
        renderer.dispose();
        environmentTexture?.dispose();
        sphere.geometry.dispose();
        cube.geometry.dispose();
        defaultMaterial.dispose();
        defaultBackgroundMaterial.dispose();
        backgroundSphere.geometry.dispose();
        materialSphereRef.current = null;
        materialCubeRef.current = null;
        materialTotemRootRef.current?.traverse((entry) => {
          if ((entry as Mesh).isMesh) {
            (entry as Mesh).geometry.dispose();
          }
        });
        materialTotemRootRef.current = null;
        materialTotemMeshesRef.current = [];
        backgroundSphereRef.current = null;
        defaultMaterialRef.current = null;
        defaultBackgroundMaterialRef.current = null;
        cameraRef.current = null;
        controlsRef.current = null;
      };
    };

    void start();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const sphere = materialSphereRef.current;
    const cube = materialCubeRef.current;
    const defaultMaterial = defaultMaterialRef.current;
    const resolvedMaterial = nodeMaterial ?? defaultMaterial ?? sphere?.material ?? cube?.material;
    if (sphere) {
      (sphere as unknown as { material: unknown }).material = resolvedMaterial;
    }
    if (cube) {
      (cube as unknown as { material: unknown }).material = resolvedMaterial;
    }
    for (const mesh of materialTotemMeshesRef.current) {
      (mesh as unknown as { material: unknown }).material = resolvedMaterial;
    }
  }, [nodeMaterial]);

  useEffect(() => {
    const sphere = materialSphereRef.current;
    const cube = materialCubeRef.current;
    const totemRoot = materialTotemRootRef.current;
    if (sphere) {
      sphere.visible = previewGeometry === 'sphere';
    }
    if (cube) {
      cube.visible = previewGeometry === 'cube';
    }
    if (totemRoot) {
      (totemRoot as unknown as { visible: boolean }).visible = previewGeometry === 'totem';
    }
  }, [previewGeometry]);

  useEffect(() => {
    const backgroundSphere = backgroundSphereRef.current;
    if (!backgroundSphere) {
      return;
    }
    const defaultBackgroundMaterial = defaultBackgroundMaterialRef.current;
    if (backgroundMaterial) {
      (backgroundMaterial as unknown as { side?: number }).side = BackSide;
    }
    (backgroundSphere as unknown as { material: unknown }).material =
      backgroundMaterial ?? defaultBackgroundMaterial ?? backgroundSphere.material;
  }, [backgroundMaterial]);

  const handleResetView = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }
    camera.position.set(DEFAULT_CAMERA_POSITION.x, DEFAULT_CAMERA_POSITION.y, DEFAULT_CAMERA_POSITION.z);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <strong className="font-semibold">Preview</strong>
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground" htmlFor="preview-geometry">
            Model
          </label>
          <select
            className="min-w-[110px] rounded-md border border-input bg-background px-2 py-1 text-xs"
            id="preview-geometry"
            onChange={(event) => setPreviewGeometry(event.target.value as PreviewGeometry)}
            value={previewGeometry}
          >
            <option value="totem">Totem</option>
            <option value="sphere">Sphere</option>
            <option value="cube">Cube</option>
          </select>
          <label className="text-muted-foreground" htmlFor="background">
            Background
          </label>
          <select
            className="min-w-[140px] rounded-md border border-input bg-background px-2 py-1 text-xs"
            id="background"
            onChange={(event) => onBackgroundChange(event.target.value)}
            value={selectedBackground}
          >
            {backgroundPacks.map((background) => (
              <option key={background.id} value={background.id}>
                {background.directory}
              </option>
            ))}
          </select>
          <button
            className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted"
            onClick={handleResetView}
            type="button"
          >
            Reset view
          </button>
          <span className="text-muted-foreground">{rendererLabel}</span>
        </div>
      </div>
      {backgroundError ? <p className="mb-2 mt-0 text-xs text-destructive">{backgroundError}</p> : null}
      {previewGeometryError ? <p className="mb-2 mt-0 text-xs text-destructive">{previewGeometryError}</p> : null}
      <div
        ref={viewportRef}
        className="h-[360px] w-full overflow-hidden rounded-md border border-border bg-background"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
    </section>
  );
}
