import type { PanoramaScreenshotMode } from '../types/canvas';

export interface ScreenshotResult {
  dataUrl: string;
  yaw: number;
  pitch: number;
  label: string;
}

export const PANORAMA_DEFAULTS = {
  fov: 75,
  yaw: 0,
  pitch: 0,
  fovMin: 35,
  fovMax: 100,
  pitchMax: 85,
  sphereRadius: 500,
  sphereSegmentsW: 64,
  sphereSegmentsH: 64,
  dragSensitivity: 0.02,
  wheelZoomStep: 5,
  renderLongSide: 1536,
} as const;

export const VIEW_ANGLE_LABELS: Record<PanoramaScreenshotMode, { yaw: number; label: string }[]> = {
  single: [{ yaw: 0, label: '当前视角' }],
  quad: [
    { yaw: 0, label: '正面' },
    { yaw: 90, label: '右侧' },
    { yaw: 180, label: '背面' },
    { yaw: 270, label: '左侧' },
  ],
  dodeca: Array.from({ length: 12 }, (_, i) => ({
    yaw: i * 30,
    label: `${i * 30}°`,
  })),
  custom: [],
};

export function isLikelyPanoramaImage(
  fileName?: string,
  naturalW?: number,
  naturalH?: number,
): boolean {
  if (fileName && /(?:360|全景|环景|panorama|equirect|spherical|vr(?:$|\s|_|\.))/i.test(fileName)) {
    return true;
  }
  if (naturalW && naturalH && naturalW > 0 && naturalH > 0) {
    const aspect = naturalW / naturalH;
    if (aspect >= 1.9 && aspect <= 2.1) return true;
  }
  return false;
}

export function computePanoramaResolution(longSide: number = PANORAMA_DEFAULTS.renderLongSide): { w: number; h: number } {
  const aspect = 16 / 9;
  return { w: longSide, h: Math.max(1, Math.round(longSide / aspect)) };
}

export function clampFov(fov: number): number {
  return Math.max(PANORAMA_DEFAULTS.fovMin, Math.min(PANORAMA_DEFAULTS.fovMax, fov));
}

export function clampPitch(pitch: number): number {
  return Math.max(-PANORAMA_DEFAULTS.pitchMax, Math.min(PANORAMA_DEFAULTS.pitchMax, pitch));
}
