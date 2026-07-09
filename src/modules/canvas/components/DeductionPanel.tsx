import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface DeductionPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

const DEFAULTS = {
  analysisSystemPrompt: '你是一个专业的影视镜头分析师。请从电影摄影的角度分析这张画面。',
  analysisPrompt: `请分析这张画面的以下要素，每项用一句话描述：
1. 场景：这是什么场景/环境？
2. 构图：镜头构图方式、主体位置
3. 光影：光源方向、光线质感、色调
4. 角色/主体：画面中的角色或主要视觉元素
5. 情绪/氛围：画面的情绪基调
6. 镜头语言：机位、焦段、运镜方式`,
  deductionSystemPrompt: '你是一个专业的影视编剧。请基于当前帧的画面分析和剧情方向，推演下一帧的内容。',
  deductionPrompt: `基于以上画面分析结果，推演下一帧的内容。要求：
1. 保持角色、场景、光影风格的一致性
2. 叙事要自然推进，有合理的动因
3. 明确描述构图变化和镜头运动
4. 输出结构化的推演结果`,
};

export const DeductionPanel: React.FC<DeductionPanelProps> = ({ selectedLayerId, onClose }) => {
  const [analysisSystemPrompt, setAnalysisSystemPrompt] = useState(DEFAULTS.analysisSystemPrompt);
  const [analysisPrompt, setAnalysisPrompt] = useState(DEFAULTS.analysisPrompt);
  const [deductionSystemPrompt, setDeductionSystemPrompt] = useState(DEFAULTS.deductionSystemPrompt);
  const [deductionPrompt, setDeductionPrompt] = useState(DEFAULTS.deductionPrompt);
  const [narrativeDirection, setNarrativeDirection] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [deductionResult, setDeductionResult] = useState<any>(null);
  const [nextFrameText, setNextFrameText] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentAction, setCurrentAction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAnalysisPrompt, setShowAnalysisPrompt] = useState(true);
  const [showDeductionPrompt, setShowDeductionPrompt] = useState(true);
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const displaySrc = selectedLayer?.type === 'image' && selectedLayer?.src ? selectedLayer.src : null;

  const handleAnalyze = async () => {
    if (!displaySrc || !selectedLayer || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setProgress(10);
    setCurrentAction('正在分析画面并推演剧情...');

    try {
      const { callDramaBackendDeductionApi } = await import('../../../../services/adapters/imageAdapter');
      const { unifiedImageService } = await import('../../../../services/unifiedImageService');

      const imageUrl = await unifiedImageService.resolveForApi(selectedLayer.src);
      setProgress(30);

      let finalDeductionPrompt = deductionPrompt;
      if (narrativeDirection.trim()) {
        finalDeductionPrompt += `\n\n剧情方向：${narrativeDirection.trim()}`;
      }

      const result = await callDramaBackendDeductionApi(imageUrl, {
        analysisSystemPrompt,
        analysisPrompt,
        deductionSystemPrompt,
        deductionPrompt: finalDeductionPrompt,
      });

      setProgress(80);
      setAnalysisResult(result.analysis);
      setDeductionResult(result.deduction);
      setNextFrameText(result.deduction.next_frame);
      setProgress(100);
    } catch (err: any) {
      if (err.message?.includes('404')) {
        setError('后端 deduction 接口尚未部署。请联系后端团队实现 POST /api/v1/generate/deduction 端点。');
      } else {
        setError(err.message);
      }
    } finally {
      setIsProcessing(false);
      setCurrentAction('');
    }
  };

  const handleGenerateImage = async () => {
    if (!displaySrc || !selectedLayer || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setProgress(10);
    setCurrentAction('正在生成推演图片...');

    try {
      const { unifiedImageService } = await import('../../../../services/unifiedImageService');
      const imageUrl = await unifiedImageService.resolveForApi(selectedLayer.src);

      setProgress(30);
      const resultUrl = await canvasModelService.generateImage({
        prompt: nextFrameText,
        referenceImages: [imageUrl],
        aspectRatio: '16:9',
        onProgress: (p) => setProgress(30 + Math.round(p * 0.6)),
      });

      setProgress(95);
      const displayUrl = await unifiedImageService.resolveForDisplay(resultUrl);
      setGeneratedImageUrl(displayUrl);
      setProgress(100);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setCurrentAction('');
    }
  };

  const handleSaveToCanvas = () => {
    if (!generatedImageUrl || !selectedLayer) return;
    addLayer({
      id: crypto.randomUUID(),
      type: 'image',
      x: selectedLayer.x + selectedLayer.width + 40,
      y: selectedLayer.y,
      width: selectedLayer.width,
      height: selectedLayer.height,
      src: generatedImageUrl,
      imageId: `deduction_${Date.now()}`,
      title: `${selectedLayer.title} - 推演结果`,
      createdAt: Date.now(),
      sourceLayerId: selectedLayer.id,
      operationType: 'image-to-image',
    });
    onClose();
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setDeductionResult(null);
    setNextFrameText('');
    setGeneratedImageUrl(null);
    setError(null);
    setProgress(0);
  };

  if (!displaySrc) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">推演后续剧情</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">请先选中一张关键帧图片。</p>
          <button onClick={onClose} className="w-full py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--border-primary)] shrink-0">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">推演后续剧情</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              基于「{selectedLayer?.title}」推演下一帧画面
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-red-400 underline mt-1">关闭</button>
            </div>
          )}

          {!analysisResult && !isProcessing && (
            <>
              <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
                <div className="px-4 py-2 bg-gray-800 border-b border-[var(--border-primary)] flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">参考图片</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{selectedLayer?.title}</span>
                </div>
                <div className="p-3">
                  <div className="aspect-video bg-[var(--bg-hover)] rounded-lg overflow-hidden">
                    <img src={displaySrc} className="w-full h-full object-cover" alt="参考图片" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  剧情方向 <span className="text-[var(--text-muted)] font-normal">（可选，描述剧情走向）</span>
                </label>
                <textarea
                  value={narrativeDirection}
                  onChange={(e) => setNarrativeDirection(e.target.value)}
                  placeholder="例如：主角发现密道，决定探索..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none focus:border-amber-500 outline-none"
                />
              </div>

              <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowAnalysisPrompt(!showAnalysisPrompt)}
                  className="w-full px-4 py-2 flex items-center justify-between bg-[var(--bg-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <span>① 画面分析 Prompt（image2vl 参数）</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${showAnalysisPrompt ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showAnalysisPrompt && (
                  <div className="p-4 space-y-3 border-t border-[var(--border-primary)]">
                    <div>
                      <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">system_prompt</label>
                      <textarea
                        value={analysisSystemPrompt}
                        onChange={(e) => setAnalysisSystemPrompt(e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">prompt</label>
                      <textarea
                        value={analysisPrompt}
                        onChange={(e) => setAnalysisPrompt(e.target.value)}
                        rows={4}
                        className="w-full px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowDeductionPrompt(!showDeductionPrompt)}
                  className="w-full px-4 py-2 flex items-center justify-between bg-[var(--bg-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <span>② 剧情推演 Prompt（LLM 参数）</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${showDeductionPrompt ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showDeductionPrompt && (
                  <div className="p-4 space-y-3 border-t border-[var(--border-primary)]">
                    <div>
                      <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">system_prompt</label>
                      <textarea
                        value={deductionSystemPrompt}
                        onChange={(e) => setDeductionSystemPrompt(e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">prompt</label>
                      <textarea
                        value={deductionPrompt}
                        onChange={(e) => setDeductionPrompt(e.target.value)}
                        rows={4}
                        className="w-full px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleAnalyze}
                className="w-full py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                开始推演
              </button>
            </>
          )}

          {isProcessing && (
            <div className="py-8 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-2">{currentAction} {progress}%</p>
              <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {analysisResult && deductionResult && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
                <div className="px-4 py-2 bg-amber-500/10 border-b border-[var(--border-primary)]">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">画面分析结果</p>
                </div>
                <div className="p-4 space-y-2">
                  {[
                    ['场景', analysisResult.scene],
                    ['构图', analysisResult.composition],
                    ['光影', analysisResult.lighting],
                    ['角色', analysisResult.characters],
                    ['情绪', analysisResult.mood],
                    ['镜头', analysisResult.camera],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex gap-2">
                      <span className="text-xs font-medium text-[var(--text-tertiary)] w-12 shrink-0">{label as string}</span>
                      <span className="text-xs text-[var(--text-secondary)]">{value as string}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[var(--bg-base)] rounded-lg border border-amber-500/30 overflow-hidden">
                <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">✨ 推演结果</p>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-[var(--text-tertiary)] mb-1">下一帧画面描述 <span className="text-[var(--text-muted)]">（可编辑）</span></p>
                    <textarea
                      value={nextFrameText}
                      onChange={(e) => setNextFrameText(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none leading-relaxed"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--text-tertiary)] mb-1">推演逻辑</p>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed italic bg-[var(--bg-hover)] p-3 rounded-lg">{deductionResult.rationale}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-[var(--text-tertiary)] mb-1">保留元素</p>
                      <div className="flex flex-wrap gap-1">
                        {deductionResult.key_elements.map((el: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px]">{el}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[var(--text-tertiary)] mb-1">变化元素</p>
                      <div className="flex flex-wrap gap-1">
                        {deductionResult.changes.map((ch: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px]">{ch}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {generatedImageUrl && (
                <div className="bg-[var(--bg-base)] rounded-lg border border-green-500/30 overflow-hidden">
                  <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20">
                    <p className="text-xs font-bold text-green-400 uppercase tracking-wider">生成结果</p>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2">当前帧</p>
                        <div className="aspect-video bg-[var(--bg-hover)] rounded-lg overflow-hidden">
                          <img src={displaySrc} className="w-full h-full object-cover" alt="当前帧" />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2">推演下一帧</p>
                        <div className="aspect-video bg-[var(--bg-hover)] rounded-lg overflow-hidden">
                          <img src={generatedImageUrl} className="w-full h-full object-cover" alt="推演结果" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm rounded-lg hover:text-[var(--text-primary)] transition-colors"
                >
                  重新推演
                </button>
                {!generatedImageUrl ? (
                  <button
                    onClick={handleGenerateImage}
                    disabled={isProcessing || !nextFrameText.trim()}
                    className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        生成推演图片
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleSaveToCanvas}
                    className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    保存到画布
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-[var(--border-primary)] flex justify-between items-center shrink-0">
          <p className="text-[10px] text-[var(--text-muted)]">
            {analysisResult
              ? generatedImageUrl ? '保存推演结果到画布' : '编辑画面描述后可直接生成图片'
              : 'VLM 分析画面 → LLM 推演剧情 → 生成图片'}
          </p>
          <button onClick={onClose} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors">
            {generatedImageUrl ? '关闭' : '取消'}
          </button>
        </div>
      </div>
    </div>
  );
};