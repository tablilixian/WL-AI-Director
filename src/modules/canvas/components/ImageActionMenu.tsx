import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Grid3x3, Scissors, Palette, ImagePlus, Maximize2, Copy, ChevronDown, X, Download } from 'lucide-react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { StyleTransferPanel } from './StyleTransferPanel';
import { ImageEditPanel } from './ImageEditPanel';
import { RemoveBackgroundPanel } from './RemoveBackgroundPanel';
import { VariantPanel } from './VariantPanel';
import { GridSplitPanel } from './GridSplitPanel';
import type { LayerData, GridGenerationType } from '../types/canvas';

export type ImageAction =
  | 'remove-bg'
  | 'style-transfer'
  | 'background-replace'
  | 'expand'
  | 'variant'
  | '9grid'
  | '4grid'
  | '25grid'
  | 'split-9grid'
  | 'split-4grid'
  | 'split-25grid';

interface ImageActionMenuProps {
  layer: LayerData;
  screenRect: { top: number; left: number; width: number; height: number };
}

const GRID_LABELS: Record<GridGenerationType, string> = {
  '9grid': '多机位九宫格',
  '4grid': '剧情推演四宫格',
  '25grid': '25宫格连贯分镜',
};

export const ImageActionMenu: React.FC<ImageActionMenuProps> = ({ layer, screenRect }) => {
  const [showGridDropdown, setShowGridDropdown] = useState(false);
  const [showSplitDropdown, setShowSplitDropdown] = useState(false);
  const [activePanel, setActivePanel] = useState<ImageAction | null>(null);
  const [showGridDialog, setShowGridDialog] = useState(false);
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const [gridType, setGridType] = useState<GridGenerationType | null>(null);
  const [splitGridType, setSplitGridType] = useState<GridGenerationType | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const splitDropdownRef = useRef<HTMLDivElement>(null);
  const { addLayer } = useCanvasStore();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowGridDropdown(false);
      }
      if (splitDropdownRef.current && !splitDropdownRef.current.contains(e.target as Node)) {
        setShowSplitDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

  const handleAction = (action: ImageAction) => {
    setShowGridDropdown(false);
    setShowSplitDropdown(false);
    if (action === '9grid' || action === '4grid' || action === '25grid') {
      setGridType(action);
      setShowGridDialog(true);
    } else if (action === 'split-9grid' || action === 'split-4grid' || action === 'split-25grid') {
      const gt = action === 'split-9grid' ? '9grid' : action === 'split-4grid' ? '4grid' : '25grid';
      setSplitGridType(gt);
      setShowSplitPanel(true);
    } else {
      setActivePanel(action);
    }
  };

  const handleClosePanel = () => {
    setActivePanel(null);
  };

  const handleCloseGridDialog = () => {
    setShowGridDialog(false);
    setGridType(null);
  };

  const actions = [
    { id: 'remove-bg' as ImageAction, icon: Scissors, label: '智能抠图' },
    { id: 'style-transfer' as ImageAction, icon: Palette, label: '风格切换' },
    { id: 'background-replace' as ImageAction, icon: ImagePlus, label: '背景替换' },
    { id: 'expand' as ImageAction, icon: Maximize2, label: '图片扩展' },
    { id: 'variant' as ImageAction, icon: Copy, label: '变体生成' },
  ];

  const gridOptions: { id: ImageAction; label: string }[] = [
    { id: '9grid', label: '多机位九宫格' },
    { id: '4grid', label: '剧情推演四宫格' },
    { id: '25grid', label: '25宫格连贯分镜' },
  ];

  const splitOptions: { id: ImageAction; label: string }[] = [
    { id: 'split-9grid', label: '九宫格切分' },
    { id: 'split-4grid', label: '四宫格切分' },
    { id: 'split-25grid', label: '25宫格切分' },
  ];

  const menu = (
    <div
      className="fixed z-[200] pointer-events-none"
      style={{
        left: screenRect.left + screenRect.width / 2,
        bottom: window.innerHeight - (screenRect.top - 10),
        transform: 'translateX(-50%)',
      }}
    >
      <div className="flex items-center gap-0.5 bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-700 shadow-xl pointer-events-auto px-1.5 py-1">
        {actions.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={(e) => { e.stopPropagation(); handleAction(action.id); }}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-700 rounded text-gray-200 hover:text-white transition-colors text-xs font-medium whitespace-nowrap"
            >
              <Icon className="w-3.5 h-3.5" />
              {action.label}
            </button>
          );
        })}

        <div className="w-px h-5 bg-gray-600 mx-1" />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowGridDropdown(!showGridDropdown); }}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-700 rounded text-gray-200 hover:text-white transition-colors text-xs font-medium"
          >
            <Grid3x3 className="w-3.5 h-3.5" />
            九宫格
            <ChevronDown className={`w-3 h-3 transition-transform ${showGridDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showGridDropdown && (
            <div className="absolute top-full left-0 mt-1.5 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px] z-50">
              {gridOptions.map(option => (
                <button
                  key={option.id}
                  onClick={(e) => { e.stopPropagation(); handleAction(option.id); }}
                  className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
                >
                  <Grid3x3 className="w-3.5 h-3.5" />
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={splitDropdownRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSplitDropdown(!showSplitDropdown); }}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-700 rounded text-gray-200 hover:text-white transition-colors text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            宫格切分
            <ChevronDown className={`w-3 h-3 transition-transform ${showSplitDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showSplitDropdown && (
            <div className="absolute top-full left-0 mt-1.5 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px] z-50">
              {splitOptions.map(option => (
                <button
                  key={option.id}
                  onClick={(e) => { e.stopPropagation(); handleAction(option.id); }}
                  className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
                >
                  <Grid3x3 className="w-3.5 h-3.5" />
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(menu, document.body)}

      {/* Panel Modals */}
      {activePanel && createPortal(
        <>
          {activePanel === 'style-transfer' && (
            <StyleTransferPanel selectedLayerId={layer.id} onClose={handleClosePanel} />
          )}
          {activePanel === 'background-replace' && (
            <ImageEditPanel selectedLayerId={layer.id} editMode="background" onClose={handleClosePanel} />
          )}
          {activePanel === 'expand' && (
            <ImageEditPanel selectedLayerId={layer.id} editMode="expand" onClose={handleClosePanel} />
          )}
          {activePanel === 'remove-bg' && (
            <RemoveBackgroundPanel selectedLayerId={layer.id} onClose={handleClosePanel} />
          )}
          {activePanel === 'variant' && (
            <VariantPanel selectedLayerId={layer.id} onClose={handleClosePanel} />
          )}
        </>,
        document.body
      )}

      {/* Grid Generation Dialog */}
      {showGridDialog && gridType && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={handleCloseGridDialog}
        >
          <div
            className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl max-w-lg w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-14 px-6 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0 rounded-t-xl">
              <div className="flex items-center gap-3">
                <Grid3x3 className="w-4 h-4 text-[var(--accent-text)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {GRID_LABELS[gridType]}
                </h3>
              </div>
              <button
                onClick={handleCloseGridDialog}
                className="p-2 hover:bg-[var(--error-hover-bg)] rounded text-[var(--text-tertiary)] hover:text-[var(--error-text)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[var(--text-tertiary)]">
                基于当前选中图片「{layer.title}」生成{GRID_LABELS[gridType]}。
              </p>
              <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-primary)]">
                <p className="mb-1 font-bold text-[var(--text-secondary)]">当前图片信息</p>
                <p>尺寸: {Math.round(layer.width)} × {Math.round(layer.height)}px</p>
                <p>位置: ({Math.round(layer.x)}, {Math.round(layer.y)})</p>
                {gridType === '9grid' && <p>生成模式: 多机位分镜 (3×3)</p>}
                {gridType === '4grid' && <p>生成模式: 剧情推演 (2×2)</p>}
                {gridType === '25grid' && <p>生成模式: 连贯分镜 (5×5)</p>}
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
                <button
                  onClick={handleCloseGridDialog}
                  className="px-3 py-2 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const panelCount = gridType === '9grid' ? 9 : gridType === '4grid' ? 4 : 25;
                    const panels = Array.from({ length: panelCount }, (_, i) => ({
                      index: i,
                      shotSize: '中景',
                      cameraAngle: '平视',
                      description: `${GRID_LABELS[gridType]} - 分镜 ${i + 1}`,
                    }));
                    const newLayerId = crypto.randomUUID();
                    addLayer({
                      id: newLayerId,
                      type: 'image',
                      x: layer.x,
                      y: layer.y + layer.height + 40,
                      width: layer.width,
                      height: layer.height,
                      src: layer.src,
                      title: GRID_LABELS[gridType],
                      createdAt: Date.now(),
                      sourceLayerId: layer.id,
                      operationType: gridType,
                      gridData: { type: gridType, panels },
                    });
                    handleCloseGridDialog();
                  }}
                  className="px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-lg shadow-[var(--btn-primary-shadow)]"
                >
                  生成{gridType === '9grid' ? '九宫格' : gridType === '4grid' ? '四宫格' : '25宫格'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSplitPanel && splitGridType && (
        <GridSplitPanel
          selectedLayerId={layer.id}
          gridType={splitGridType}
          onClose={() => { setShowSplitPanel(false); setSplitGridType(null); }}
        />
      )}
    </>
  );
};
