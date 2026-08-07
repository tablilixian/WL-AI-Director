/**
 * Canvas Layer Component
 * 渲染单个图层，支持拖拽、缩放、选中状态
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LayerData, PromptLayerData } from '../types/canvas';
import { useCanvasStore } from '../hooks/useCanvasState';
import { useSnapAlignment } from '../hooks/useSnapAlignment';
import { ResizeHandle } from './ResizeHandle';
import { PromptLayer } from './PromptLayer';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { ResolvedImage } from './ResolvedImage';
import { Film, Orbit, Sparkles } from 'lucide-react';
import { PanoramaViewer } from './PanoramaViewer';
import { InlinePanoramaViewer } from './InlinePanoramaViewer';
import { isLikelyPanoramaImage } from '../utils/panoramaUtils';

interface CanvasLayerProps {
  layer: LayerData;
  isSelected: boolean;
  onPromptLinkRequest?: (layerId: string, x: number, y: number) => void;
  onContextMenuRequest?: (layerId: string, x: number, y: number) => void;
  onConnectionStart?: (layerId: string, clientX: number, clientY: number) => void;
  onClick?: (layerId: string) => void;
}

/**
 * 解析图片 URL 为显示用 URL（blob: 或 data:）
 *
 * @deprecated 使用 unifiedImageService.resolveForDisplay() 代替
 */
async function resolveImageSrc(src: string): Promise<string> {
  return await unifiedImageService.resolveForDisplay(src);
}

export const CanvasLayer: React.FC<CanvasLayerProps> = ({
  layer,
  isSelected,

  onContextMenuRequest,
  onConnectionStart,
  onClick,
}) => {
  const { selectLayer, updateLayer, layers } = useCanvasStore();
  const { calculateSnap } = useSnapAlignment();
  const layerRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(layer.title);
  const [editingText, setEditingText] = useState<string | null>(null);
  const skipTextBlurRef = useRef(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [isZoomed, setIsZoomed] = useState(false);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const [showPanorama, setShowPanorama] = useState(false);
  const [inline3d, setInline3d] = useState(
    layer.type === 'panorama' ? (layer as any).displayMode === '3d' : false,
  );
  const [isProbablyPanorama, setIsProbablyPanorama] = useState(false);
  const imgNaturalRef = useRef({ w: 0, h: 0 });

  const dragStartRef = useRef({
    x: 0,
    y: 0,
    layerX: 0,
    layerY: 0,
    childPositions: [] as { id: string; x: number; y: number }[],
  });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const dragMovedRef = useRef(false);

  // 交互/可编辑元素按下时不启动图层拖拽，保证文本选择、按钮点击等功能不被拖拽打断
  const isInteractiveTarget = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest('textarea, input, button, select, a, [contenteditable="true"]');
  }, []);

  useEffect(() => {
    if (layer.operationType === 'story-deduction-flow') return;
    let objectUrl: string | null = null;

    const resolve = async () => {
      if (layer.type === 'image' || layer.type === 'drawing' || layer.type === 'panorama') {
        console.log(
          '[CanvasLayer] 解析图片/drawing:',
          layer.id,
          'type:',
          layer.type,
          'src:',
          layer.src?.substring(0, 30),
          'imageId:',
          layer.imageId,
        );

        let srcToResolve = layer.src;

        // 如果 src 为空但有 imageId，则使用 imageId 构造 local 引用
        if (!srcToResolve && layer.imageId) {
          srcToResolve = `local:${layer.imageId}`;
        }

        const resolved = await resolveImageSrc(srcToResolve);
        console.log('[CanvasLayer] 解析结果:', layer.id, 'resolved:', resolved?.substring(0, 50));
        setResolvedSrc(resolved);
        if (resolved.startsWith('blob:') && resolved !== layer.src) {
          objectUrl = resolved;
        }
      } else if (layer.type === 'video') {
        // 视频：同样解析本地引用（video:xxx / local:xxx / blob:），保证持久化后能恢复
        const srcToResolve = layer.src || (layer.imageId ? `video:${layer.imageId}` : '');
        const resolved = await resolveImageSrc(srcToResolve);
        setResolvedSrc(resolved);
        if (resolved.startsWith('blob:') && resolved !== layer.src) {
          objectUrl = resolved;
        }
      } else {
        setResolvedSrc(layer.src);
      }
    };

    resolve();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [layer.src, layer.type, layer.imageId]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || e.shiftKey) return;
      e.stopPropagation();
      const multiSelect = e.ctrlKey || e.metaKey;
      selectLayer(layer.id, multiSelect);
      if (layer.locked) return;
      // 交互元素（文本编辑/按钮等）按下时不启动拖拽，仅选中
      if (isInteractiveTarget(e.target)) return;
      dragMovedRef.current = false;
      setIsDragging(true);

      const childLayers = layers.filter((l) => l.parentId === layer.id);
      const childPositions = childLayers.map((child) => ({ id: child.id, x: child.x, y: child.y }));

      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        layerX: layer.x,
        layerY: layer.y,
        childPositions,
      };
    },
    [layer.id, layer.x, layer.y, layer.locked, layers, selectLayer, isInteractiveTarget],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, _corner: string) => {
      if (layer.locked) return;
      e.stopPropagation();
      setIsResizing(true);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: layer.width,
        height: layer.height,
      };
    },
    [layer.width, layer.height, layer.locked],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsRenaming(true);
      setNewTitle(layer.title);
    },
    [layer.title],
  );

  const handleImageDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (layer.type === 'image' && resolvedSrc) {
        setIsZoomed(true);
      }
    },
    [layer.type, resolvedSrc],
  );

  const handleVideoDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (layer.type === 'video' && resolvedSrc) {
        setVideoPreviewOpen(true);
      }
    },
    [layer.type, resolvedSrc],
  );

  const openPanoramaViewer = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (
        resolvedSrc &&
        (layer.type === 'panorama' || (layer.type === 'image' && isProbablyPanorama))
      ) {
        setShowPanorama(true);
      }
    },
    [layer.type, resolvedSrc, isProbablyPanorama],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      selectLayer(layer.id);
      if (onContextMenuRequest) {
        onContextMenuRequest(layer.id, e.clientX, e.clientY);
      }
    },
    [layer.id, selectLayer, onContextMenuRequest],
  );

  const handleRenameSubmit = useCallback(() => {
    if (newTitle.trim()) {
      updateLayer(layer.id, { title: newTitle.trim() });
    }
    setIsRenaming(false);
  }, [layer.id, newTitle, updateLayer]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRenameSubmit();
      } else if (e.key === 'Escape') {
        setIsRenaming(false);
        setNewTitle(layer.title);
      }
    },
    [handleRenameSubmit, layer.title],
  );

  const handleTextEditSubmit = useCallback(() => {
    if (skipTextBlurRef.current) {
      skipTextBlurRef.current = false;
      return;
    }
    if (editingText !== null) {
      updateLayer(layer.id, { text: editingText });
    }
    setEditingText(null);
  }, [editingText, layer.id, updateLayer]);

  const handleTextEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTextEditSubmit();
      } else if (e.key === 'Escape') {
        skipTextBlurRef.current = true;
        setEditingText(null);
      }
    },
    [handleTextEditSubmit],
  );

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        // 移动超过阈值视为真实拖动，用于抑制鼠标抬起后的 click，避免拖完后误触发图层点击
        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
          dragMovedRef.current = true;
        }
        const newX = dragStartRef.current.layerX + deltaX;
        const newY = dragStartRef.current.layerY + deltaY;
        const snapped = calculateSnap(layer, newX, newY);
        updateLayer(layer.id, { x: snapped.x, y: snapped.y });

        if (layer.type === 'group' && dragStartRef.current.childPositions.length > 0) {
          dragStartRef.current.childPositions.forEach((childPos) => {
            updateLayer(childPos.id, {
              x: childPos.x + deltaX,
              y: childPos.y + deltaY,
            });
          });
        }
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStartRef.current.x;
        const deltaY = e.clientY - resizeStartRef.current.y;
        const newWidth = Math.max(50, resizeStartRef.current.width + deltaX);
        const newHeight = Math.max(50, resizeStartRef.current.height + deltaY);
        updateLayer(layer.id, { width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, layer, layers, updateLayer, calculateSnap]);

  const renderContent = () => {
    // 推演流程占位图层 — 渲染卡片 UI
    if (layer.operationType === 'story-deduction-flow') {
      let flowPhase = 'select';
      let srcLayerId: string | null = null;
      try {
        const f = layer.generationPrompt ? JSON.parse(layer.generationPrompt) : null;
        if (f?.phase) flowPhase = f.phase;
        if (f?.sourceLayerId) srcLayerId = f.sourceLayerId;
      } catch {
        /* empty */
      }
      const isDone = flowPhase === 'done';
      const phaseIdx = ['select', 'analyze', 'deduce', 'storyboard', 'video', 'done'].indexOf(
        flowPhase,
      );
      const stepLabels = ['选择', '分析', '推演', '宫格', '视频'];
      const srcLayer = srcLayerId ? layers.find((l) => l.id === srcLayerId) : null;

      return (
        <div
          className={`w-full h-full rounded-lg overflow-hidden relative ${isDone ? 'border-2 border-green-500' : 'border-2 border-gray-600'}`}
        >
          {/* 源图背景 (100% 不透明) */}
          {srcLayer?.src && (
            <ResolvedImage
              src={srcLayer.src}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {/* 暗色渐变遮罩保证文字可读 */}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/70 to-gray-900/40" />

          <div className="relative z-10 w-full h-full flex flex-col justify-between p-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[9px] font-bold text-amber-300 drop-shadow">
                <Sparkles className="w-2.5 h-2.5" /> 推演
              </span>
              <div className={`w-2 h-2 rounded-full ${isDone ? 'bg-green-400' : 'bg-amber-400'}`} />
            </div>
            {!isDone && (
              <div className="space-y-1">
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${((phaseIdx + 1) / 5) * 100}%` }}
                  />
                </div>
                <div className="flex items-center gap-1">
                  {stepLabels.map((label, i) => (
                    <div
                      key={i}
                      className={`flex-1 text-[6px] text-center font-medium drop-shadow ${i <= phaseIdx ? 'text-amber-300' : 'text-gray-400'}`}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isDone && (
              <div className="text-center">
                <span className="text-[8px] font-bold text-green-400 drop-shadow">✅ 已完成</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    switch (layer.type) {
      case 'image':
        if (!resolvedSrc) {
          return (
            <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
              <div className="text-gray-500 text-sm">{layer.src ? '加载中...' : '等待图片...'}</div>
            </div>
          );
        }
        return (
          <div className="relative w-full h-full" onDoubleClick={handleImageDoubleClick}>
            <img
              src={resolvedSrc}
              alt={layer.title}
              className="w-full h-full object-contain"
              draggable={false}
              onError={(_e) => {
                console.error('图片加载失败:', {
                  layerId: layer.id,
                  title: layer.title,
                  srcLength: layer.src?.length,
                  srcPrefix: layer.src?.substring(0, 50),
                });
              }}
              onLoad={(e) => {
                const img = e.currentTarget;
                imgNaturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
                if (isLikelyPanoramaImage(layer.title, img.naturalWidth, img.naturalHeight)) {
                  setIsProbablyPanorama(true);
                }
              }}
            />
            {isProbablyPanorama && (
              <div
                className="absolute top-1.5 right-1.5 bg-purple-600/80 text-white font-semibold rounded flex items-center gap-1 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPanorama(true);
                }}
                title="此图片看起来像全景图，点击以 720° 模式查看"
                style={{
                  fontSize: `${Math.max(11, Math.round(layer.height / 28))}px`,
                  padding: `${Math.round(layer.height / 90)}px ${Math.round(layer.height / 50)}px`,
                }}
              >
                <Orbit size={Math.max(12, Math.round(layer.height / 28))} />
                720°
              </div>
            )}
          </div>
        );
      case 'video':
        if (layer.operationType === 'mkr-video' && !resolvedSrc) {
          return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800/80 rounded-lg border-2 border-dashed border-purple-500/50">
              <Film className="w-8 h-8 text-purple-400 mb-2" />
              <span className="text-xs text-purple-300 font-semibold">MKR 视频节点</span>
              <span className="text-[9px] text-gray-500 mt-1">选中后在底部编辑配置</span>
            </div>
          );
        }
        if (!resolvedSrc) {
          return (
            <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
              <div className="text-gray-500 text-sm">等待视频...</div>
            </div>
          );
        }
        return (
          <div
            className="relative w-full h-full group/video"
            onDoubleClick={handleVideoDoubleClick}
            title="双击预览视频"
          >
            {/* pointer-events: none 让视频不拦截鼠标事件，保证图层可拖拽/可选中 */}
            <video
              src={resolvedSrc}
              className="w-full h-full object-contain pointer-events-none select-none"
              loop
              muted
              playsInline
              draggable={false}
            />
            {/* 悬停提示：可双击全屏预览 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 transition-opacity duration-150 group-hover/video:opacity-100">
              <div className="w-10 h-10 rounded-full bg-black/60 border border-white/40 flex items-center justify-center">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        );
      case 'sticky':
        return (
          <div
            className="w-full h-full p-3 rounded-lg shadow-lg"
            style={{ backgroundColor: layer.color || '#fef3c7' }}
          >
            <textarea
              className="w-full h-full bg-transparent resize-none outline-none text-sm"
              value={layer.text || ''}
              onChange={(e) => updateLayer(layer.id, { text: e.target.value })}
              placeholder="Enter text..."
            />
          </div>
        );
      case 'text':
        if (editingText !== null) {
          return (
            <textarea
              className="w-full h-full bg-transparent resize-none outline-none text-center"
              style={{ color: layer.color || '#ffffff', fontSize: layer.fontSize || 24 }}
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onBlur={handleTextEditSubmit}
              onKeyDown={handleTextEditKeyDown}
              autoFocus
            />
          );
        }
        return (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ color: layer.color || '#ffffff', fontSize: layer.fontSize || 24 }}
            onDoubleClick={() => setEditingText(layer.text || '')}
            title="双击编辑文字"
          >
            {layer.text || 'Text'}
          </div>
        );
      case 'group':
        return (
          <div
            className="w-full h-full border-2 border-dashed rounded-lg"
            style={{ borderColor: layer.color || '#6366f1' }}
          >
            <span className="absolute top-2 left-2 text-xs text-gray-400">{layer.title}</span>
          </div>
        );
      case 'drawing':
        if (!resolvedSrc) {
          return (
            <div className="w-full h-full flex items-center justify-center bg-transparent">
              <div className="text-gray-500 text-sm">{layer.src ? '加载中...' : '绘制中...'}</div>
            </div>
          );
        }
        return (
          <img
            src={resolvedSrc}
            alt={layer.title}
            className="w-full h-full object-contain"
            draggable={false}
          />
        );
      case 'panorama':
        if (!resolvedSrc) {
          return (
            <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
              <div className="text-gray-500 text-sm">加载全景图中...</div>
            </div>
          );
        }
        if (inline3d) {
          return (
            <InlinePanoramaViewer
              panoramaSrc={resolvedSrc}
              onOpenFullscreen={() => setShowPanorama(true)}
              onToggleFlat={() => setInline3d(false)}
            />
          );
        }
        return (
          <div
            className="w-full h-full relative cursor-pointer overflow-hidden rounded-lg"
            onDoubleClick={openPanoramaViewer}
          >
            <img
              src={resolvedSrc}
              alt={layer.title}
              className="w-full h-full object-cover"
              draggable={false}
            />
            <div
              className="absolute top-1.5 right-1.5 bg-purple-600/80 text-white font-semibold rounded flex items-center gap-1"
              style={{
                fontSize: `${Math.max(11, Math.round(layer.height / 28))}px`,
                padding: `${Math.round(layer.height / 90)}px ${Math.round(layer.height / 50)}px`,
              }}
            >
              <Orbit size={Math.max(12, Math.round(layer.height / 28))} />
              720°
            </div>
            <button
              className="absolute bottom-1.5 right-1.5 bg-black/50 hover:bg-black/70 text-white font-semibold rounded flex items-center gap-1 transition-colors"
              title="内嵌 3D 查看"
              onClick={(e) => {
                e.stopPropagation();
                setInline3d(true);
              }}
              style={{
                fontSize: `${Math.max(11, Math.round(layer.height / 28))}px`,
                padding: `${Math.round(layer.height / 90)}px ${Math.round(layer.height / 50)}px`,
              }}
            >
              <Orbit size={Math.max(12, Math.round(layer.height / 28))} />
              3D
            </button>
          </div>
        );
      case 'prompt':
        return <PromptLayer layer={layer as PromptLayerData} isSelected={isSelected} />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={layerRef}
      data-layer-id={layer.id}
      className={`group absolute transition-shadow duration-150 ${
        isSelected ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:ring-1 hover:ring-gray-500'
      } ${layer.locked ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        left: layer.x,
        top: layer.y,
        width: layer.width,
        height: layer.height,
        zIndex: layer.zIndex ?? (isSelected ? 100 : 10),
        opacity: layer.opacity ?? 1,
        display: layer.visible === false ? 'none' : 'block',
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onClick={(e) => {
        e.stopPropagation();
        if (dragMovedRef.current) {
          dragMovedRef.current = false;
          return;
        }
        onClick?.(layer.id);
      }}
    >
      {layer.isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-white">
              {layer.progress !== undefined ? `${Math.round(layer.progress)}%` : 'Loading...'}
            </span>
          </div>
        </div>
      )}

      {layer.error && (
        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center rounded-lg">
          <span className="text-sm text-red-500">{layer.error}</span>
        </div>
      )}

      {/* 完成状态指示器 */}
      {!layer.isLoading && !layer.error && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <div
            className={`w-2.5 h-2.5 rounded-full border border-black/20 shadow-sm ${
              layer.src ? 'bg-green-500' : 'bg-gray-500'
            }`}
            title={layer.src ? '已完成' : '未完成'}
          />
        </div>
      )}

      {renderContent()}

      {showPanorama &&
        resolvedSrc &&
        createPortal(
          <PanoramaViewer
            panoramaSrc={resolvedSrc}
            layerId={layer.type === 'panorama' ? layer.id : undefined}
            initialCamera={(layer as any).cameraState}
            onClose={() => setShowPanorama(false)}
            onScreenshots={async (results) => {
              const store = useCanvasStore.getState();
              const pending: LayerData[] = [];
              await Promise.all(
                results.map(async (r, i) => {
                  const x = layer.x + (i % 4) * 180;
                  const y = layer.y + layer.height + 60 + Math.floor(i / 4) * 160;
                  try {
                    const blob = await unifiedImageService.base64ToBlob(r.dataUrl);
                    const imageId = unifiedImageService.generateImageId();
                    await unifiedImageService.saveImage(imageId, blob);
                    pending.push({
                      id: crypto.randomUUID(),
                      type: 'image',
                      x,
                      y,
                      width: 320,
                      height: 180,
                      src: `local:${imageId}`,
                      imageId,
                      title: `全景截图 - ${r.label}`,
                      createdAt: Date.now(),
                      operationType: 'panorama-screenshot',
                    } as LayerData);
                  } catch (e) {
                    console.error('[CanvasLayer] 截图保存失败:', e);
                    pending.push({
                      id: crypto.randomUUID(),
                      type: 'image',
                      x,
                      y,
                      width: 320,
                      height: 180,
                      src: r.dataUrl,
                      title: `全景截图 - ${r.label}`,
                      createdAt: Date.now(),
                      operationType: 'panorama-screenshot',
                    } as LayerData);
                  }
                }),
              );
              store.addLayers(pending);
              setShowPanorama(false);
            }}
          />,
          document.body,
        )}

      {isZoomed &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center cursor-zoom-out"
            onClick={() => setIsZoomed(false)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
              <img
                src={resolvedSrc}
                alt={layer.title}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                draggable={false}
              />
              <button
                className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsZoomed(false);
                }}
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
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-xs text-white">
                {layer.title}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {videoPreviewOpen &&
        resolvedSrc &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"
            onClick={() => setVideoPreviewOpen(false)}
          >
            <div
              className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                src={resolvedSrc}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl bg-black"
                controls
                autoPlay
                loop
              />
              <button
                className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setVideoPreviewOpen(false);
                }}
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
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-xs text-white">
                {layer.title}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {isSelected && !isResizing && !layer.locked && (
        <>
          <ResizeHandle position="nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
          <ResizeHandle position="ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
          <ResizeHandle position="sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
          <ResizeHandle position="se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        </>
      )}

      {layer.locked && (
        <div className="absolute top-1 right-1 p-1 bg-gray-800/80 rounded">
          <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}

      {isSelected && (
        <>
          <div
            className="absolute -top-6 left-0 px-2 py-0.5 bg-blue-500 text-white text-xs rounded truncate max-w-full flex items-center gap-1 cursor-pointer"
            onDoubleClick={handleDoubleClick}
          >
            {layer.locked && (
              <svg className="w-3 h-3 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {isRenaming ? (
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                className="bg-transparent border-none outline-none text-white text-xs w-20"
                autoFocus
              />
            ) : (
              layer.title
            )}
          </div>
        </>
      )}

      {/* 连接把手（在图层边框上，跟随图层缩放） */}
      <div
        className={`absolute z-10 transition-opacity duration-150 ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ left: '-10px', top: '50%', transform: 'translateY(-50%)' }}
        title="输入连线"
      >
        <div className="w-8 h-8 rounded-full bg-gray-600/80 border-2 border-gray-500 flex items-center justify-center transition-all hover:bg-purple-500 hover:border-purple-400 hover:scale-125">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>
      {/* 输出连线把手：仅图片/全景图可作为连线源，其余图层不显示 */}
      {(layer.type === 'image' || layer.type === 'panorama') && (
        <div
          className={`absolute z-10 transition-opacity duration-150 ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ right: '-10px', top: '50%', transform: 'translateY(-50%)' }}
          title="拖拽到其它图层建立输出连线"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onConnectionStart?.(layer.id, e.clientX, e.clientY);
          }}
        >
          <div className="w-8 h-8 rounded-full bg-gray-600/80 border-2 border-gray-500 flex items-center justify-center transition-all cursor-crosshair hover:bg-purple-500 hover:border-purple-400 hover:scale-125">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};
