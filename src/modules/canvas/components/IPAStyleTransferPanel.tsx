import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { AspectRatio } from '../../../../types/model';
import { ResolvedImage } from './ResolvedImage';
import { logger, LogCategory } from '../../../../services/logger.ts';

interface IPAStyleTransferPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

const HINT = '画面是1个男人参考(图1三视图)手指前方和他的龙，画面4k，高清';

const aspectRatios: { value: AspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9 横屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '1:1', label: '1:1 方形' },
];

export const IPAStyleTransferPanel: React.FC<IPAStyleTransferPanelProps> = ({
  selectedLayerId,
  onClose,
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [enhance, setEnhance] = useState(false);
  const { layers, addLayer } = useCanvasStore();

  const styleLayer = selectedLayerId ? layers.find((l) => l.id === selectedLayerId) : null;
  const hasStyleLayer = styleLayer?.type === 'image' && styleLayer?.src && !styleLayer?.isLoading;

  const imageLayers = layers.filter(
    (l) => l.id !== selectedLayerId && l.type === 'image' && l.src && !l.isLoading,
  );

  const toggleRef = (id: string) => {
    setSelectedRefIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length >= 3 ? prev : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    if (!hasStyleLayer || !prompt.trim() || isProcessing || !styleLayer) return;

    setIsProcessing(true);
    setProgress(0);

    const refImages = selectedRefIds
      .map((id) => {
        const l = layers.find((ly) => ly.id === id);
        return l?.src || '';
      })
      .filter(Boolean);

    try {
      const resultUrl = await canvasModelService.ipaStyleTransfer(
        prompt,
        refImages,
        aspectRatio,
        (p) => setProgress(p),
        styleLayer.src,
        enhance,
      );

      const { imageStorageService } = await import('../../../../services/imageStorageService');
      let resolvedUrl = resultUrl;
      let imageId: string | undefined;

      if (resultUrl.startsWith('local:')) {
        const localId = resultUrl.replace('local:', '');
        imageId = localId;
        const blob = await imageStorageService.getImage(localId);
        if (blob) {
          const reader = new FileReader();
          resolvedUrl = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      }

      addLayer({
        id: crypto.randomUUID(),
        type: 'image',
        x: styleLayer.x + styleLayer.width + 20,
        y: styleLayer.y,
        width: styleLayer.width,
        height: styleLayer.height,
        src: resolvedUrl,
        imageId,
        title: `${styleLayer.title} - IPA风格迁移`,
        isLoading: false,
        createdAt: Date.now(),
        sourceLayerId: styleLayer.id,
        sourceLayerIds: [styleLayer.id, ...selectedRefIds],
        operationType: 'ipa-style-transfer',
        generationPrompt: prompt,
      });

      onClose();
    } catch (error: any) {
      logger.error(LogCategory.CANVAS, 'IPA 风格迁移失败:', error);
      alert(`IPA 风格迁移失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasStyleLayer) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">IPA 风格迁移</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张风格参考图，然后再使用 IPA 风格迁移功能。
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">IPA 风格迁移</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
          选中图片作为<strong className="text-purple-400">风格参考（ref_image）</strong>， 再选 1~3
          张作为<strong className="text-blue-400">内容参考（图1/图2/图3）</strong>。
          在提示词中用「图1」「图2」「图3」引用各参考图。
        </p>

        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">场景描述</span>
              <span className="text-[10px] text-[var(--text-muted)]">
                在提示词中引用「图1」「图2」「图3」指定参考图
              </span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={HINT}
              className="w-full h-[72px] px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400">
                ref_image
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)]">风格参考图</span>
              <span className="text-[10px] text-[var(--text-muted)]">
                — 色彩、纹理、整体风格走向
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden border border-purple-500/30 shrink-0">
                <img
                  src={styleLayer?.src}
                  alt={styleLayer?.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate">{styleLayer?.title}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">此图作为风格依据</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">
                  图1
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                  图2
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">
                  图3
                </span>
                <span className="text-sm font-medium text-[var(--text-primary)]">内容参考图</span>
                <span className="text-[10px] text-[var(--text-muted)]">— 构图、姿态、角色细节</span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                已选 {selectedRefIds.length}/3
              </span>
            </div>
            {imageLayers.length === 0 ? (
              <p className="text-xs text-yellow-400 bg-gray-800/50 rounded-lg px-3 py-2">
                画布上没有其他可用图片作为内容参考。
              </p>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {imageLayers.map((l) => {
                  const selIndex = selectedRefIds.indexOf(l.id);
                  const isSelected = selIndex !== -1;
                  const tagLabels = ['图1', '图2', '图3'];
                  const tagColors = [
                    'bg-blue-500/20 text-blue-400 border-blue-500/40',
                    'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
                    'bg-orange-500/20 text-orange-400 border-orange-500/40',
                  ];
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleRef(l.id)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? 'border-blue-500 ring-2 ring-blue-500/30 scale-[1.02]'
                          : 'border-gray-600 hover:border-gray-400'
                      }`}
                      title={l.title}
                    >
                      <ResolvedImage
                        src={l.src}
                        alt={l.title}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <span
                          className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${tagColors[selIndex]}`}
                        >
                          {tagLabels[selIndex]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">输出比例</span>
            </div>
            <div className="flex gap-2">
              {aspectRatios.map((ar) => (
                <button
                  key={ar.value}
                  onClick={() => setAspectRatio(ar.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    aspectRatio === ar.value
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-600 text-[var(--text-secondary)] hover:border-gray-400'
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enhance}
              onChange={(e) => setEnhance(e.target.checked)}
              className="w-4 h-4 rounded border-gray-500 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-[var(--text-primary)]">增强风格迁移效果</span>
            <span className="text-[10px] text-[var(--text-muted)]">— 开启后风格迁移强度更高</span>
          </label>
        </div>

        {isProcessing ? (
          <div className="py-6 mt-4">
            <div className="flex items-center justify-center mb-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-center text-sm text-[var(--text-muted)]">
              正在进行 IPA 风格迁移... {progress}%
            </p>
            <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            className={`w-full mt-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              prompt.trim()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            开始生成{' '}
            {selectedRefIds.length > 0
              ? `(ref + 图${selectedRefIds.map((_, i) => i + 1).join(' + 图')})`
              : ''}
          </button>
        )}

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
