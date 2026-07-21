export type VideoMode = 'msr' | 'mkr' | 'mkr-grid';

export interface MkrFrameConfig {
  layerId: string;
  frameIndex: number;
  prompt: string;
}

export interface DialogueEntry {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string;
}

export interface VideoNodeConfig {
  mode: VideoMode;
  msr: {
    prompt: string;
    cameraPreset?: string;
    cameraIntensity?: number;
    lightingPreset?: string;
    lightingIntensity?: number;
    dialogues?: DialogueEntry[];
  };
  mkr: {
    frames: MkrFrameConfig[];
  };
  mkrGrid: {
    gridtype: number;
    gridFrameIndexs: number[];
  };
  globalPrompt: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
}

export const GRID_TYPES = [4, 6, 9] as const;

export const VIDEO_SIZE_PRESETS = [
  { label: '横屏 720p', width: 1280, height: 704 },
  { label: '测试 640p', width: 640, height: 320 },
  { label: '竖屏 720p', width: 704, height: 1280 },
  { label: '方形 720p', width: 704, height: 704 },
] as const;

export const CAMERA_PRESETS = [
  { id: 'none', label: '无' },
  { id: 'push-in', label: '推' },
  { id: 'pull-out', label: '拉' },
  { id: 'pan-left', label: '左移' },
  { id: 'pan-right', label: '右移' },
  { id: 'tilt-up', label: '上摇' },
  { id: 'tilt-down', label: '下摇' },
  { id: 'follow', label: '跟随' },
  { id: 'orbit', label: '环绕' },
  { id: 'shake', label: '抖动' },
] as const;

export const LIGHTING_PRESETS = [
  { id: 'none', label: '无' },
  { id: 'front', label: '前光' },
  { id: 'side', label: '侧光' },
  { id: 'rim', label: '轮廓' },
  { id: 'top', label: '顶光' },
  { id: 'bottom', label: '底光' },
  { id: 'rembrandt', label: '伦勃朗' },
  { id: 'butterfly', label: '蝴蝶光' },
  { id: 'neon', label: '霓虹' },
  { id: 'golden-hour', label: '黄金时刻' },
] as const;

export const TOTAL_FRAMES = 360;

export function getAvailableModes(sourceImageCount: number): VideoMode[] {
  if (sourceImageCount === 0) return [];
  if (sourceImageCount === 1) return ['msr', 'mkr-grid'];
  if (sourceImageCount === 2) return ['msr', 'mkr'];
  return ['mkr'];
}

export function buildDefaultConfig(
  sourceLayerIds: string[] | undefined,
  mode?: VideoMode
): VideoNodeConfig {
  const ids = sourceLayerIds || [];
  const gridFrames = Math.max(ids.length || 4, 4);
  const clampedGridType = [4, 6, 9].includes(gridFrames)
    ? gridFrames
    : 4;

  const autoMode = mode || (() => {
    const modes = getAvailableModes(ids.length);
    return modes[0] || 'mkr';
  })();

  return {
    mode: autoMode,
    msr: {
      prompt: '',
      cameraPreset: 'none',
      cameraIntensity: 5,
      lightingPreset: 'none',
      lightingIntensity: 5,
      dialogues: [],
    },
    mkr: {
      frames: ids.map((id, i) => ({
        layerId: id,
        frameIndex:
          i === 0
            ? 0
            : i === ids.length - 1
              ? -1
              : Math.round((i * TOTAL_FRAMES) / (ids.length - 1)),
        prompt: '',
      })),
    },
    mkrGrid: {
      gridtype: clampedGridType,
      gridFrameIndexs: new Array(clampedGridType)
        .fill(0)
        .map((_, i) =>
          i === 0
            ? 0
            : Math.round((i * TOTAL_FRAMES) / (clampedGridType - 1))
        ),
    },
    globalPrompt: '',
    duration: 12,
    fps: 30,
    width: 640,
    height: 320,
  };
}
