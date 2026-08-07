import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { logger, LogCategory } from '../../../../services/logger.ts';

interface LightingControlPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

interface LightingPreset {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: 'front',
    label: '正面光',
    description: '光线从正面均匀照射，消除阴影，细节清晰',
    prompt:
      'Apply front/flat lighting. Evenly lit from the camera direction, minimal shadows, all details clearly visible. Bright and clean look.',
  },
  {
    id: 'side',
    label: '侧光',
    description: '光线从一侧照射，产生强烈明暗对比，戏剧感强',
    prompt:
      'Apply side/split lighting. Strong light from one side creating deep shadows on the opposite side. High contrast, dramatic mood, cinematic chiaroscuro effect.',
  },
  {
    id: 'rim',
    label: '逆光',
    description: '光线从背后照射，勾勒主体轮廓，氛围感强',
    prompt:
      'Apply backlighting/rim lighting. Light source behind the subject creating bright edge highlights and silhouette effect. Atmospheric, dreamy, cinematic rim light.',
  },
  {
    id: 'top',
    label: '顶光',
    description: '光线从正上方照射，突出顶部结构，神秘感',
    prompt:
      'Apply top lighting. Light source directly above the subject. Shadows fall downward, emphasizing top contours and creating a mysterious or dramatic atmosphere.',
  },
  {
    id: 'bottom',
    label: '底光',
    description: '光线从下方照射，颠覆常规光影，诡异/庄重',
    prompt:
      'Apply bottom/under lighting. Light source below the subject casting shadows upward. Unnatural, dramatic effect often used in horror or to create a solemn monumental feel.',
  },
  {
    id: 'rembrandt',
    label: '伦勃朗光',
    description: '经典肖像布光，脸颊形成三角光区，艺术感',
    prompt:
      'Apply Rembrandt lighting. Classic portrait lighting with a triangle of light on the shadow side cheek. 45-degree key light, subtle fill. Rich shadows, volumetric, painterly quality.',
  },
  {
    id: 'butterfly',
    label: '蝴蝶光',
    description: '蝴蝶光从上前方照射，鼻下形成蝶形阴影，柔美',
    prompt:
      'Apply butterfly/paramount lighting. Key light placed high and directly in front, creating a butterfly-shaped shadow under the nose. Glamorous, flattering, soft shadows.',
  },
  {
    id: 'edge',
    label: '轮廓光',
    description: '侧逆光勾勒主体边缘，强调轮廓线条',
    prompt:
      'Apply edge/rim lighting. Strong light from behind and slightly to the side, creating bright edge outlines on the subject. Separates subject from background, emphasizes silhouette.',
  },
];

export const LightingControlPanel: React.FC<LightingControlPanelProps> = ({
  selectedLayerId,
  onClose,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(70);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find((l) => l.id === selectedLayerId) : null;
  const hasSelectedImage =
    selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleGenerate = async () => {
    if (!hasSelectedImage || !selectedLayer || isProcessing || !selectedPreset) return;

    const preset = LIGHTING_PRESETS.find((p) => p.id === selectedPreset);
    if (!preset) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const intensityNote =
        intensity < 40
          ? ' Subtle lighting effect, preserve most of the original lighting.'
          : intensity > 80
            ? ' Strong dramatic lighting effect, emphasize the light source.'
            : ' Balanced lighting adjustment, blend naturally with the original scene.';

      const prompt = `Relight this image with the following lighting setup: ${preset.prompt}${intensityNote} Maintain the same subject, pose, composition, and colors. High quality, cinematic lighting, photorealistic.`;

      const imageUrl = await canvasModelService.generateImage({
        prompt,
        referenceImages: [selectedLayer.src],
        aspectRatio: '16:9',
        onProgress: (p) => setProgress(p),
      });

      let resolvedUrl = imageUrl;
      let imageId: string | undefined;

      const { imageStorageService } = await import('../../../../services/imageStorageService');

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
        const imgId = `lighting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        await imageStorageService.saveImage(imgId, blob);
        imageId = imgId;
      }

      addLayer({
        id: crypto.randomUUID(),
        type: 'image',
        x: selectedLayer.x + selectedLayer.width + 20,
        y: selectedLayer.y,
        width: selectedLayer.width,
        height: selectedLayer.height,
        src: resolvedUrl,
        imageId,
        title: `${selectedLayer.title} - ${preset.label}`,
        createdAt: Date.now(),
        sourceLayerId: selectedLayer.id,
        operationType: 'lighting',
      });

      onClose();
    } catch (error: any) {
      logger.error(LogCategory.CANVAS, '光影校正失败:', error);
      alert(`光影校正失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">电影级光影校正</h3>
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
      <div className="bg-[var(--bg-primary)] rounded-xl max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--border-primary)]">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">电影级光影校正</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              为「{selectedLayer?.title}」选择布光方案
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
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

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isProcessing ? (
            <div className="py-12">
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-center text-sm text-[var(--text-muted)] mb-2">
                正在应用光影效果... {progress}%
              </p>
              <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {LIGHTING_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      selectedPreset === preset.id
                        ? 'border-yellow-500 bg-yellow-500/10 shadow-sm shadow-yellow-500/20'
                        : 'border-[var(--border-primary)] bg-[var(--bg-hover)] hover:border-[var(--border-secondary)]'
                    }`}
                  >
                    <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 opacity-80" />
                    <div className="text-xs font-bold text-[var(--text-primary)]">
                      {preset.label}
                    </div>
                    <div className="text-[9px] text-[var(--text-tertiary)] mt-1 leading-tight line-clamp-2">
                      {preset.description}
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  效果强度: {intensity}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={intensity}
                  onChange={(e) => setIntensity(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>轻微</span>
                  <span>强烈</span>
                </div>
              </div>

              <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-primary)]">
                <p>
                  选择一种布光方案，AI
                  将保持主体和构图不变，重新绘制光影效果。结果将作为新图层放置在原图右侧，方便对比。
                </p>
              </div>
            </>
          )}
        </div>

        {!isProcessing && (
          <div className="p-6 pt-4 border-t border-[var(--border-primary)] flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleGenerate}
              disabled={!selectedPreset}
              className="px-5 py-2 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              应用光影
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
