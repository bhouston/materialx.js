import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
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

interface MaterialViewportProps {
  nodeMaterial?: MeshPhysicalNodeMaterial;
}

const ENV_MAP_URL =
  'https://api.landofassets.com/media/BenHouston3D/Samples/PaulLobeHaus/image/hdr';

export default function MaterialViewport({ nodeMaterial }: MaterialViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

      const sphere = new Mesh(
        new SphereGeometry(0.9, 96, 96),
        new MeshStandardMaterial({ color: 0xc5d4db, metalness: 0, roughness: 0.5 })
      );
      scene.add(sphere);

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
        console.warn('Failed to load previewer environment map', error);
      }

      if (nodeMaterial) {
        (sphere as unknown as { material: unknown }).material = nodeMaterial;
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
      };
    };

    void start();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [nodeMaterial]);

  return (
    <section className="island-shell rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <strong>Preview</strong>
        <span>{rendererLabel}</span>
      </div>
      <div
        ref={viewportRef}
        className="h-[360px] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
    </section>
  );
}
