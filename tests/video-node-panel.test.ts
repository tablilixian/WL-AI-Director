import { describe, it, expect } from 'vitest';
import {
  getAvailableModes,
  buildDefaultConfig,
  TOTAL_FRAMES,
  GRID_TYPES,
  VIDEO_SIZE_PRESETS,
  CAMERA_PRESETS,
  LIGHTING_PRESETS,
} from '../src/modules/canvas/types/video';
import type { VideoMode } from '../src/modules/canvas/types/video';

describe('getAvailableModes', () => {
  it('returns empty array for 0 source images', () => {
    expect(getAvailableModes(0)).toEqual([]);
  });

  it('returns [msr, mkr-grid] for 1 source image', () => {
    const modes = getAvailableModes(1);
    expect(modes).toContain('msr');
    expect(modes).toContain('mkr-grid');
    expect(modes).toHaveLength(2);
  });

  it('returns [msr, mkr] for 2 source images', () => {
    const modes = getAvailableModes(2);
    expect(modes).toContain('msr');
    expect(modes).toContain('mkr');
    expect(modes).toHaveLength(2);
  });

  it('returns [mkr] for 3+ source images', () => {
    expect(getAvailableModes(3)).toEqual(['mkr']);
    expect(getAvailableModes(5)).toEqual(['mkr']);
    expect(getAvailableModes(10)).toEqual(['mkr']);
  });
});

describe('buildDefaultConfig', () => {
  it('builds config with correct default mode for 1 source', () => {
    const config = buildDefaultConfig(['img1']);
    expect(config.mode).toBe('msr');
  });

  it('builds config with correct default mode for 2 sources', () => {
    const config = buildDefaultConfig(['img1', 'img2']);
    expect(config.mode).toBe('msr');
  });

  it('builds config with mkr mode for 3+ sources', () => {
    const config = buildDefaultConfig(['img1', 'img2', 'img3']);
    expect(config.mode).toBe('mkr');
  });

  it('builds config with empty array falls back to mkr mode', () => {
    const config = buildDefaultConfig([]);
    expect(config.mode).toBe('mkr');
    expect(config.mkr.frames).toHaveLength(0);
  });

  it('respects explicitly passed mode', () => {
    const config = buildDefaultConfig(['img1', 'img2'], 'mkr-grid');
    expect(config.mode).toBe('mkr-grid');
  });

  it('generates correct number of MKR frames', () => {
    const ids = ['a', 'b', 'c'];
    const config = buildDefaultConfig(ids, 'mkr');
    expect(config.mkr.frames).toHaveLength(3);
    expect(config.mkr.frames[0].layerId).toBe('a');
    expect(config.mkr.frames[1].layerId).toBe('b');
    expect(config.mkr.frames[2].layerId).toBe('c');
  });

  it('assigns -1 to last MKR frame index', () => {
    const config = buildDefaultConfig(['a', 'b', 'c', 'd'], 'mkr');
    const last = config.mkr.frames[config.mkr.frames.length - 1];
    expect(last.frameIndex).toBe(-1);
  });

  it('assigns 0 to first MKR frame index', () => {
    const config = buildDefaultConfig(['a', 'b'], 'mkr');
    expect(config.mkr.frames[0].frameIndex).toBe(0);
  });

  it('defaults gridtype to 4 when no source layers', () => {
    const config = buildDefaultConfig([], 'mkr-grid');
    expect(config.mkrGrid.gridtype).toBe(4);
    expect(config.mkrGrid.gridFrameIndexs).toHaveLength(4);
  });

  it('defaults gridtype based on source layer count', () => {
    const config = buildDefaultConfig(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      'mkr-grid'
    );
    expect(config.mkrGrid.gridtype).toBe(6);
    expect(config.mkrGrid.gridFrameIndexs).toHaveLength(6);
  });

  it('generates evenly distributed grid frame indices', () => {
    const config = buildDefaultConfig([], 'mkr-grid');
    const indexs = config.mkrGrid.gridFrameIndexs;
    expect(indexs[0]).toBe(0);
    expect(indexs[indexs.length - 1]).toBeCloseTo(
      ((indexs.length - 1) / (indexs.length - 1)) * TOTAL_FRAMES
    );
  });

  it('fills msr section with defaults', () => {
    const config = buildDefaultConfig(['a'], 'msr');
    expect(config.msr.prompt).toBe('');
    expect(config.msr.cameraPreset).toBe('none');
    expect(config.msr.lightingPreset).toBe('none');
    expect(config.msr.dialogues).toEqual([]);
  });

  it('sets sensible global defaults', () => {
    const config = buildDefaultConfig(['a']);
    expect(config.duration).toBe(12);
    expect(config.fps).toBe(30);
    expect(config.width).toBe(640);
    expect(config.height).toBe(320);
  });
});

describe('constants', () => {
  it('TOTAL_FRAMES is 360', () => {
    expect(TOTAL_FRAMES).toBe(360);
  });

  it('GRID_TYPES contains 4, 6, 9', () => {
    expect(GRID_TYPES).toEqual([4, 6, 9]);
  });

  it('VIDEO_SIZE_PRESETS has 4 entries', () => {
    expect(VIDEO_SIZE_PRESETS).toHaveLength(4);
  });

  it('CAMERA_PRESETS has 10 entries', () => {
    expect(CAMERA_PRESETS).toHaveLength(10);
  });

  it('LIGHTING_PRESETS has 10 entries', () => {
    expect(LIGHTING_PRESETS).toHaveLength(10);
  });
});
