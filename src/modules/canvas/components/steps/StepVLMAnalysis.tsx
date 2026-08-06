import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2, ArrowLeft, Settings2 } from 'lucide-react';
import { useCanvasStore } from '../../hooks/useCanvasState';
import { OptimizableTextarea } from '../shared/OptimizableTextarea';
import { optimizeVLMSystemPrompt, optimizeVLMUserPrompt } from '../../services/promptOptimizer';
import type { VlmAnalysisData } from '../../types/flow';
import { DEFAULT_ASPECTS } from '../../types/flow';

interface StepVLMAnalysisProps {
  sourceLayerId: string;
  initialData: VlmAnalysisData | null;
  onSave: (data: VlmAnalysisData) => void;
  onNext: () => void;
  onBack: () => void;
}

const DEFAULT_SYSTEM_PROMPT = '你是一个专业的影视镜头分析师。请从电影摄影的角度分析这张画面，输出结构化的分析结果。';

export const StepVLMAnalysis: React.FC<StepVLMAnalysisProps> = ({ sourceLayerId, initialData, onSave, onNext, onBack }) => {
  const [showSettings, setShowSettings] = useState(true);

  const [selectedAspects, setSelectedAspects] = useState<string[]>(
    () => initialData?.selectedAspects || DEFAULT_ASPECTS.slice(0, 6).map(a => a.key)
  );
  const [customSystemPrompt, setCustomSystemPrompt] = useState(
    initialData?.customSystemPrompt || DEFAULT_SYSTEM_PROMPT
  );
  const [customUserPrompt, setCustomUserPrompt] = useState(
    initialData?.customUserPrompt || ''
  );

  // AI 优化后的提示词
  const [optimizedSystemPrompt, setOptimizedSystemPrompt] = useState('');
  const [optimizedUserPrompt, setOptimizedUserPrompt] = useState('');

  const effectiveSystemPrompt = optimizedSystemPrompt || customSystemPrompt;
  const effectiveUserPrompt = optimizedUserPrompt || customUserPrompt;

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawOutput, setRawOutput] = useState(initialData?.rawOutput || '');
  const [schema, setSchema] = useState<Record<string, string>>(
    initialData?.schema || {}
  );
  const [retryCount, setRetryCount] = useState(initialData?.retryCount || 0);

  const toggleAspect = (key: string) => {
    setSelectedAspects(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const updateSchemaField = (key: string, value: string) => {
    setSchema(prev => ({ ...prev, [key]: value }));
  };

  const buildUserPrompt = () => {
    const selected = DEFAULT_ASPECTS.filter(a => selectedAspects.includes(a.key));
    const questions = selected.map(a => `${a.defaultLabel}：${a.defaultQuestion}`).join('\n');
    const labels = selected.map(a => `${a.defaultLabel}: <描述>`).join('\n');

    const autoPrompt = `分析这张画面的以下要素，每项用一句话描述：\n${questions}\n\n输出格式（每行一个）：\n${labels}`;

    if (effectiveUserPrompt.trim()) {
      return `${autoPrompt}\n\n补充要求：\n${effectiveUserPrompt.trim()}`;
    }

    return autoPrompt;
  };

  const handleAnalyze = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const { layers } = useCanvasStore.getState();
      const sourceLayer = layers.find(l => l.id === sourceLayerId);
      if (!sourceLayer?.src) throw new Error('未找到图片');

      const { callDramaBackendVLApi } = await import('../../../../../services/adapters/imageAdapter');
      const { unifiedImageService } = await import('../../../../../services/unifiedImageService');

      const resolvedUrl = await unifiedImageService.resolveForApi(sourceLayer.src);
      const userPrompt = buildUserPrompt();

      const output = await callDramaBackendVLApi({
        prompt: userPrompt,
        systemPrompt: effectiveSystemPrompt,
        referenceImages: [resolvedUrl],
      });

      const newSchema: Record<string, string> = {};
      const selected = DEFAULT_ASPECTS.filter(a => selectedAspects.includes(a.key));
      for (const aspect of selected) {
        newSchema[aspect.key] = '';
      }

      for (const line of output.split('\n')) {
        for (const aspect of selected) {
          const re = new RegExp(`^${aspect.defaultLabel}[：:]\\s*(.+)`);
          const match = line.match(re);
          if (match) {
            newSchema[aspect.key] = match[1].trim();
          }
        }
      }

      const editedAnalysis = Object.entries(newSchema)
        .filter(([_, v]) => v)
        .map(([k, v]) => {
          const aspect = DEFAULT_ASPECTS.find(a => a.key === k);
          return `${aspect?.defaultLabel || k}：${v}`;
        })
        .join('\n');

      setRawOutput(output);
      setSchema(newSchema);
      setRetryCount(prev => prev + 1);
    } catch (err: any) {
      setError(err.message || '分析失败');
    } finally {
      setIsProcessing(false);
    }
  }, [sourceLayerId, selectedAspects, effectiveSystemPrompt, effectiveUserPrompt, isProcessing, buildUserPrompt]);

  const handleConfirm = () => {
    const editedAnalysis = Object.entries(schema)
      .filter(([_, v]) => v)
      .map(([k, v]) => {
        const aspect = DEFAULT_ASPECTS.find(a => a.key === k);
        return `${aspect?.defaultLabel || k}：${v}`;
      })
      .join('\n');

    onSave({
      rawOutput,
      editedAnalysis,
      schema,
      customSystemPrompt: effectiveSystemPrompt,
      customUserPrompt: effectiveUserPrompt,
      selectedAspects,
      retryCount,
    });
    onNext();
  };

  const hasAnalysis = rawOutput.length > 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline mt-1">关闭</button>
        </div>
      )}

      {!hasAnalysis && !isProcessing && (
        <>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {showSettings ? '收起提示词设置' : '自定义分析提示词'}
          </button>

          {showSettings && (
            <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] p-3 space-y-3">
              <div>
                <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">分析维度</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_ASPECTS.map(aspect => (
                    <label key={aspect.key} className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-primary)] cursor-pointer text-[10px] text-[var(--text-secondary)] hover:border-amber-500/50">
                      <input
                        type="checkbox"
                        checked={selectedAspects.includes(aspect.key)}
                        onChange={() => toggleAspect(aspect.key)}
                        className="w-3 h-3"
                      />
                      {aspect.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <OptimizableTextarea
                  label="系统提示词（System Prompt）"
                  value={customSystemPrompt}
                  onChange={setCustomSystemPrompt}
                  onOptimizedChange={setOptimizedSystemPrompt}
                  onOptimize={async () => {
                    const result = await optimizeVLMSystemPrompt({
                      rawSystemPrompt: customSystemPrompt,
                      selectedAspectLabels: DEFAULT_ASPECTS
                        .filter(a => selectedAspects.includes(a.key))
                        .map(a => a.label),
                    });
                    return result.optimizedSystemPrompt;
                  }}
                  rows={2}
                  placeholder="你是一个专业的影视镜头分析师..."
                  optimizedLabel="优化后的 System Prompt"
                />
              </div>
              <div>
                <OptimizableTextarea
                  label="用户提示词（留空则根据选择的维度自动生成）"
                  value={customUserPrompt}
                  onChange={setCustomUserPrompt}
                  onOptimizedChange={setOptimizedUserPrompt}
                  onOptimize={async () => {
                    if (!customUserPrompt.trim()) {
                      throw new Error('请先输入补充要求再优化');
                    }
                    const result = await optimizeVLMUserPrompt({
                      rawUserPrompt: customUserPrompt,
                      selectedAspectLabels: DEFAULT_ASPECTS
                        .filter(a => selectedAspects.includes(a.key))
                        .map(a => a.label),
                    });
                    return result.optimizedUserPrompt;
                  }}
                  rows={3}
                  placeholder="留空自动生成..."
                  optimizedLabel="优化后的补充要求"
                  disabled={false}
                  disabledReason={!customUserPrompt.trim() ? '请先输入补充要求' : undefined}
                />
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)] bg-[var(--bg-hover)] p-2 rounded">
                <span className="font-medium">当前用户提示词预览：</span>
                <pre className="mt-1 whitespace-pre-wrap">{buildUserPrompt()}</pre>
              </div>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            className="w-full py-3 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            AI 分析图片
          </button>
        </>
      )}

      {isProcessing && (
        <div className="py-8 text-center">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">正在分析画面...</p>
        </div>
      )}

      {hasAnalysis && (
        <>
          <div className="bg-[var(--bg-base)] rounded-lg border border-amber-500/30 overflow-hidden">
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">分析结果</span>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline flex items-center gap-1"
              >
                <Settings2 className="w-3 h-3" />
                修改提示词
              </button>
            </div>
            <div className="p-3 space-y-2">
              {selectedAspects.map(key => {
                const aspect = DEFAULT_ASPECTS.find(a => a.key === key);
                if (!aspect) return null;
                const val = schema[key];
                if (!val) return null;
                return (
                  <div key={key}>
                    <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-0.5">{aspect.label}</label>
                    <textarea
                      value={val}
                      onChange={e => updateSchemaField(key, e.target.value)}
                      rows={1}
                      className="w-full px-2 py-1.5 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                    />
                  </div>
                );
              })}

              {/* raw output collapsible */}
              <details className="mt-2">
                <summary className="text-[10px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] select-none">
                  VLM 原始输出（{rawOutput.length} 字符）
                </summary>
                <pre className="mt-1 text-[10px] text-[var(--text-muted)] whitespace-pre-wrap bg-[var(--bg-hover)] p-2 rounded max-h-40 overflow-y-auto font-mono">
                  {rawOutput}
                </pre>
              </details>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleAnalyze} disabled={isProcessing}
              className="px-3 py-1.5 border border-[var(--border-primary)] text-[var(--text-secondary)] text-xs rounded-lg hover:text-[var(--text-primary)] flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> 重新分析
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={onBack} className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm rounded-lg hover:text-[var(--text-primary)] flex items-center justify-center gap-1">
              <ArrowLeft className="w-4 h-4" /> 返回选择
            </button>
            <button onClick={handleConfirm} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">
              确认，进入推演
            </button>
          </div>
        </>
      )}
    </div>
  );
};
