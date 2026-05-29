import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { unifiedImageService } from '../../../../services/unifiedImageService';

interface MultiAnglePanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

interface AngleConfig {
  id: string;
  label: string;
  shotSize: string;
  cameraAngle: string;
  description: string;
  selected: boolean;
}

const ANGLE_PRESETS: AngleConfig[] = [
  { id: 'wide-eye', label: '全景·平视', shotSize: '全景', cameraAngle: '平视', description: 'Full shot from eye level, showing the complete subject and surrounding environment with natural perspective.', selected: true },
  { id: 'medium-eye', label: '中景·平视', shotSize: '中景', cameraAngle: '平视', description: 'Medium shot from eye level, subject visible from waist up with balanced composition.', selected: true },
  { id: 'close-eye', label: '近景·平视', shotSize: '近景', cameraAngle: '平视', description: 'Close-up from eye level, focusing on subject\'s face and upper body with intimate framing.', selected: true },
  { id: 'wide-low', label: '全景·仰拍', shotSize: '全景', cameraAngle: '仰拍', description: 'Low angle wide shot, looking upward at the subject to emphasize height, power, and grandeur.', selected: true },
  { id: 'wide-high', label: '全景·俯拍', shotSize: '全景', cameraAngle: '俯拍', description: 'High angle wide shot, looking downward to show spatial layout and create a sense of overview.', selected: true },
  { id: 'detail', label: '特写·平视', shotSize: '特写', cameraAngle: '平视', description: 'Extreme close-up from eye level, focusing on specific details with intense visual impact.', selected: true },
  { id: 'medium-dutch', label: '中景·斜拍', shotSize: '中景', cameraAngle: '斜拍', description: 'Dutch angle medium shot with tilted horizon, creating dynamic tension and unease.', selected: true },
  { id: 'bird', label: '远景·鸟瞰', shotSize: '远景', cameraAngle: '鸟瞰', description: 'Bird\'s eye view from directly above, showing the complete scene layout from an overhead perspective.', selected: true },
  { id: 'over-shoulder', label: '中景·过肩', shotSize: '中景', cameraAngle: '过肩', description: 'Over-the-shoulder medium shot, showing the scene from behind a foreground subject with depth.', selected: true },
];

export const MultiAnglePanel: React.FC<MultiAnglePanelProps> = ({ selectedLayerId, onClose }) => {
  const [angles, setAngles] = useState<AngleConfig[]>(ANGLE_PRESETS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentAngle, setCurrentAngle] = useState('');
  const [layout, setLayout] = useState<'grid' | 'individual'>('grid');
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;
  const selectedCount = angles.filter(a => a.selected).length;

  const toggleAngle = (id: string) => {
    setAngles(prev => prev.map(a => a.id === id ? { ...a, selected: !a.selected } : a));
  };

  const handleGenerate = async () => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    const selectedAngles = angles.filter(a => a.selected);
    if (selectedAngles.length === 0) {
      alert('请至少选择一种角度');
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const { imageStorageService } = await import('../../../../services/imageStorageService');
      const results: { blob: Blob; angle: AngleConfig; index: number }[] = [];

      for (let i = 0; i < selectedAngles.length; i++) {
        const angle = selectedAngles[i];
        setCurrentAngle(`${angle.label} (${i + 1}/${selectedAngles.length})`);

        const prompt = `Same scene and subject, but change the camera perspective. ${angle.description}. Maintain consistent characters, lighting atmosphere, and color palette. Photorealistic, cinematic quality.`;

        const imageUrl = await canvasModelService.generateImage({
          prompt,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => {
            const baseProgress = (i / selectedAngles.length) * 100;
            setProgress(Math.round(baseProgress + (p / selectedAngles.length)));
          },
        });

        let resolvedUrl = imageUrl;
        let blob: Blob | null = null;

        if (imageUrl.startsWith('local:')) {
          const localId = imageUrl.replace('local:', '');
          blob = await imageStorageService.getImage(localId);
          if (blob) {
            const reader = new FileReader();
            resolvedUrl = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } else if (imageUrl.startsWith('data:')) {
          const response = await fetch(imageUrl);
          blob = await response.blob();
        }

        if (imageUrl.startsWith('data:') && blob) {
          const imgId = `multi_angle_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
          await imageStorageService.saveImage(imgId, blob);
        }

        if (layout === 'grid') {
          if (blob) {
            results.push({ blob, angle, index: i });
          }
        } else {
          const cols = 3;
          const col = i % cols;
          const row = Math.floor(i / cols);
          addLayer({
            id: crypto.randomUUID(),
            type: 'image',
            x: selectedLayer.x + col * (selectedLayer.width + 20),
            y: selectedLayer.y + selectedLayer.height + 60 + row * (selectedLayer.height + 20),
            width: selectedLayer.width,
            height: selectedLayer.height,
            src: resolvedUrl,
            title: `${selectedLayer.title} - ${angle.label}`,
            createdAt: Date.now(),
            sourceLayerId: selectedLayer.id,
            operationType: '9grid',
          });
        }
      }

      if (layout === 'grid' && results.length > 0) {
        const cols = Math.min(3, results.length);
        const rows = Math.ceil(results.length / cols);

        // 取第一张图的原始尺寸
        const firstBlobUrl = URL.createObjectURL(results[0].blob);
        const firstImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject();
          img.src = firstBlobUrl;
        });
        const cellW = firstImg.naturalWidth;
        const cellH = firstImg.naturalHeight;
        URL.revokeObjectURL(firstBlobUrl);
        const gap = 4;

        const canvas = document.createElement('canvas');
        canvas.width = cols * cellW + (cols - 1) * gap;
        canvas.height = rows * cellH + (rows - 1) * gap;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          for (let i = 0; i < results.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const img = new Image();
            await new Promise<void>((resolve) => {
              img.onload = () => {
                ctx!.drawImage(img, col * (cellW + gap), row * (cellH + gap), cellW, cellH);
                ctx!.fillStyle = 'rgba(0,0,0,0.6)';
                const labelY = row * (cellH + gap) + cellH - 24;
                ctx!.fillRect(col * (cellW + gap), labelY, cellW, 24);
                ctx!.fillStyle = '#ffffff';
                ctx!.font = '12px sans-serif';
                ctx!.textAlign = 'center';
                ctx!.fillText(results[i].angle.label, col * (cellW + gap) + cellW / 2, labelY + 16);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = URL.createObjectURL(results[i].blob);
            });
          }

          const gridDataUrl = canvas.toDataURL('image/png');
          const gridResponse = await fetch(gridDataUrl);
          const gridBlob = await gridResponse.blob();
          const gridImgId = `multi_angle_grid_${Date.now()}`;
          const { imageStorageService: storage } = await import('../../../../services/imageStorageService');
          await storage.saveImage(gridImgId, gridBlob);

          addLayer({
            id: crypto.randomUUID(),
            type: 'image',
            x: selectedLayer.x,
            y: selectedLayer.y + selectedLayer.height + 40,
            width: canvas.width,
            height: canvas.height,
            src: gridDataUrl,
            imageId: gridImgId,
            title: `${selectedLayer.title} - 多角度 (${results.length}种)`,
            createdAt: Date.now(),
            sourceLayerId: selectedLayer.id,
            operationType: '9grid',
          });
        }
      }

      onClose();
    } catch (error: any) {
      console.error('多角度生成失败:', error);
      alert(`多角度生成失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setCurrentAngle('');
    }
  };

  const handleSelectAll = () => {
    setAngles(prev => prev.map(a => ({ ...a, selected: true })));
  };

  const handleDeselectAll = () => {
    setAngles(prev => prev.map(a => ({ ...a, selected: false })));
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">多机位多角度生成</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张图片，然后再使用此功能。
          </p>
          <button onClick={onClose} className="w-full py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--border-primary)]">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">多机位多角度生成</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              基于「{selectedLayer?.title}」生成不同机位和角度的画面
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isProcessing ? (
            <div className="py-12">
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-center text-sm text-[var(--text-muted)] mb-2">
                正在生成... {progress}%
              </p>
              {currentAngle && (
                <p className="text-center text-xs text-[var(--text-tertiary)]">
                  当前: {currentAngle}
                </p>
              )}
              <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--text-secondary)]">
                  选择要生成的机位角度（已选 {selectedCount} 个）
                </p>
                <div className="flex gap-2">
                  <button onClick={handleSelectAll} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">全选</button>
                  <span className="text-xs text-[var(--text-muted)]">|</span>
                  <button onClick={handleDeselectAll} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">取消全选</button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {angles.map((angle) => (
                  <button
                    key={angle.id}
                    onClick={() => toggleAngle(angle.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      angle.selected
                        ? 'border-blue-500 bg-blue-500/10 shadow-sm shadow-blue-500/20'
                        : 'border-[var(--border-primary)] bg-[var(--bg-hover)] hover:border-[var(--border-secondary)]'
                    }`}
                  >
                    <div className="text-sm font-bold text-[var(--text-primary)]">{angle.label}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-1 leading-relaxed line-clamp-2">
                      {angle.description}
                    </div>
                  </button>
                ))}
              </div>

              <div className="border-t border-[var(--border-primary)] pt-4">
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">布局方式</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLayout('grid')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                      layout === 'grid'
                        ? 'bg-blue-600 text-white'
                        : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    合成宫格图
                  </button>
                  <button
                    onClick={() => setLayout('individual')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                      layout === 'individual'
                        ? 'bg-blue-600 text-white'
                        : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    独立图层
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {!isProcessing && (
          <div className="p-6 pt-4 border-t border-[var(--border-primary)] flex justify-between items-center">
            <p className="text-xs text-[var(--text-muted)]">
              将生成 {selectedCount} 张不同角度的画面
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors">
                取消
              </button>
              <button
                onClick={handleGenerate}
                disabled={selectedCount === 0}
                className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                生成 {selectedCount} 个角度
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
