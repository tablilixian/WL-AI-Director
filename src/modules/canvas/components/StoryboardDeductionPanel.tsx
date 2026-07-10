import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { STORYBOARD_FALLBACK_SIZE } from '../../../../config/sizeConfig';

interface StoryboardDeductionPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

type DeductionMode = 'before-after' | 'timeline-5';

const MODE_LABELS: Record<DeductionMode, string> = {
  'before-after': '剧情推演四宫格',
  'timeline-5': '五格时间线',
};

const MODE_DESCRIPTIONS: Record<DeductionMode, string> = {
  'before-after': '生成前1帧 + 当前帧 + 后2帧，以2×2宫格展示剧情推演',
  'timeline-5': '生成前2帧 + 当前帧 + 后2帧，以横向5格时间线展示',
};

export const StoryboardDeductionPanel: React.FC<StoryboardDeductionPanelProps> = ({ selectedLayerId, onClose }) => {
  const [mode, setMode] = useState<DeductionMode>('before-after');
  const [narrativeContext, setNarrativeContext] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleGenerate = async () => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const { imageStorageService } = await import('../../../../services/imageStorageService');
      const results: { prompt: string; url: string; label: string }[] = [];

      if (mode === 'before-after') {
        const contextNote = narrativeContext
          ? `\nNarrative context for consistency: ${narrativeContext}`
          : '';

        setCurrentStep('生成上一帧...');
        const beforeUrl = await canvasModelService.generateImage({
          prompt: `This is the frame that comes IMMEDIATELY BEFORE the reference image in the story. Show what happened right before this scene. Maintain the same characters, setting, lighting, and visual style. The composition should lead naturally INTO the reference frame.${contextNote}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(Math.round(p * 0.33)),
        });
        results.push({ prompt: '前一帧', url: beforeUrl, label: 'Before' });

        setCurrentStep('生成后两帧 (1/2)...');
        const after1Url = await canvasModelService.generateImage({
          prompt: `This is the frame that comes IMMEDIATELY AFTER the reference image in the story. Show what happens next. Maintain the same characters, setting, lighting, and visual style. The composition should follow naturally FROM the reference frame.${contextNote}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(33 + Math.round(p * 0.33)),
        });
        results.push({ prompt: '后一帧 (1)', url: after1Url, label: 'After 1' });

        setCurrentStep('生成后两帧 (2/2)...');
        const after2Url = await canvasModelService.generateImage({
          prompt: `This is the SECOND frame after the reference image. The story has progressed further. Show the continued development from the previous frame. Maintain same characters, setting, lighting, and visual style.${contextNote}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(66 + Math.round(p * 0.34)),
        });
        results.push({ prompt: '后一帧 (2)', url: after2Url, label: 'After 2' });
      } else {
        const contextNote = narrativeContext
          ? `\nNarrative context for consistency: ${narrativeContext}`
          : '';

        setCurrentStep('生成前两帧 (2/2)...');
        const before2Url = await canvasModelService.generateImage({
          prompt: `This is the frame that happens TWO STEPS BEFORE the reference image in the story. Show earlier events. Maintain characters, setting, lighting, and visual style.${contextNote}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(Math.round(p * 0.20)),
        });
        results.push({ prompt: '前两帧', url: before2Url, label: '-2' });

        setCurrentStep('生成前两帧 (1/2)...');
        const before1Url = await canvasModelService.generateImage({
          prompt: `This is the frame that comes ONE STEP BEFORE the reference image. Show what happened right before. Composition leads into the reference. Maintain same characters, setting, lighting, and visual style.${contextNote}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(20 + Math.round(p * 0.20)),
        });
        results.push({ prompt: '前一帧', url: before1Url, label: '-1' });

        setCurrentStep('生成后两帧 (1/2)...');
        const after1Url = await canvasModelService.generateImage({
          prompt: `This is the frame that comes ONE STEP AFTER the reference image. Show what happens next. Composition follows from the reference. Maintain same characters, setting, lighting, and visual style.${contextNote}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(40 + Math.round(p * 0.20)),
        });
        results.push({ prompt: '后一帧 (1)', url: after1Url, label: '+1' });

        setCurrentStep('生成后两帧 (2/2)...');
        const after2Url = await canvasModelService.generateImage({
          prompt: `This is the frame that happens TWO STEPS AFTER the reference image. Story has progressed further. Show continued development. Maintain same characters, setting, lighting, and visual style.${contextNote}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(60 + Math.round(p * 0.20)),
        });
        results.push({ prompt: '后两帧', url: after2Url, label: '+2' });

        setCurrentStep('生成当前帧（参考图增强）...');
        const currentUrl = await canvasModelService.generateImage({
          prompt: `The key reference frame of the story. Maintain the exact same scene, characters, lighting, and composition as the reference. Enhance quality and details.${contextNote}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(80 + Math.round(p * 0.20)),
        });
        results.push({ prompt: '当前帧', url: currentUrl, label: '0' });
      }

      const panelCount = mode === 'before-after' ? 3 : 5;
      const cols = mode === 'before-after' ? 2 : 5;
      const rows = mode === 'before-after' ? 2 : 1;
      const gap = 4;
      const labelH = 24;

      const allItems = mode === 'before-after'
        ? [
            { blob: null, label: '前一帧' },
            { blob: null, label: '当前帧 (参考)' },
            { blob: null, label: '后一帧 (1)' },
            { blob: null, label: '后一帧 (2)' },
          ]
        : [
            { blob: null, label: '前两帧' },
            { blob: null, label: '前一帧' },
            { blob: null, label: '当前帧' },
            { blob: null, label: '后一帧 (1)' },
            { blob: null, label: '后一帧 (2)' },
          ];

      const allUrls = mode === 'before-after'
        ? [results[0].url, selectedLayer.src, results[1].url, results[2].url]
        : [results[0].url, results[1].url, results[3].url, results[4].url, selectedLayer.src];

      const allLabels = allItems.map((item, i) => ({
        label: item.label,
        url: allUrls[i],
      }));

      // 解析 local: URL 为可显示的 blob URL
      const { unifiedImageService } = await import('../../../../services/unifiedImageService');
      const resolvedLabels = await Promise.all(allLabels.map(async (item) => ({
        ...item,
        url: await unifiedImageService.resolveForDisplay(item.url),
      })));

      // 用第一张图原始尺寸确定宫格大小
      const firstLoaded = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: STORYBOARD_FALLBACK_SIZE.width, h: STORYBOARD_FALLBACK_SIZE.height });
        img.src = resolvedLabels[0].url;
      });
      const cellW = firstLoaded.w;
      const cellH = firstLoaded.h;

      const canvas = document.createElement('canvas');
      canvas.width = cols * cellW + (cols - 1) * gap;
      canvas.height = rows * cellH + (rows - 1) * gap + (mode === 'before-after' ? 0 : labelH);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }

      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < resolvedLabels.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            ctx!.drawImage(img, col * (cellW + gap), row * (cellH + gap), cellW, cellH);
            ctx!.fillStyle = 'rgba(0,0,0,0.65)';
            const ly = row * (cellH + gap) + cellH - labelH;
            ctx!.fillRect(col * (cellW + gap), ly, cellW, labelH);
            ctx!.fillStyle = '#ffffff';
            ctx!.font = '11px sans-serif';
            ctx!.textAlign = 'center';
            ctx!.fillText(resolvedLabels[i].label, col * (cellW + gap) + cellW / 2, ly + 16);
            resolve();
          };
          img.onerror = () => {
            console.warn('[StoryboardDeduction] 图片加载失败:', resolvedLabels[i].url);
            resolve();
          };
          img.src = resolvedLabels[i].url;
        });
      }

      const gridDataUrl = canvas.toDataURL('image/png');
      const gridBlob = await fetch(gridDataUrl).then(r => r.blob());
      const gridImgId = `deduction_${Date.now()}`;
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
        title: `${selectedLayer.title} - ${MODE_LABELS[mode]}`,
        createdAt: Date.now(),
        sourceLayerId: selectedLayer.id,
        operationType: '4grid',
      });

      onClose();
    } catch (error: any) {
      console.error('剧情推演失败:', error);
      alert(`剧情推演失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setCurrentStep('');
    }
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">剧情推演</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">请先选中一张关键帧图片，然后再使用此功能。</p>
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
            <h3 className="text-lg font-bold text-[var(--text-primary)]">剧情推演</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              基于「{selectedLayer?.title}」推演前后剧情帧
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
              <p className="text-center text-sm text-[var(--text-muted)] mb-2">生成中... {progress}%</p>
              {currentStep && <p className="text-center text-xs text-[var(--text-tertiary)]">{currentStep}</p>}
              <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">推演模式</label>
                <div className="flex gap-2">
                  {(Object.entries(MODE_LABELS) as [DeductionMode, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setMode(key as DeductionMode)}
                      className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                        mode === key
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-[var(--border-primary)] bg-[var(--bg-hover)] hover:border-[var(--border-secondary)]'
                      }`}
                    >
                      <div className="text-sm font-bold text-[var(--text-primary)]">{label}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{MODE_DESCRIPTIONS[key]}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                  剧情描述 <span className="text-[var(--text-muted)] font-normal">（可选，有助于保持叙事连贯性）</span>
                </label>
                <textarea
                  value={narrativeContext}
                  onChange={(e) => setNarrativeContext(e.target.value)}
                  placeholder={`例如：主角在森林中发现了一扇发光的门，正在犹豫是否推开...`}
                  className="w-full h-20 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none focus:border-amber-500 outline-none"
                />
              </div>

              <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-primary)]">
                <p>AI 会基于当前帧的构图、角色位置和光影，推演前后帧的画面内容。提供剧情描述可帮助 AI 更好地理解故事走向。</p>
              </div>
            </>
          )}
        </div>

        {!isProcessing && (
          <div className="p-6 pt-4 border-t border-[var(--border-primary)] flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors">
              取消
            </button>
            <button
              onClick={handleGenerate}
              className="px-5 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
            >
              开始推演
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
