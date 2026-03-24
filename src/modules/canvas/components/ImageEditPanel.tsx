import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface ImageEditPanelProps {
  selectedLayerId: string | null;
  editMode: 'background' | 'expand';
  onClose: () => void;
}

const backgroundPresets = [
  { id: 'sunset-beach', name: '日落海滩', emoji: '🌅' },
  { id: 'city-night', name: '城市夜景', emoji: '🌃' },
  { id: 'forest', name: '森林', emoji: '🌲' },
  { id: 'mountain', name: '山脉', emoji: '⛰️' },
  { id: 'underwater', name: '水下', emoji: '🐠' },
  { id: 'space', name: '太空', emoji: '🚀' },
  { id: 'office', name: '办公室', emoji: '🏢' },
  { id: 'garden', name: '花园', emoji: '🌺' }
];

const expandDirections = [
  { id: 'all', name: '四周扩展', emoji: '↖️' },
  { id: 'left', name: '向左扩展', emoji: '⬅️' },
  { id: 'right', name: '向右扩展', emoji: '➡️' },
  { id: 'top', name: '向上扩展', emoji: '⬆️' },
  { id: 'bottom', name: '向下扩展', emoji: '⬇️' },
  { id: 'left-right', name: '左右扩展', emoji: '↔️' },
  { id: 'top-bottom', name: '上下扩展', emoji: '↕️' }
];

export const ImageEditPanel: React.FC<ImageEditPanelProps> = ({ selectedLayerId, editMode, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const { layers, addLayer, updateLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleBackgroundReplace = async (background: string) => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const newImageUrl = await canvasModelService.replaceBackground(
        selectedLayer.src,
        background,
        (p) => setProgress(p)
      );

      const { imageStorageService } = await import('../../../../services/imageStorageService');
      let resolvedUrl = newImageUrl;

      if (newImageUrl.startsWith('local:')) {
        const localId = newImageUrl.replace('local:', '');
        const blob = await imageStorageService.getImage(localId);
        if (blob) {
          const reader = new FileReader();
          resolvedUrl = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      }

      const newLayerId = crypto.randomUUID();
      addLayer({
        id: newLayerId,
        type: 'image',
        x: selectedLayer.x + selectedLayer.width + 20,
        y: selectedLayer.y,
        width: selectedLayer.width,
        height: selectedLayer.height,
        src: resolvedUrl,
        title: `背景替换 - ${background}`,
        isLoading: false,
        createdAt: Date.now()
      });

      onClose();
    } catch (error: any) {
      console.error('背景替换失败:', error);
      alert(`背景替换失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExpandImage = async (direction: string) => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const newImageUrl = await canvasModelService.expandImage(
        selectedLayer.src,
        direction,
        (p) => setProgress(p)
      );

      const { imageStorageService } = await import('../../../../services/imageStorageService');
      let resolvedUrl = newImageUrl;

      if (newImageUrl.startsWith('local:')) {
        const localId = newImageUrl.replace('local:', '');
        const blob = await imageStorageService.getImage(localId);
        if (blob) {
          const reader = new FileReader();
          resolvedUrl = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      }

      const directionName = expandDirections.find(d => d.id === direction)?.name || '扩展';
      const newLayerId = crypto.randomUUID();
      addLayer({
        id: newLayerId,
        type: 'image',
        x: selectedLayer.x,
        y: selectedLayer.y,
        width: selectedLayer.width * 1.5,
        height: selectedLayer.height * 1.5,
        src: resolvedUrl,
        title: `图片扩展 - ${directionName}`,
        isLoading: false,
        createdAt: Date.now()
      });

      onClose();
    } catch (error: any) {
      console.error('图片扩展失败:', error);
      alert(`图片扩展失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
            {editMode === 'background' ? '背景替换' : '图片扩展'}
          </h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张图片，然后再使用此功能。
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
      <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            {editMode === 'background' ? '背景替换' : '图片扩展'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-[var(--text-muted)]">
            {editMode === 'background' 
              ? '选择预设背景或输入自定义背景描述。'
              : '选择扩展方向，AI 将自动填充扩展区域。'}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            当前图片: {selectedLayer?.title}
          </p>
        </div>

        {isProcessing ? (
          <div className="py-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-center text-sm text-[var(--text-muted)]">
              {editMode === 'background' ? '正在替换背景...' : '正在扩展图片...'} {progress}%
            </p>
            <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            {editMode === 'background' ? (
              <>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {backgroundPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleBackgroundReplace(preset.name)}
                      className="flex flex-col items-center justify-center p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      <span className="text-2xl mb-1">{preset.emoji}</span>
                      <span className="text-xs text-white">{preset.name}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="输入自定义背景描述..."
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => customInput.trim() && handleBackgroundReplace(customInput.trim())}
                    disabled={!customInput.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    应用
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {expandDirections.map((direction) => (
                  <button
                    key={direction.id}
                    onClick={() => handleExpandImage(direction.id)}
                    className="flex flex-col items-center justify-center p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    <span className="text-2xl mb-2">{direction.emoji}</span>
                    <span className="text-xs text-white">{direction.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex justify-end">
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
