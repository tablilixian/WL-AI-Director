import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { logger, LogCategory } from '../services/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 区域名，用于日志与兜底 UI 区分（如 "GenerateVideoPanel" / "StageCanvas"） */
  name?: string;
  /** 自定义兜底 UI；不传则用默认可恢复兜底 */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * React 错误边界：捕获子树渲染/生命周期抛出的错误，阻止其冒泡导致整棵 React 树白屏。
 * 关键用途：单个面板/Stage 崩溃时，仅该区域降级为可恢复兜底，画布与侧边栏等其余 UI 不受影响。
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error(
      LogCategory.APP,
      `[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}] 捕获到渲染错误:`,
      { message: error.message, stack: error.stack, componentStack: errorInfo?.componentStack },
    );
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    const region = this.props.name ?? '该模块';

    return (
      <div className="flex items-center justify-center h-full w-full p-6">
        <div className="max-w-md w-full space-y-4 bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-[var(--error)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                {region}出现异常
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                该区域已安全隔离，不会影响其他功能。可尝试恢复，或刷新页面重试。
              </p>
            </div>
          </div>

          {import.meta.env.DEV && (
            <pre className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
              {error.message}
            </pre>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={this.reset}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              恢复
            </button>
          </div>
        </div>
      </div>
    );
  }
}
