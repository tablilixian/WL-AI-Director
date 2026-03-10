/**
 * Logger Service
 * 统一的日志管理服务
 * 提供日志级别控制、分类管理和输出目标配置
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
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
  NETWORK = 'NETWORK'
}

interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
  timestamp: number;
  stack?: string;
}

interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableStorage: boolean;
  categories: Set<LogCategory>;
  maxStorageEntries: number;
}

class Logger {
  private config: LoggerConfig = {
    minLevel: LogLevel.DEBUG,
    enableConsole: true,
    enableStorage: false,
    categories: new Set(Object.values(LogCategory)),
    maxStorageEntries: 1000
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
        categories: Array.from(this.config.categories)
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

  private createEntry(level: LogLevel, category: LogCategory, message: string, data?: any, stack?: string): LogEntry {
    return {
      level,
      category,
      message,
      data,
      timestamp: Date.now(),
      stack
    };
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: any): void {
    if (!this.shouldLog(level, category)) {
      return;
    }

    const stack = level === LogLevel.ERROR ? new Error().stack?.split('\n').slice(2, 5).join('\n') : undefined;
    const entry = this.createEntry(level, category, message, data, stack);

    if (this.config.enableConsole) {
      const formatted = this.formatMessage(level, category, message);
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formatted, data || '');
          break;
        case LogLevel.INFO:
          console.info(formatted, data || '');
          break;
        case LogLevel.WARN:
          console.warn(formatted, data || '');
          break;
        case LogLevel.ERROR:
          console.error(formatted, data || '');
          if (stack) console.error(stack);
          break;
      }
    }

    if (this.config.enableStorage) {
      this.storage.push(entry);
      if (this.storage.length > this.config.maxStorageEntries) {
        this.storage.shift();
      }
    }

    this.listeners.forEach(listener => listener(entry));
  }

  debug(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  info(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  warn(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  error(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
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

export default logger;
