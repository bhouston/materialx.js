import { mx_srgb_texture_to_lin_rec709 } from 'three/tsl';

export const applyTextureColorSpace = (documentColorSpace: string | undefined, sampleNode: unknown): unknown => {
  if (!documentColorSpace) {
    return sampleNode;
  }

  if (documentColorSpace === 'srgb_texture') {
    return mx_srgb_texture_to_lin_rec709(sampleNode as never);
  }

  return sampleNode;
};
