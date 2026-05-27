import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Grid3x3, X, Download, Cpu, Zap } from 'lucide-react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { generateSpliteGridImage } from '@/services/aiService';
import { imageStorageService, generateImageId } from '@/services/imageStorageService';
import type { GridGenerationType } from '../types/canvas';

interface GridSplitPanelProps {
  selectedLayerId: string | null;
  gridType: GridGenerationType;
  onClose: () => void;
}

type SplitMode = 'fast' | 'ai';

const GRID_CONFIG: Record<GridGenerationType, { cols: number; rows: number; label: string }> = {
  '9grid': { cols: 3, rows: 3, label: '九宫格' },
  '4grid': { cols: 2, rows: 2, label: '四宫格' },
  '25grid': { cols: 5, rows: 5, label: '25宫格' },
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('无效的图片数据格式');
  const mimeType = matches[1];
  const binary = atob(matches[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
};

export const GridSplitPanel: React.FC<GridSplitPanelProps> = ({ selectedLayerId, gridType, onClose }) => {
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 });
  const [splitMode, setSplitMode] = useState<SplitMode>('fast');
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { layers, addLayer } = useCanvasStore();

  const config = GRID_CONFIG[gridType];
  const totalCells = config.cols * config.rows;
  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;

  const toggleCell = (index: number) => {
    setSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addCellLayer = (
    src: string,
    cellIndex: number,
    col: number,
    row: number,
    displayCellW: number,
    displayCellH: number,
    order: number
  ) => {
    addLayer({
      id: crypto.randomUUID(),
      type: 'image',
      x: selectedLayer!.x + col * displayCellW,
      y: selectedLayer!.y + selectedLayer!.height + 40 + order * (displayCellH + 8),
      width: displayCellW,
      height: displayCellH,
      src,
      title: `${selectedLayer!.title || '图片'} - 分镜 ${cellIndex + 1}`,
      createdAt: Date.now(),
      sourceLayerId: selectedLayer!.id,
      operationType: gridType,
    });
  };

  const extractCellsFast = async (indices: number[]) => {
    const img = imgRef.current;
    if (!img) throw new Error('图片未加载');

    const cellW = imgNaturalSize.w / config.cols;
    const cellH = imgNaturalSize.h / config.rows;
    const displayCellW = selectedLayer!.width / config.cols;
    const displayCellH = selectedLayer!.height / config.rows;

    for (let i = 0; i < indices.length; i++) {
      const cellIndex = indices[i];
      const col = cellIndex % config.cols;
      const row = Math.floor(cellIndex / config.cols);

      const canvas = document.createElement('canvas');
      canvas.width = cellW;
      canvas.height = cellH;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.drawImage(
        img,
        col * cellW, row * cellH, cellW, cellH,
        0, 0, cellW, cellH
      );

      addCellLayer(canvas.toDataURL('image/png'), cellIndex, col, row, displayCellW, displayCellH, i);
    }
  };

  const extractCellsAi = async (indices: number[]) => {
    const src = selectedLayer!.src;
    if (!src) throw new Error('图层无图片数据');

    // 确保图片已保存到 IndexedDB（如果是 data URL 则先保存）
    let imageRef = src;
    if (src.startsWith('data:')) {
      const blob = dataUrlToBlob(src);
      const id = generateImageId();
      await imageStorageService.saveImage(id, blob);
      imageRef = `local:${id}`;
    }

    // 调用 API 分割（只下载用户选中的格子）
    const localUrls = await generateSpliteGridImage(
      imageRef,
      config.rows,
      config.cols,
      Math.round(imgNaturalSize.w / config.cols),
      Math.round(imgNaturalSize.h / config.rows),
      undefined,
      undefined,
      indices,
    );

    const displayCellW = selectedLayer!.width / config.cols;
    const displayCellH = selectedLayer!.height / config.rows;

    for (let i = 0; i < indices.length; i++) {
      const cellIndex = indices[i];
      const localUrl = localUrls[cellIndex];
      if (!localUrl) continue;

      // 从 IndexedDB 读取并转 base64
      const localId = localUrl.replace('local:', '');
      const blob = await imageStorageService.getImage(localId);
      if (!blob) continue;

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const col = cellIndex % config.cols;
      const row = Math.floor(cellIndex / config.cols);
      addCellLayer(dataUrl, cellIndex, col, row, displayCellW, displayCellH, i);
    }
  };

  const extractCells = async (indices: number[]) => {
    if (!selectedLayer || isProcessing) return;
    setIsProcessing(true);

    try {
      if (splitMode === 'fast') {
        await extractCellsFast(indices);
      } else {
        await extractCellsAi(indices);
      }
      onClose();
    } catch (error: any) {
      console.error('提取宫格失败:', error);
      alert(`提取失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExtractSelected = () => {
    if (selectedCells.size === 0) return;
    extractCells([...selectedCells].sort((a, b) => a - b));
  };

  const handleExtractAll = () => {
    extractCells(Array.from({ length: totalCells }, (_, i) => i));
  };

  if (!selectedLayer) {
    return createPortal(
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <p className="text-sm text-[var(--text-muted)]">请先选中一张图片</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-lg text-xs font-bold">关闭</button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl shadow-2xl flex flex-col"
        style={{ width: 'min(90vw, 800px)', height: 'min(90vh, 700px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0 rounded-t-xl">
          <div className="flex items-center gap-3">
            <Grid3x3 className="w-4 h-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {config.label}切分
            </h3>
            <div className="flex items-center gap-1 ml-4 bg-[var(--bg-base)] rounded-lg p-0.5 border border-[var(--border-secondary)]">
              <button
                onClick={() => setSplitMode('fast')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                  splitMode === 'fast'
                    ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Zap className="w-3 h-3" />
                快速切分
              </button>
              <button
                onClick={() => setSplitMode('ai')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                  splitMode === 'ai'
                    ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Cpu className="w-3 h-3" />
                AI高清切分
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--error-hover-bg)] rounded text-[var(--text-tertiary)] hover:text-[var(--error-text)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image + Grid Area */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-[var(--bg-base)]">
          <div ref={containerRef} className="relative inline-block">
            <img
              ref={imgRef}
              src={selectedLayer.src}
              alt={selectedLayer.title}
              className="max-w-full max-h-[400px] object-contain rounded"
              style={{ display: 'block' }}
              onLoad={(e) => {
                const img = e.currentTarget;
                setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                setImageLoaded(true);
              }}
            />
            {imageLoaded && (
              <div className="absolute inset-0 grid cursor-pointer" style={{
                gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
                gridTemplateRows: `repeat(${config.rows}, 1fr)`,
              }}>
                {Array.from({ length: totalCells }, (_, i) => {
                  const isSelected = selectedCells.has(i);
                  return (
                    <div
                      key={i}
                      onClick={() => toggleCell(i)}
                      className={`
                        border border-dashed transition-colors relative
                        ${isSelected
                          ? 'bg-blue-500/30 border-blue-400'
                          : 'border-white/30 hover:border-white/60 hover:bg-white/10'
                        }
                      `}
                    >
                      {isSelected && (
                        <div className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center shadow">
                          {i + 1}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-primary)] flex items-center justify-between shrink-0">
          <div className="text-xs text-[var(--text-tertiary)]">
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-[var(--text-tertiary)]/30 border-t-[var(--text-tertiary)] rounded-full animate-spin" />
                {splitMode === 'ai' ? '正在通过 AI 服务分割图片...' : '正在提取宫格...'}
              </span>
            ) : (
              imageLoaded
                ? `原图 ${imgNaturalSize.w} × ${imgNaturalSize.h}px · ${config.cols}×${config.rows} 共 ${totalCells} 格 · 已选 ${selectedCells.size} 格`
                : '加载图片中...'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExtractSelected}
              disabled={selectedCells.size === 0 || isProcessing}
              className="px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--btn-primary-text)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-lg shadow-[var(--btn-primary-shadow)]"
            >
              {isProcessing ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              提取选中 ({selectedCells.size})
            </button>
            <button
              onClick={handleExtractAll}
              disabled={isProcessing}
              className="px-4 py-2 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--text-secondary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
            >
              全部提取
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
