import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface InpaintPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

export const InpaintPanel: React.FC<InpaintPanelProps> = ({ selectedLayerId, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [brushSize, setBrushSize] = useState(30);
  const [prompt, setPrompt] = useState('');
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imgNaturalSize, setImgNaturalSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isDrawingRef = useRef(false);
  const brushSizeRef = useRef(30);
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    if (!selectedLayer || selectedLayer.type !== 'image') return;
    (async () => {
      const { unifiedImageService } = await import('../../../../services/unifiedImageService');
      const url = await unifiedImageService.resolveForDisplay(selectedLayer.src);
      setImageSrc(url);
    })();
  }, [selectedLayer]);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const rect = img.getBoundingClientRect();
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
  }, []);

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    syncCanvasSize();
  }, [syncCanvasSize]);

  useEffect(() => {
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  const getCanvasPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const paintAt = useCallback((pos: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const radius = (brushSizeRef.current / 2) * (canvas.width / canvas.offsetWidth);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff00';
    ctx.fill();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isDrawingRef.current = true;
    paintAt(getCanvasPos(e));
  }, [getCanvasPos, paintAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    paintAt(getCanvasPos(e));
  }, [getCanvasPos, paintAt]);

  const handleMouseUp = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleInpaint = async () => {
    if (!selectedLayer || isProcessing || !prompt.trim()) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const drawCanvas = canvasRef.current;
      const img = imageRef.current;

      let compositedImageUrl = selectedLayer.src;

      if (drawCanvas && img && imgNaturalSize.width > 0) {
        const { unifiedImageService } = await import('../../../../services/unifiedImageService');
        const { imageStorageService, generateImageId } = await import('../../../../services/imageStorageService');
        const fullResUrl = await unifiedImageService.resolveForDisplay(selectedLayer.src);

        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = imgNaturalSize.width;
        compositeCanvas.height = imgNaturalSize.height;
        const compositeCtx = compositeCanvas.getContext('2d');
        if (compositeCtx) {
          const fullResImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const imgEl = new Image();
            imgEl.crossOrigin = 'anonymous';
            imgEl.onload = () => resolve(imgEl);
            imgEl.onerror = () => reject(new Error('图片加载失败'));
            imgEl.src = fullResUrl;
          });
          compositeCtx.drawImage(fullResImg, 0, 0);
          compositeCtx.drawImage(drawCanvas, 0, 0, drawCanvas.width, drawCanvas.height, 0, 0, compositeCanvas.width, compositeCanvas.height);

          let blob = await new Promise<Blob>(resolve => compositeCanvas.toBlob(b => resolve(b!), 'image/png'));
          if (blob.size > 9 * 1024 * 1024) {
            blob = await new Promise<Blob>(resolve => compositeCanvas.toBlob(b => resolve(b!), 'image/jpeg', 0.9));
          }
          const localId = generateImageId();
          await imageStorageService.saveImage(localId, blob);
          compositedImageUrl = `local:${localId}`;
        }
      }

      const resultUrl = await canvasModelService.inpaint(
        compositedImageUrl,
        prompt,
        (p) => setProgress(p),
      );

      const { imageStorageService } = await import('../../../../services/imageStorageService');
      let resolvedUrl = resultUrl;
      let imageId: string | undefined;

      if (resultUrl.startsWith('local:')) {
        const localId = resultUrl.replace('local:', '');
        imageId = localId;
        const blob = await imageStorageService.getImage(localId);
        if (blob) {
          resolvedUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
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
        title: `${selectedLayer.title} - 重绘`,
        isLoading: false,
        createdAt: Date.now(),
        sourceLayerId: selectedLayer.id,
        operationType: 'inpaint',
      });

      onClose();
    } catch (error: any) {
      console.error('局部重绘失败:', error);
      alert(`局部重绘失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!selectedLayer || selectedLayer.type !== 'image') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">局部重绘</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张图片，然后再使用局部重绘功能。
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
      <div
        className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">局部重绘</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-[var(--text-muted)] mb-4">
          用画笔标记要修改的区域，然后输入提示词描述期望的效果。
        </p>

        <div
          className="relative bg-gray-900 rounded-lg overflow-hidden mb-4 select-none"
          style={{ maxHeight: '420px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {imageSrc ? (
            <>
              <img
                ref={imageRef}
                src={imageSrc}
                alt="待修复图片"
                className="w-full h-auto max-h-[420px] object-contain cursor-crosshair"
                onLoad={handleImageLoad}
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 cursor-crosshair"
                style={{ pointerEvents: 'none' }}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span>笔刷大小: {brushSize}px</span>
            <input
              type="range"
              min={5}
              max={100}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
          </label>
          <div className="flex gap-2 mt-2">
            <button
              onClick={clearMask}
              className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
            >
              清除涂抹
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-sm text-[var(--text-secondary)] block mb-1">
            提示词<span className="text-red-400 ml-0.5">*</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：把衣服改成红色，添加一朵花..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
            rows={3}
          />
        </div>

        {isProcessing && (
          <div className="mb-4">
            <div className="flex items-center justify-center mb-1">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-center text-sm text-[var(--text-muted)] mb-1">
              正在进行局部重绘... {progress}%
            </p>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleInpaint}
            disabled={isProcessing || !prompt.trim()}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? '处理中...' : '开始重绘'}
          </button>
        </div>
      </div>
    </div>
  );
};
