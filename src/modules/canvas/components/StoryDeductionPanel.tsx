import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';

interface StoryDeductionPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

export const StoryDeductionPanel: React.FC<StoryDeductionPanelProps> = ({ selectedLayerId, onClose }) => {
  const [systemPrompt, setSystemPrompt] = useState('你是一个专业的影视分镜师。请分析当前画面后，创作后续4个分镜的详细描述。');
  const [userPrompt, setUserPrompt] = useState(`分析这张画面的场景、构图、光影、角色和情绪，然后为下一帧的4个分镜画面做详细描述：

要求：
- 输出4个分镜描述，每个描述一句话，每行一个
- 保持角色、场景、光影风格一致
- 每个分镜之间要有叙事递进关系`);
  const [vlOutput, setVlOutput] = useState('');
  const [editedPrompt, setEditedPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const displaySrc = selectedLayer?.type === 'image' && selectedLayer?.src ? selectedLayer.src : null;

  const handleAnalyze = async () => {
    if (!displaySrc || !selectedLayer || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setProgress(10);

    try {
      const { callDramaBackendVLApi } = await import('../../../../services/adapters/imageAdapter');

      setProgress(30);

      const output = await callDramaBackendVLApi({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        referenceImages: [selectedLayer.src],
      });

      setProgress(80);
      setVlOutput(output);
      setEditedPrompt(output);
      setProgress(100);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = async () => {
    if (!displaySrc || !selectedLayer || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setProgress(10);

    try {
      const { callImageApi } = await import('../../../../services/adapters/imageAdapter');
      const { unifiedImageService } = await import('../../../../services/unifiedImageService');

      const imageUrl = await unifiedImageService.resolveForApi(selectedLayer.src);
      setProgress(30);

      const resultUrl = await callImageApi({
        prompt: editedPrompt,
        referenceImages: [imageUrl],
        isStoryboard: true,
        gridnum: 4,
        itemWidth: 512,
      });

      setProgress(85);
      const displayUrl = await unifiedImageService.resolveForDisplay(resultUrl);
      setResultImageUrl(displayUrl);
      setProgress(100);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToCanvas = () => {
    if (!resultImageUrl || !selectedLayer) return;

    addLayer({
      id: crypto.randomUUID(),
      type: 'image',
      x: selectedLayer.x,
      y: selectedLayer.y + selectedLayer.height + 40,
      width: 1024,
      height: 512,
      src: resultImageUrl,
      imageId: `storyboard_4grid_${Date.now()}`,
      title: `${selectedLayer.title} - 四宫格推演`,
      createdAt: Date.now(),
      sourceLayerId: selectedLayer.id,
      operationType: '4grid',
    });

    onClose();
  };

  if (!displaySrc) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">剧情推演</h3>
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
            <h3 className="text-lg font-bold text-[var(--text-primary)]">剧情推演</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              基于「{selectedLayer?.title}」推演后续四宫格分镜
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

          {!vlOutput && (
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
                  System Prompt <span className="text-[var(--text-muted)] font-normal">（系统提示词）</span>
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  User Prompt <span className="text-[var(--text-muted)] font-normal">（用户提示词）</span>
                </label>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                />
              </div>

              {isProcessing ? (
                <div className="py-8 text-center">
                  <div className="flex items-center justify-center mb-4">
                    <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mb-2">AI 正在分析画面并生成分镜描述... {progress}%</p>
                  <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                    <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleAnalyze}
                  className="w-full py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  AI 分析并生成分镜描述
                </button>
              )}
            </>
          )}

          {vlOutput && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-base)] rounded-lg border border-amber-500/30 overflow-hidden">
                <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">分镜描述结果（可编辑）</p>
                </div>
                <div className="p-4">
                  <div className="flex gap-3 mb-3">
                    <div className="w-20 h-14 rounded overflow-hidden shrink-0 bg-[var(--bg-hover)]">
                      <img src={displaySrc} className="w-full h-full object-cover" alt="参考" />
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                      基于当前画面生成4个分镜描述，<br />修改后点击下方按钮生成四宫格
                    </div>
                  </div>
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none font-mono leading-relaxed"
                  />
                </div>
              </div>

              {resultImageUrl && (
                <div className="bg-[var(--bg-base)] rounded-lg border border-green-500/30 overflow-hidden">
                  <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20">
                    <p className="text-xs font-bold text-green-400 uppercase tracking-wider">生成结果</p>
                  </div>
                  <div className="p-4">
                    <img src={resultImageUrl} className="w-full rounded-lg" alt="四宫格推演结果" />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setVlOutput(''); setResultImageUrl(null); }}
                  className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm rounded-lg hover:text-[var(--text-primary)] transition-colors"
                >
                  重新分析
                </button>

                {!resultImageUrl ? (
                  <button
                    onClick={handleGenerate}
                    disabled={isProcessing || !editedPrompt.trim()}
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
                        生成四宫格推演
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
            {vlOutput ? (resultImageUrl ? '保存四宫格到画布' : '编辑分镜描述后生成四宫格') : '填写 prompt → VLM 分析 → 生成四宫格'}
          </p>
          <button onClick={onClose} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors">
            {resultImageUrl ? '关闭' : '取消'}
          </button>
        </div>
      </div>
    </div>
  );
};