/**
 * 时间格式化工具函数
 * 用于毫秒与视频时间格式（00:00:00 或 00:00）之间的转换
 */

// ============================================================
// 常量定义
// ============================================================

/** 毫秒每秒 */
export const MS_PER_SECOND = 1000;

/** 秒每分钟 */
export const SECONDS_PER_MINUTE = 60;

/** 分钟每小时 */
export const MINUTES_PER_HOUR = 60;

/** 小时的毫秒数 */
export const MS_PER_HOUR = MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;

/** 分钟的毫秒数 */
export const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;

// ============================================================
// 格式化函数
// ============================================================

/**
 * 毫秒转换为时间字符串
 * @param ms - 毫秒数
 * @param includeHours - 是否包含小时部分（默认自动检测）
 * @returns 时间字符串，如 "00:05" 或 "01:30:45"
 */
export function formatTime(ms: number, includeHours?: boolean): string {
  const totalSeconds = Math.floor(ms / MS_PER_SECOND);
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor((totalSeconds % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  // 自动检测是否需要显示小时
  if (includeHours === undefined) {
    includeHours = hours > 0;
  }

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (includeHours) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 毫秒转换为详细时间字符串（带毫秒）
 * @param ms - 毫秒数
 * @returns 带毫秒的时间字符串，如 "00:05.350"
 */
export function formatTimeWithMs(ms: number): string {
  const totalSeconds = ms / MS_PER_SECOND;
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = Math.floor(totalSeconds % SECONDS_PER_MINUTE);
  const milliseconds = Math.floor(ms % MS_PER_SECOND);

  const padMinSec = (n: number) => n.toString().padStart(2, '0');
  const padMs = (n: number) => n.toString().padStart(3, '0');

  return `${padMinSec(minutes)}:${padMinSec(seconds)}.${padMs(milliseconds)}`;
}

/**
 * 毫秒转换为帧数
 * @param ms - 毫秒数
 * @param fps - 每秒帧数（默认 30）
 * @returns 帧数
 */
export function msToFrames(ms: number, fps: number = 30): number {
  return Math.floor((ms / MS_PER_SECOND) * fps);
}

/**
 * 帧数转换为毫秒
 * @param frames - 帧数
 * @param fps - 每秒帧数（默认 30）
 * @returns 毫秒数
 */
export function framesToMs(frames: number, fps: number = 30): number {
  return Math.round((frames / fps) * MS_PER_SECOND);
}

/**
 * 时间字符串解析为毫秒
 * @param timeStr - 时间字符串，如 "00:05" 或 "01:30:45"
 * @returns 毫秒数
 */
export function parseTime(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  
  if (parts.length === 3) {
    // HH:MM:SS
    const [hours, minutes, seconds] = parts;
    return (hours * MS_PER_HOUR) + (minutes * MS_PER_MINUTE) + (seconds * MS_PER_SECOND);
  } else if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts;
    return (minutes * MS_PER_MINUTE) + (seconds * MS_PER_SECOND);
  }
  
  return 0;
}

/**
 * 格式化时长为人类可读字符串
 * @param ms - 毫秒数
 * @returns 人类可读字符串，如 "5秒"、"2分30秒"、"1小时5分"
 */
export function formatDuration(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${ms}毫秒`;
  }
  
  const totalSeconds = Math.floor(ms / MS_PER_SECOND);
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor((totalSeconds % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  
  const parts: string[] = [];
  
  if (hours > 0) {
    parts.push(`${hours}小时`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}分`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}秒`);
  }
  
  return parts.join('');
}

/**
 * 格式化时间差
 * @param ms - 毫秒数
 * @returns 带 +/- 符号的时间差字符串，如 "-5秒"、"+2分"
 */
export function formatTimeDelta(ms: number): string {
  const sign = ms >= 0 ? '+' : '-';
  return `${sign}${formatDuration(Math.abs(ms))}`;
}

// ============================================================
// 验证函数
// ============================================================

/**
 * 检查时间字符串格式是否有效
 * @param timeStr - 时间字符串
 * @returns 是否有效
 */
export function isValidTimeString(timeStr: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr);
}

/**
 * 检查毫秒值是否为有效时间
 * @param ms - 毫秒数
 * @returns 是否有效（非负数）
 */
export function isValidTime(ms: number): boolean {
  return typeof ms === 'number' && ms >= 0 && Number.isFinite(ms);
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 限制时间在有效范围内
 * @param ms - 毫秒数
 * @param min - 最小值（默认 0）
 * @param max - 最大值（默认无限制）
 * @returns 限制后的毫秒数
 */
export function clampTime(ms: number, min: number = 0, max?: number): number {
  const clamped = Math.max(min, ms);
  return max !== undefined ? Math.min(clamped, max) : clamped;
}

/**
 * 毫秒取整到指定精度
 * @param ms - 毫秒数
 * @param precision - 精度（默认 100ms）
 * @returns 取整后的毫秒数
 */
export function roundTime(ms: number, precision: number = 100): number {
  return Math.round(ms / precision) * precision;
}
