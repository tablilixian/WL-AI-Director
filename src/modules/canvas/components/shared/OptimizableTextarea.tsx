/**
 * OptimizableTextarea
 * 
 * 通用的"AI 提示词优化"输入组件。
 * 原始输入框 + AI 优化按钮 + 优化结果独立展示，用户可对比和编辑。
 */

import React, { useState, useCallback } from 'react';
import { Sparkles, RotateCcw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

export interface OptimizableTextareaProps {
  /** 原始输入值 */
  value: string;
  /** 原始输入变更回调 */
  onChange: (value: string) => void;
  /** 执行 AI 优化的函数，返回优化后的文本 */
  onOptimize: () => Promise<string>;
  /** 输入框占位文本 */
  placeholder?: string;
  /** 输入框行数 */
  rows?: number;
  /** 标签文本 */
  label?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 原始输入下方提示（如意图范例） */
  hint?: React.ReactNode;
  /** 优化结果区域标签 */
  optimizedLabel?: string;
  /** 禁用原因提示（如"请先完成画面分析"） */
  disabledReason?: string;
  /** 优化结果变化回调，用于父组件获取优化后的值 */
  onOptimizedChange?: (value: string) => void;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export const OptimizableTextarea: React.FC<OptimizableTextareaProps> = ({
  value,
  onChange,
  onOptimize,
  placeholder = '请输入你的想法...',
  rows = 4,
  label,
  disabled = false,
  hint,
  optimizedLabel = 'AI 优化结果',
  disabledReason,
  onOptimizedChange,
}) => {
  const [status, setStatus] = useState<Status>('idle');
  const [optimizedValue, setOptimizedValue] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showHint, setShowHint] = useState(false);

  const handleOptimize = useCallback(async () => {
    if (!value.trim() || status === 'loading') return;
    setStatus('loading');
    setErrorMessage('');
    try {
      const result = await onOptimize();
      setOptimizedValue(result);
      onOptimizedChange?.(result);
      setStatus('done');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '优化失败，请重试');
    }
  }, [value, onOptimize, status]);

  const handleRedoOptimize = useCallback(async () => {
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMessage('');
    try {
      const result = await onOptimize();
      setOptimizedValue(result);
      onOptimizedChange?.(result);
      setStatus('done');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '优化失败，请重试');
    }
  }, [onOptimize, status]);

  const handleOriginalChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      // 原始输入变化时清空优化结果
      if (status === 'done' || status === 'error') {
        setStatus('idle');
        setOptimizedValue('');
        onOptimizedChange?.('');
        setErrorMessage('');
      }
    },
    [onChange, status]
  );

  return (
    <div className="space-y-3">
      {/* 原始输入区域 */}
      <div>
        {label && (
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">{label}</label>
        )}
        <textarea
          value={value}
          onChange={handleOriginalChange}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 resize-y disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* 提示文本（可折叠） */}
      {hint && (
        <div>
          <button
            onClick={() => setShowHint(!showHint)}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {showHint ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            意图范例
          </button>
          {showHint && (
            <div className="mt-2 p-3 bg-[var(--bg-hover)] rounded-lg border border-[var(--border-primary)] text-xs text-[var(--text-muted)] leading-relaxed">
              {hint}
            </div>
          )}
        </div>
      )}

      {/* AI 优化按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleOptimize}
          disabled={disabled || !value.trim() || status === 'loading'}
          title={disabled && disabledReason ? disabledReason : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all
            bg-amber-600/10 text-amber-500 border border-amber-500/20
            hover:bg-amber-600/20 hover:border-amber-500/40
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              优化中...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              AI 优化
            </>
          )}
        </button>

        {disabled && disabledReason && (
          <span className="text-xs text-[var(--text-muted)]">{disabledReason}</span>
        )}
      </div>

      {/* 错误提示 */}
      {status === 'error' && errorMessage && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{errorMessage}</p>
          <button
            onClick={handleRedoOptimize}
            className="mt-1.5 text-xs text-red-400 hover:text-red-300 underline"
          >
            重试
          </button>
        </div>
      )}

      {/* 优化结果 */}
      {status === 'done' && (
        <div className="bg-[var(--bg-base)] rounded-lg border border-green-500/30 overflow-hidden">
          <div className="px-3 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center justify-between">
            <span className="text-xs font-medium text-green-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              {optimizedLabel}
            </span>
            <button
              onClick={handleRedoOptimize}
              disabled={status === 'loading'}
              className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              重新生成
            </button>
          </div>
          <div className="p-3">
            <textarea
              value={optimizedValue}
              onChange={(e) => {
                setOptimizedValue(e.target.value);
                onOptimizedChange?.(e.target.value);
              }}
              rows={Math.max(rows + 2, 6)}
              className="w-full bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 resize-y"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default OptimizableTextarea;
