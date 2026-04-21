import { Box3, PlaneGeometry, Vector3, type BufferGeometry, type Material } from 'three';
import type { Group, Mesh } from 'three';
import * as MikkTSpace from 'three/addons/libs/mikktspace.module.js';
import { computeMikkTSpaceTangents } from 'three/addons/utils/BufferGeometryUtils.js';

export const PREVIEW_TARGET_SIZE = 1.8;
export const TOTEM_MODEL_URL = '/models/ShaderBall.glb';
export const ENV_MAP_URL = 'https://api.landofassets.com/media/BenHouston3D/Samples/PaulLobeHaus/image/hdr';

export const DEFAULT_CAMERA_POSITION = { x: 0, y: 0, z: 3.2 } as const;

export const ensureTangents = async (geometry: BufferGeometry): Promise<boolean> => {
  if (geometry.getAttribute('tangent')) {
    return true;
  }
  if (!geometry.getAttribute('position') || !geometry.getAttribute('normal') || !geometry.getAttribute('uv')) {
    return false;
  }
  try {
    await MikkTSpace.ready;
    computeMikkTSpaceTangents(geometry, MikkTSpace);
    return true;
  } catch (error) {
    // Keep rendering if tangent generation fails for a geometry.
    console.warn('Failed to compute tangents for preview geometry', error);
    return false;
  }
};

export const createUvPlaneGeometry = (size: number) => {
  const geometry = new PlaneGeometry(size, size, 1, 1);
  const half = size / 2;
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');

  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, position.getX(index) / half, position.getY(index) / half);
  }
  uv.needsUpdate = true;

  return geometry;
};

export const normalizePreviewModel = (root: Group, targetSize: number) => {
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
    root.position.z - center.z * scale,
  );
};

export const collectMaterials = (mesh: Mesh): Material[] => {
  const material = mesh.material;
  return Array.isArray(material) ? material : [material];
};

export const disposeMaterials = (materials: Iterable<Material>) => {
  for (const material of materials) {
    material.dispose();
  }
};
