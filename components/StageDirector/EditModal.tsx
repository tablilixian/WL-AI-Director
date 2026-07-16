import React, { useState, useEffect } from 'react';
import { X, Edit2, Check, Sparkles, Loader2, ChevronDown, ChevronRight, Image } from 'lucide-react';
import { unifiedImageService } from '../../services/unifiedImageService';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  title: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textareaClassName?: string;
  showAIGenerate?: boolean;
  onAIGenerate?: () => Promise<void>;
  isAIGenerating?: boolean;
  showKeyframes?: boolean;
  startImageUrl?: string;
  endImageUrl?: string;
  startPrompt?: string;
  endPrompt?: string;
  vlmStartAnalysis?: string | null;
  vlmEndAnalysis?: string | null;
  isVlmLoading?: boolean;
  onImageClick?: (url: string, title: string) => void;
  onReAnalyzeVlm?: () => void;
}

const EditModal: React.FC<EditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  title,
  icon,
  value,
  onChange,
  placeholder = '输入内容...',
  textareaClassName = 'font-normal',
  showAIGenerate = false,
  onAIGenerate,
  isAIGenerating = false,
  showKeyframes = false,
  startImageUrl,
  endImageUrl,
  startPrompt,
  endPrompt,
  vlmStartAnalysis,
  vlmEndAnalysis,
  isVlmLoading = false,
  onImageClick,
  onReAnalyzeVlm,
}) => {
  const [vlmExpanded, setVlmExpanded] = useState(true);
  const [startSrc, setStartSrc] = useState<string | null>(null);
  const [endSrc, setEndSrc] = useState<string | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [endLoading, setEndLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStartSrc(null); setStartLoading(true);
    setEndSrc(null); setEndLoading(true);

    let cancelled = false;
    Promise.all([
      startImageUrl ? unifiedImageService.resolveForApi(startImageUrl) : Promise.resolve(''),
      endImageUrl ? unifiedImageService.resolveForApi(endImageUrl) : Promise.resolve(''),
    ]).then(([start, end]) => {
      if (cancelled) return;
      if (start) setStartSrc(start);
      setStartLoading(false);
      if (end) setEndSrc(end);
      setEndLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, startImageUrl, endImageUrl]);

  if (!isOpen) return null;

  const handleAIGenerate = async () => {
    if (onAIGenerate && !isAIGenerating) {
      await onAIGenerate();
    }
  };

  const renderKeyframeCard = (
    label: string,
    src: string | null,
    loading: boolean,
    prompt: string | undefined,
  ) => (
    <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)]">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : src ? (
          <img
            src={src}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onImageClick?.(src, label)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] bg-[var(--bg-tertiary)]">
            <Image className="w-5 h-5" />
            <span className="text-xs">无{label}</span>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-[var(--border-primary)]">
        <p className="text-[var(--text-muted)] text-xs leading-relaxed line-clamp-2">
          {prompt || '无描述'}
        </p>
      </div>
    </div>
  );

  const renderVlmItem = (label: string, content: string) => {
    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) return null;
    const key = content.slice(0, colonIdx).trim();
    const val = content.slice(colonIdx + 1).trim();
    if (!key || !val) return null;
    return (
      <div key={label} className="flex items-baseline gap-2 text-xs">
        <span className="text-[var(--accent-text)] shrink-0">✓ {key}:</span>
        <span className="text-[var(--text-secondary)]">{val}</span>
      </div>
    );
  };

  const renderVlmSection = (analysis: string | null | undefined) => {
    if (!analysis) return null;
    const lines = analysis.split('\n').filter(l => l.includes(':'));
    if (lines.length === 0) {
      return <p className="text-xs text-[var(--text-muted)]">{analysis}</p>;
    }
    return (
      <div className="space-y-1">
        {lines.map((line, i) => renderVlmItem(`vlm-${i}`, line))}
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-[var(--overlay-heavy)] backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl p-6 max-w-2xl w-full space-y-4 shadow-2xl animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-[var(--text-primary)] font-bold flex items-center gap-2">
            {icon || <Edit2 className="w-4 h-4 text-[var(--accent-text)]" />}
            {title}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showKeyframes && (
          <>
            {/* Keyframe thumbnails */}
            <div className="grid grid-cols-2 gap-3">
              {renderKeyframeCard('首帧', startSrc, startLoading, startPrompt)}
              {renderKeyframeCard('尾帧', endSrc, endLoading, endPrompt)}
            </div>

            {/* VLM analysis collapsible */}
            <div className="bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg overflow-hidden">
              <button
                onClick={() => setVlmExpanded(!vlmExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider hover:bg-[var(--bg-hover)] transition-colors"
              >
                <span>VLM 实际画面分析</span>
                {isVlmLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : vlmExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
              {vlmExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {isVlmLoading ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-3 h-3 animate-spin text-[var(--accent-text)]" />
                      <span className="text-xs text-[var(--text-muted)]">正在分析画面内容...</span>
                    </div>
                  ) : (
                    <>
                      {vlmStartAnalysis && (
                        <div>
                          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">首帧：</p>
                          {renderVlmSection(vlmStartAnalysis)}
                        </div>
                      )}
                      {vlmEndAnalysis && (
                        <div>
                          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">尾帧：</p>
                          {renderVlmSection(vlmEndAnalysis)}
                        </div>
                      )}
                    </>
                  )}
                  {/* Re-analyze button */}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={onReAnalyzeVlm}
                      disabled={isVlmLoading}
                      className="text-xs text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <Loader2 className={`w-3 h-3 ${isVlmLoading ? 'animate-spin' : ''}`} />
                      {vlmStartAnalysis || vlmEndAnalysis ? '重新识别' : '识别图片'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* AI生成按钮 */}
        {showAIGenerate && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleAIGenerate}
              disabled={isAIGenerating}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                isAIGenerating
                  ? 'bg-[var(--border-secondary)] text-[var(--text-tertiary)] cursor-not-allowed'
                  : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] shadow-lg'
              }`}
            >
              {isAIGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI正在生成动作建议...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI生成动作建议
                </>
              )}
            </button>
          </div>
        )}

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full h-64 bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg p-4 text-sm outline-none focus:border-[var(--border-secondary)] transition-colors resize-none ${textareaClassName}`}
          placeholder={placeholder}
          autoFocus
          disabled={isAIGenerating}
        />
        
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isAIGenerating}
            className="px-4 py-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border-secondary)] rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={isAIGenerating}
            className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;
