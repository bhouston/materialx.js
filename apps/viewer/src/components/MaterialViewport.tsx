import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  BackSide,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
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
  const backgroundSphereRef = useRef<Mesh | null>(null);
  const defaultMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const defaultBackgroundMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const [rendererLabel, setRendererLabel] = useState('WebGL fallback');

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
      camera.position.set(0, 0, 3.2);
      camera.lookAt(0, 0, 0);

      const defaultMaterial = new MeshStandardMaterial({ color: 0xc5d4db, metalness: 0, roughness: 0.5 });
      const sphere = new Mesh(
        new SphereGeometry(0.9, 96, 96),
        defaultMaterial
      );
      defaultMaterialRef.current = defaultMaterial;
      materialSphereRef.current = sphere;
      scene.add(sphere);
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

      (sphere as unknown as { material: unknown }).material = nodeMaterial ?? defaultMaterial;
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
        const width = Math.max(1, Math.floor(viewport?.clientWidth ?? canvas.clientWidth ?? 640));
        const height = Math.max(1, Math.floor(viewport?.clientHeight ?? canvas.clientHeight ?? 360));
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      resize();
      let resizeFrame = 0;
      let frameId = 0;
      const tick = () => {
        if (disposed) {
          return;
        }
        sphere.rotation.y += 0.005;
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
        renderer.dispose();
        environmentTexture?.dispose();
        sphere.geometry.dispose();
        defaultMaterial.dispose();
        defaultBackgroundMaterial.dispose();
        backgroundSphere.geometry.dispose();
        materialSphereRef.current = null;
        backgroundSphereRef.current = null;
        defaultMaterialRef.current = null;
        defaultBackgroundMaterialRef.current = null;
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
    if (!sphere) {
      return;
    }
    const defaultMaterial = defaultMaterialRef.current;
    (sphere as unknown as { material: unknown }).material = nodeMaterial ?? defaultMaterial ?? sphere.material;
  }, [nodeMaterial]);

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

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <strong className="font-semibold">Preview</strong>
        <div className="flex items-center gap-2">
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
          <span className="text-muted-foreground">{rendererLabel}</span>
        </div>
      </div>
      {backgroundError ? <p className="mb-2 mt-0 text-xs text-destructive">{backgroundError}</p> : null}
      <div
        ref={viewportRef}
        className="h-[360px] w-full overflow-hidden rounded-md border border-border bg-background"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
    </section>
  );
}
