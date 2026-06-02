/**
 * 用户偏好设置服务
 * 通过 localStorage 持久化用户的项目配置偏好，新建项目时自动应用
 */

const PREFS_KEY = 'wl-director-user-preferences';

export interface UserPreferences {
  targetDuration: string;
  language: string;
  visualStyle: string;
  /**
   * 分镜生成模型 ID（来自 modelRegistry）
   * 注：模型 ID 可能因配置变化而失效，消费方需兜底
   */
  shotGenerationModel: string;
  /**
   * 是否跳过引导流程
   */
  skipOnboarding: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  targetDuration: '60s',
  language: '中文',
  visualStyle: 'live-action',
  shotGenerationModel: 'glm-4-flash',
  skipOnboarding: false,
};

export const getPreferences = (): UserPreferences => {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (!stored) return { ...DEFAULT_PREFERENCES };
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const savePreferences = (prefs: Partial<UserPreferences>): void => {
  try {
    const current = getPreferences();
    const merged = { ...current, ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn('[UserPreferences] 保存偏好失败:', e);
  }
};

export const resetPreferences = (): void => {
  try {
    localStorage.removeItem(PREFS_KEY);
  } catch (e) {
    console.warn('[UserPreferences] 重置偏好失败:', e);
  }
};

export const getPreferenceSummary = (): string[] => {
  const prefs = getPreferences();
  return [
    `时长：${prefs.targetDuration}`,
    `语言：${prefs.language}`,
    `视觉风格：${prefs.visualStyle}`,
    `模型：${prefs.shotGenerationModel}`,
  ];
};
