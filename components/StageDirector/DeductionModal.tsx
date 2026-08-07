import React, { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, Loader2, Check, ArrowLeft } from 'lucide-react';
import { FourGridDeduction } from '../../types';
import { useImageLoader } from '../../hooks/useImageLoader';

interface DeductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  startKeyframeImageUrl?: string;
  initialFourGrid?: FourGridDeduction;
  gridType: number;
  onSave: (fourGrid: FourGridDeduction) => void;
  onConfirm: (frameIndexes: number[]) => void;
}

const DEFAULT_DESCRIPTIONS = ['', '', '', ''];

const DEFAULT_SYSTEM_PROMPT =
  '你是一个专业的影视分镜师。请分析当前画面后，创作后续分镜的详细描述。';
const DEFAULT_USER_PROMPT = `分析这张画面的场景、构图、光影、角色和情绪，然后为后续分镜画面做详细描述：

要求：
- 输出多个分镜描述，每个描述一句话，每行一个
- 保持角色、场景、光影风格一致
- 每个分镜之间要有叙事递进关系`;

const DeductionModal: React.FC<DeductionModalProps> = ({
  isOpen,
  onClose,
  startKeyframeImageUrl,
  initialFourGrid,
  gridType,
  onSave,
  onConfirm,
}) => {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [userPrompt, setUserPrompt] = useState(DEFAULT_USER_PROMPT);
  const [narrativeDirection, setNarrativeDirection] = useState('');
  const [vlmAnalysis, setVlmAnalysis] = useState('');
  const [descriptions, setDescriptions] = useState<string[]>(DEFAULT_DESCRIPTIONS);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [, setImageId] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'analyze' | 'edit' | 'preview'>('analyze');

  const { src: startKfSrc, loading: startKfLoading } = useImageLoader(startKeyframeImageUrl);
  const { src: resultSrc, loading: resultLoading } = useImageLoader(imageUrl || undefined);

  // 从 initialFourGrid 恢复状态（弹框重新打开时）
  useEffect(() => {
    if (!isOpen) return;
    if (initialFourGrid) {
      setPhase(
        initialFourGrid.status === 'completed'
          ? 'preview'
          : initialFourGrid.status === 'analysis_done'
            ? 'edit'
            : 'analyze',
      );
      setNarrativeDirection(initialFourGrid.narrativeDirection || '');
      setVlmAnalysis(initialFourGrid.vlmAnalysis || '');
      setDescriptions(
        initialFourGrid.descriptions.length > 0
          ? initialFourGrid.descriptions
          : DEFAULT_DESCRIPTIONS,
      );
      setSelectedIndexes(initialFourGrid.selectedIndexes || []);
      setImageUrl(initialFourGrid.imageUrl || null);
      setImageId(initialFourGrid.imageId);
    } else {
      resetState();
    }
  }, [isOpen, initialFourGrid]);

  const resetState = () => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setUserPrompt(DEFAULT_USER_PROMPT);
    setNarrativeDirection('');
    setVlmAnalysis('');
    setDescriptions(DEFAULT_DESCRIPTIONS);
    setSelectedIndexes([]);
    setImageUrl(null);
    setImageId(undefined);
    setProgress(0);
    setError(null);
    setPhase('analyze');
  };

  /** 步骤1: VLM 画面分析 */
  const handleAnalyze = useCallback(async () => {
    if (!startKeyframeImageUrl || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setProgress(10);

    try {
      const { callDramaBackendVLApi } = await import('../../services/adapters/imageAdapter');
      const { unifiedImageService } = await import('../../services/unifiedImageService');

      const resolvedUrl = await unifiedImageService.resolveForApi(startKeyframeImageUrl);
      setProgress(30);

      const output = await callDramaBackendVLApi({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        referenceImages: [resolvedUrl],
      });

      setProgress(60);
      setVlmAnalysis(output);

      // 步骤2: LLM 根据 VLM 分析 + 剧情方向，整理生成 gridType 个分镜描述
      const { chat } = await import('../../services/modelService');

      const llmPrompt = `你是一个影视分镜师。请根据下面的"画面分析"和"剧情方向"，生成 ${gridType} 个连贯的分镜描述。

画面分析：
${output}

剧情方向：
${narrativeDirection || '（未提供，请基于画面分析做合理的剧情推演）'}

要求：
- 第1个分镜延续当前画面，往后推演故事
- 每个分镜 15-30 字，包含：构图、角色动作、画面情绪
- ${gridType} 个分镜之间要有叙事递进关系，形成起承转合
- 保持角色、场景、光影风格一致

输出格式（不要有多余文字）：
分镜1: <描述>
分镜2: <描述>
分镜3: <描述>
分镜4: <描述>`;

      const llmResult = await chat({ prompt: llmPrompt });
      setProgress(80);

      // 解析 "分镜N: <描述>" 或 "N. <描述>" 或 "- <描述>" 格式
      let parsed: string[] = [];
      const lines = llmResult
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      for (const line of lines) {
        const match = line.match(/^(?:分镜\s*)?\d+[.:、]\s*(.+)/);
        if (match) {
          parsed.push(match[1].trim());
        } else if (line.length > 5) {
          parsed.push(line.replace(/^[-*]\s*/, '').trim());
        }
        if (parsed.length >= gridType) break;
      }

      // 保证正好 gridType 个
      while (parsed.length < gridType) {
        parsed.push(
          `分镜 ${parsed.length + 1}：延续当前画面${narrativeDirection ? '，' + narrativeDirection : ''}。`,
        );
      }
      parsed = parsed.slice(0, gridType);

      setDescriptions(parsed);
      setSelectedIndexes(parsed.map((_, i) => i));
      setPhase('edit');
      setProgress(100);

      onSave({
        status: 'analysis_done',
        narrativeDirection,
        vlmAnalysis: output,
        descriptions: parsed,
        selectedIndexes: parsed.map((_, i) => i),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (err: any) {
      setError(err.message || '推演分析失败');
    } finally {
      setIsProcessing(false);
    }
  }, [
    startKeyframeImageUrl,
    systemPrompt,
    userPrompt,
    narrativeDirection,
    gridType,
    isProcessing,
    onSave,
  ]);

  /** 步骤2: 生成宫格图 */
  const handleGenerateStoryboard = useCallback(async () => {
    if (!startKeyframeImageUrl || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setProgress(10);

    try {
      const { callImageApi } = await import('../../services/adapters/imageAdapter');
      const { unifiedImageService } = await import('../../services/unifiedImageService');

      const resolvedUrl = await unifiedImageService.resolveForApi(startKeyframeImageUrl);
      setProgress(30);

      const descText = descriptions.filter((_, i) => selectedIndexes.includes(i)).join('\n');
      const resultUrl = await callImageApi({
        prompt: descText || descriptions.join('\n'),
        referenceImages: [resolvedUrl],
        isStoryboard: true,
        gridnum: gridType,
        itemWidth: 1024,
      });
      setProgress(80);

      setImageUrl(resultUrl);
      const match = resultUrl.match(/^local:(.+)$/);
      if (match) setImageId(match[1]);
      setPhase('preview');
      setProgress(100);

      onSave({
        status: 'completed',
        narrativeDirection,
        vlmAnalysis,
        descriptions,
        selectedIndexes,
        imageUrl: resultUrl,
        imageId: match ? match[1] : undefined,
        createdAt: initialFourGrid?.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
    } catch (err: any) {
      setError(err.message || '宫格图生成失败');
    } finally {
      setIsProcessing(false);
    }
  }, [
    startKeyframeImageUrl,
    descriptions,
    selectedIndexes,
    gridType,
    isProcessing,
    vlmAnalysis,
    narrativeDirection,
    initialFourGrid,
    onSave,
  ]);

  const handleConfirm = () => {
    onConfirm(selectedIndexes.length > 0 ? selectedIndexes : descriptions.map((_, i) => i));
    onClose();
  };

  const handleBackToEdit = () => {
    setPhase('edit');
    setImageUrl(null);
  };

  const handleBackToAnalyze = () => {
    setPhase('analyze');
    setVlmAnalysis('');
    setDescriptions(DEFAULT_DESCRIPTIONS);
    setImageUrl(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--border-primary)] shrink-0">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">画面推演</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {phase === 'analyze' && 'AI 分析首帧画面，生成分镜描述'}
              {phase === 'edit' && '编辑分镜描述，生成四宫格图'}
              {phase === 'preview' && '预览四宫格结果'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-400 underline mt-1"
              >
                关闭
              </button>
            </div>
          )}

          {/* Phase 1: Analyze */}
          {phase === 'analyze' && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
                <div className="px-4 py-2 bg-gray-800 border-b border-[var(--border-primary)] flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                    参考图片
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">首帧关键帧</span>
                </div>
                <div className="p-3">
                  <div className="aspect-video bg-[var(--bg-hover)] rounded-lg overflow-hidden">
                    {startKfSrc ? (
                      <img src={startKfSrc} className="w-full h-full object-cover" alt="首帧" />
                    ) : startKeyframeImageUrl && startKfLoading ? (
                      <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-xs">
                        加载中...
                      </div>
                    ) : startKeyframeImageUrl ? (
                      <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-xs">
                        图片加载失败
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] text-sm gap-2">
                        <span>无首帧图片</span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          请先生成镜头的首帧关键帧
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  System Prompt{' '}
                  <span className="text-[var(--text-muted)] font-normal">（系统提示词）</span>
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  User Prompt{' '}
                  <span className="text-[var(--text-muted)] font-normal">（用户提示词）</span>
                </label>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  剧情方向{' '}
                  <span className="text-[var(--text-muted)] font-normal">
                    （可选，引导 AI 推演方向）
                  </span>
                </label>
                <textarea
                  value={narrativeDirection}
                  onChange={(e) => setNarrativeDirection(e.target.value)}
                  placeholder="例如：主角发现密道，决定探索..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none placeholder:text-[var(--text-muted)]"
                />
              </div>

              {isProcessing ? (
                <div className="py-8 text-center">
                  <div className="flex items-center justify-center mb-4">
                    <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mb-2">
                    AI 正在分析画面并生成分镜描述... {progress}%
                  </p>
                  <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : !startKeyframeImageUrl ? (
                <div className="space-y-2">
                  <button
                    disabled
                    className="w-full py-2.5 bg-amber-600/50 text-white/50 text-sm font-medium rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    请先关闭弹窗，生成镜头的首帧关键帧
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={!startKeyframeImageUrl}
                  className="w-full py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  AI 分析并生成分镜描述
                </button>
              )}
            </div>
          )}

          {/* Phase 2: Edit Descriptions */}
          {phase === 'edit' && (
            <div className="space-y-4">
              {vlmAnalysis && (
                <details className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)]">
                  <summary className="px-4 py-2 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)]">
                    VLM 原始分析（点击展开）
                  </summary>
                  <div className="px-4 pb-3 text-xs text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed">
                    {vlmAnalysis}
                  </div>
                </details>
              )}

              <div className="space-y-3">
                {descriptions.map((desc, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <label className="flex items-center gap-1.5 shrink-0 mt-3">
                      <input
                        type="checkbox"
                        checked={selectedIndexes.includes(i)}
                        onChange={() => {
                          setSelectedIndexes((prev) =>
                            prev.includes(i) ? prev.filter((j) => j !== i) : [...prev, i],
                          );
                        }}
                        className="w-4 h-4"
                      />
                    </label>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-[var(--text-tertiary)] mb-1 font-mono">
                        分镜 {i + 1}
                      </div>
                      <textarea
                        value={desc}
                        onChange={(e) => {
                          const updated = [...descriptions];
                          updated[i] = e.target.value;
                          setDescriptions(updated);
                        }}
                        rows={2}
                        className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {isProcessing ? (
                <div className="py-8 text-center">
                  <div className="flex items-center justify-center mb-4">
                    <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mb-2">
                    正在生成四宫格... {progress}%
                  </p>
                  <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleBackToAnalyze}
                    className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm rounded-lg hover:text-[var(--text-primary)] transition-colors flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    重新分析
                  </button>
                  <button
                    onClick={handleGenerateStoryboard}
                    disabled={descriptions.every((d) => !d.trim())}
                    className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    生成宫格图
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Phase 3: Preview */}
          {phase === 'preview' && (
            <div className="space-y-4">
              {imageUrl && resultSrc ? (
                <div className="bg-[var(--bg-base)] rounded-lg border border-green-500/30 overflow-hidden">
                  <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20">
                    <p className="text-xs font-bold text-green-400 uppercase tracking-wider">
                      生成结果
                    </p>
                  </div>
                  <div className="p-4">
                    <img src={resultSrc} className="w-full rounded-lg" alt="四宫格推演结果" />
                  </div>
                </div>
              ) : imageUrl && resultLoading ? (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  图片加载中...
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  暂无结果图片
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleBackToEdit}
                  className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm rounded-lg hover:text-[var(--text-primary)] transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  重新生成
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  确认使用
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-[var(--border-primary)] flex justify-between items-center shrink-0">
          <p className="text-[10px] text-[var(--text-muted)]">
            {phase === 'analyze' && '填写 Prompt → VLM 分析 → 生成分镜描述'}
            {phase === 'edit' && '编辑分镜 → 生成四宫格图'}
            {phase === 'preview' && '确认后将填充到视频参数'}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors"
          >
            {phase === 'preview' ? '关闭' : '取消'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeductionModal;
