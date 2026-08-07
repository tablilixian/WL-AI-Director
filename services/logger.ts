/* eslint-disable no-console -- logger 是日志原语，自身兜底必须直接用 console */
/**
 * Logger Service —— 统一日志处理系统
 *
 * 设计目标（对应团队需求）：
 * 1. 调试开关：按 LogLevel 阈值过滤 + 按类别过滤，配置持久化到 localStorage；
 *    生产环境默认只开 INFO 以上，开发环境默认全开（DEBUG 也可见）。
 * 2. 出错可追溯：ERROR 级别自动记录「出错位置 file:line」+「原因(cause)」+「完整堆栈」。
 *    只要把原始 Error 作为 data 传入（或直接用 errorFrom），位置和原因无需手写。
 * 3. 统一接口：对外只暴露 logger / createLogger(...)；其余代码一律不得直接调用 console.*，
 *    由 eslint `no-console: error` 在门禁层强制（logger 本身与 vite 插件/测试除外）。
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export enum LogCategory {
  APP = 'APP',
  AUTH = 'AUTH',
  STORAGE = 'STORAGE',
  API = 'API',
  AI = 'AI',
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  RENDER = 'RENDER',
  MODEL = 'MODEL',
  UI = 'UI',
  NETWORK = 'NETWORK',
  CANVAS = 'CANVAS',
}

export interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  /** 负载。设为 unknown：日志是数据汇(sink)，从不消费其结构，只透传/序列化 */
  data?: unknown;
  timestamp: number;
  /** ERROR 时记录真实调用位置（file:line），回答「在哪出的错」 */
  location?: string;
  /** ERROR 时记录原始错误 message，回答「什么原因」 */
  cause?: string;
  /** ERROR 时记录完整堆栈（含库内部帧，便于深查） */
  stack?: string;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableStorage: boolean;
  categories: Set<LogCategory>;
  maxStorageEntries: number;
}

export interface ScopedLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  /** 记录一个真实错误：自动带出原因 + 出错位置 + 堆栈（推荐的错误记录入口） */
  errorFrom(err: unknown, contextMessage?: string): void;
}

const isProduction = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true;

/** 从一行 stack frame 提取 file:line */
function formatLocation(frame: string): string | undefined {
  const match = frame.match(/\(?([^()]+?):(\d+):(\d+)\)?$/);
  if (!match) return undefined;
  const file = match[1].split('/').pop() ?? match[1];
  return `${file}:${match[2]}`;
}

/** 在 stack 中跳过 logger 内部帧，定位真实调用点 */
function firstCallerFrame(stack: string): string | undefined {
  const frames = stack.split('\n').slice(1);
  const caller = frames.find((f) => !f.includes('services/logger.ts'));
  return caller?.trim();
}

/** 若 data 是 Error，自动提取「原因 + 位置 + 堆栈」 */
function extractErrorContext(data: unknown): {
  cause?: string;
  location?: string;
  stack?: string;
} {
  if (data instanceof Error) {
    let location: string | undefined;
    if (data.stack) {
      const caller = firstCallerFrame(data.stack);
      location = caller ? formatLocation(caller) : undefined;
    }
    return { cause: data.message, stack: data.stack, location };
  }
  return {};
}

class Logger {
  private config: LoggerConfig = {
    // 生产默认 INFO（关掉 DEBUG 噪声）；开发默认 DEBUG（全可见）。localStorage 可覆盖。
    minLevel: isProduction ? LogLevel.INFO : LogLevel.DEBUG,
    enableConsole: true,
    enableStorage: false,
    categories: new Set(Object.values(LogCategory)),
    maxStorageEntries: 1000,
  };

  private storage: LogEntry[] = [];
  private listeners: Set<(entry: LogEntry) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadConfig();
    }
  }

  private loadConfig(): void {
    try {
      const saved = localStorage.getItem('logger_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.config = { ...this.config, ...parsed };
        this.config.categories = new Set(parsed.categories || Object.values(LogCategory));
      }
    } catch (e) {
      console.warn('[Logger] Failed to load config:', e);
    }
  }

  private saveConfig(): void {
    try {
      const toSave = {
        ...this.config,
        categories: Array.from(this.config.categories),
      };
      localStorage.setItem('logger_config', JSON.stringify(toSave));
    } catch (e) {
      console.warn('[Logger] Failed to save config:', e);
    }
  }

  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    return level >= this.config.minLevel && this.config.categories.has(category);
  }

  private formatMessage(level: LogLevel, category: LogCategory, message: string): string {
    const levelStr = LogLevel[level];
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    return `[${timestamp}] [${levelStr}] [${category}] ${message}`;
  }

  private createEntry(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: unknown,
    stack?: string,
    cause?: string,
    location?: string,
  ): LogEntry {
    return {
      level,
      category,
      message,
      data,
      timestamp: Date.now(),
      stack,
      cause,
      location,
    };
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: unknown): void {
    if (!this.shouldLog(level, category)) {
      return;
    }

    const ctx = level === LogLevel.ERROR ? extractErrorContext(data) : {};
    const entry = this.createEntry(
      level,
      category,
      message,
      data,
      ctx.stack,
      ctx.cause,
      ctx.location,
    );

    if (this.config.enableConsole) {
      const formatted = this.formatMessage(level, category, message);
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formatted, data ?? '');
          break;
        case LogLevel.INFO:
          console.info(formatted, data ?? '');
          break;
        case LogLevel.WARN:
          console.warn(formatted, data ?? '');
          break;
        case LogLevel.ERROR:
          console.error(formatted, data ?? '');
          // 出错三要素：在哪、为什么、完整堆栈
          if (entry.location) console.error(`  ↳ 出错位置: ${entry.location}`);
          if (entry.cause && entry.cause !== message) console.error(`  ↳ 原因: ${entry.cause}`);
          if (entry.stack) console.error(entry.stack);
          break;
      }
    }

    if (this.config.enableStorage) {
      this.storage.push(entry);
      if (this.storage.length > this.config.maxStorageEntries) {
        this.storage.shift();
      }
    }

    this.listeners.forEach((listener) => listener(entry));
  }

  debug(category: LogCategory, message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  info(category: LogCategory, message: string, data?: unknown): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  warn(category: LogCategory, message: string, data?: unknown): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  error(category: LogCategory, message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, category, message, data);
  }

  /** 调试开关：一键开启/关闭 DEBUG 级日志（关闭后仅 INFO 及以上输出） */
  setDebugEnabled(enabled: boolean): void {
    this.config.minLevel = enabled ? LogLevel.DEBUG : LogLevel.INFO;
    this.saveConfig();
  }

  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
    this.saveConfig();
  }

  setEnableConsole(enable: boolean): void {
    this.config.enableConsole = enable;
    this.saveConfig();
  }

  setEnableStorage(enable: boolean): void {
    this.config.enableStorage = enable;
    this.saveConfig();
  }

  setCategoryEnabled(category: LogCategory, enabled: boolean): void {
    if (enabled) {
      this.config.categories.add(category);
    } else {
      this.config.categories.delete(category);
    }
    this.saveConfig();
  }

  getStorage(): LogEntry[] {
    return [...this.storage];
  }

  clearStorage(): void {
    this.storage = [];
  }

  exportStorage(): string {
    return JSON.stringify(this.storage, null, 2);
  }

  addListener(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConfig(): LoggerConfig {
    return { ...this.config, categories: new Set(this.config.categories) };
  }
}

export const logger = new Logger();

/**
 * 创建一个「已绑定类别」的日志器，组件/服务只需持有一次，调用时不再传 category，
 * 也绝不直接碰 console。推荐使用。
 *
 * @example
 * const log = createLogger(LogCategory.CANVAS);
 * log.debug('图层已添加', layer);
 * log.errorFrom(err, '三视图生成失败'); // 自动带出原因 + 位置 + 堆栈
 */
export function createLogger(category: LogCategory): ScopedLogger {
  return {
    debug: (message, data) => logger.debug(category, message, data),
    info: (message, data) => logger.info(category, message, data),
    warn: (message, data) => logger.warn(category, message, data),
    error: (message, data) => logger.error(category, message, data),
    errorFrom: (err, contextMessage) => {
      const message = contextMessage ?? (err instanceof Error ? err.message : String(err));
      logger.error(category, message, err);
    },
  };
}

export default logger;
