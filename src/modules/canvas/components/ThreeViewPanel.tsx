import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface ThreeViewPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

export const ThreeViewPanel: React.FC<ThreeViewPanelProps> = ({ selectedLayerId, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleGenerate = async () => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const { imageStorageService } = await import('../../../../services/imageStorageService');

      const imageUrl = await canvasModelService.generateImage({
        prompt: `Character turnaround sheet for ${selectedLayer.title}`,
        referenceImages: [selectedLayer.src],
        isCharacterTurnaround: true,
        onProgress: (p) => setProgress(p),
      });

      let resolvedUrl = imageUrl;
      let imageId: string | undefined;

      if (imageUrl.startsWith('local:')) {
        const localId = imageUrl.replace('local:', '');
        imageId = localId;
        const blob = await imageStorageService.getImage(localId);
        if (blob) {
          const reader = new FileReader();
          resolvedUrl = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } else if (imageUrl.startsWith('data:')) {
        const imgId = `three_view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        await imageStorageService.saveImage(imgId, blob);
        imageId = imgId;
      }

      const img = new Image();
      const naturalSize = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = resolvedUrl;
      });

      const maxWidth = selectedLayer.width * 1.5;
      const scale = Math.min(maxWidth / naturalSize.width, 1);
      addLayer({
        id: crypto.randomUUID(),
        type: 'image',
        x: selectedLayer.x,
        y: selectedLayer.y + selectedLayer.height + 40,
        width: naturalSize.width * scale,
        height: naturalSize.height * scale,
        src: resolvedUrl,
        imageId,
        title: `${selectedLayer.title} - 三视图`,
        createdAt: Date.now(),
        sourceLayerId: selectedLayer.id,
        operationType: 'three-view',
      });

      onClose();
    } catch (error: any) {
      console.error('三视图生成失败:', error);
      alert(`三视图生成失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">角色三视图</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">请先选中一张角色图片，然后再使用此功能。</p>
          <button onClick={onClose} className="w-full py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl max-w-lg w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--border-primary)]">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">角色三视图</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              基于「{selectedLayer?.title}」生成角色多角度视图
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isProcessing ? (
            <div className="py-12">
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-center text-sm text-[var(--text-muted)] mb-2">正在生成三视图... {progress}%</p>
              <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-primary)]">
              <p>基于角色的定妆照，AI 会保持角色设计的一致性，生成正面、侧面、背面的多角度视图。适合用于角色设计确认和后续分镜制作。</p>
            </div>
          )}
        </div>

        {!isProcessing && (
          <div className="p-6 pt-4 border-t border-[var(--border-primary)] flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors">
              取消
            </button>
            <button
              onClick={handleGenerate}
              className="px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
            >
              生成三视图
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
