import { VideoPreset, VideoGenerationMode, AspectRatio, VideoDuration, TimedKeyframe, ProjectState } from '../types';

const PRESET_VERSION = 1;

/** 生成唯一 ID */
function generatePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建预设的输入参数 */
export interface PresetInput {
  name: string;
  description?: string;
  params: {
    mode: VideoGenerationMode;
    fps: number;
    width: number;
    height: number;
    duration: VideoDuration;
    modelId: string;
    aspectRatio: AspectRatio;
    backgroundImage?: string;
    timedKeyframes?: TimedKeyframe[];
  };
}

/**
 * 视频预设管理器
 * 提供预设的创建、加载、应用、版本迁移
 */
export class VideoPresetManager {

  /**
   * 创建一个新的预设对象（不自动保存到 project）
   */
  createPreset(input: PresetInput): VideoPreset {
    return {
      id: generatePresetId(),
      name: input.name,
      description: input.description,
      version: PRESET_VERSION,
      createdAt: Date.now(),
      params: { ...input.params },
    };
  }

  /**
   * 将预设保存到 project.videoPresets[]
   * 同名覆盖，否则追加
   */
  savePreset(project: ProjectState, preset: VideoPreset): ProjectState {
    const presets = project.videoPresets ? [...project.videoPresets] : [];
    const existingIdx = presets.findIndex(p => p.id === preset.id);
    if (existingIdx >= 0) {
      presets[existingIdx] = preset;
    } else {
      presets.push(preset);
    }
    return {
      ...project,
      videoPresets: presets,
    };
  }

  /**
   * 按 id 删除预设
   */
  deletePreset(project: ProjectState, presetId: string): ProjectState {
    if (!project.videoPresets) return project;
    return {
      ...project,
      videoPresets: project.videoPresets.filter(p => p.id !== presetId),
    };
  }

  /**
   * 加载预设并执行版本迁移
   * 返回迁移后的预设，原始对象不变
   */
  loadPreset(preset: VideoPreset): VideoPreset {
    let migrated = { ...preset, params: { ...preset.params } };

    // 版本迁移：从旧版本升级到当前版本
    // 当前只有 v1，迁移逻辑为空
    // 后续新增参数时在此处处理：
    // if (migrated.version < 2) { ... }
    // if (migrated.version < 3) { ... }

    migrated.version = PRESET_VERSION;
    return migrated;
  }

  /**
   * 获取 project 中所有预设
   */
  getPresets(project: ProjectState): VideoPreset[] {
    return project.videoPresets || [];
  }
}

/**
 * 悬空引用校验
 * 检查 timedKeyframes 中每个 keyframeId 是否在 shot 的有效 keyframeId 集合中
 * 返回 { valid, filtered, invalidCount, allInvalid }
 */
export function validateTimedKeyframes(
  timedKeyframes: TimedKeyframe[],
  validKeyframeIds: string[]
): {
  valid: TimedKeyframe[];
  filtered: TimedKeyframe[];
  invalidCount: number;
  allInvalid: boolean;
} {
  const valid = timedKeyframes.filter(tk => validKeyframeIds.includes(tk.keyframeId));
  const filtered = timedKeyframes.filter(tk => !validKeyframeIds.includes(tk.keyframeId));
  return {
    valid,
    filtered,
    invalidCount: filtered.length,
    allInvalid: valid.length === 0 && timedKeyframes.length > 0,
  };
}

/** 全局单例 */
export const presetManager = new VideoPresetManager();
