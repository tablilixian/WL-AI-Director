import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { unifiedImageService } from '../../../../services/unifiedImageService';

interface ImageToImagePanelProps {
  selectedLayerId: string;
  onClose: () => void;
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

async function resolveImageUrl(imageUrl: string): Promise<string> {
  return await unifiedImageService.resolveForApi(imageUrl);
}

export const ImageToImagePanel: React.FC<ImageToImagePanelProps> = ({ selectedLayerId, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { layers, addLayer, updateLayer } = useCanvasStore();

  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  if (!selectedLayer || selectedLayer.type !== 'image') return null;

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);

    try {
      updateLayer(selectedLayer.id, { isLoading: true, progress: 0 });

      const imageUrl = await canvasModelService.generateImage({
        prompt: `Edit this image: ${prompt}`,
        referenceImages: [selectedLayer.src],
        aspectRatio: '16:9',
        onProgress: (p) => {
          updateLayer(selectedLayer.id, { progress: p });
        }
      });

      const resolvedUrl = await resolveImageUrl(imageUrl);
      let imageId: string | undefined;

      if (resolvedUrl.startsWith('data:')) {
        try {
          const imgId = unifiedImageService.generateImageId();
          const response = await fetch(resolvedUrl);
          const blob = await response.blob();
          await unifiedImageService.saveImage(imgId, blob);
          imageId = imgId;
        } catch (e) {
          console.warn('[ImageToImage] 保存图片到 IndexedDB 失败:', e);
        }
      } else if (resolvedUrl.startsWith('local:')) {
        imageId = resolvedUrl.replace('local:', '');
      }

      const dimensions = await getImageDimensions(resolvedUrl);

      addLayer({
        id: crypto.randomUUID(),
        type: 'image',
        x: selectedLayer.x + selectedLayer.width + 20,
        y: selectedLayer.y,
        width: Math.round(dimensions.width),
        height: Math.round(dimensions.height),
        src: resolvedUrl,
        imageId,
        title: prompt.slice(0, 30),
        isLoading: false,
        createdAt: Date.now(),
        sourceLayerId: selectedLayer.id,
        operationType: 'image-to-image',
        generationPrompt: prompt
      });

      updateLayer(selectedLayer.id, { isLoading: false, progress: 100 });
      setPrompt('');
      onClose();
    } catch (error: any) {
      console.error('图生图失败:', error);
      alert(`生成失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-4 w-[480px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">图生图</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-xs text-gray-400 mb-3">
          参考: {selectedLayer.title}
        </div>

        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          placeholder="描述你想对图片进行的修改..."
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
          disabled={isGenerating}
        />

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="px-4 py-2 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              '生成图片'
            )}
          </button>
        </div>

        {isGenerating && (
          <div className="mt-3">
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
