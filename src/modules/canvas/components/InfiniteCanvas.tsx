/**
 * Infinite Canvas Component
 * 提供无限画布功能，支持平移、缩放、图层管理
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Film, Sparkles, Orbit } from 'lucide-react';
import { ErrorBoundary } from '../../../../components/ErrorBoundary';
import { useCanvasStore } from '../hooks/useCanvasState';
import { useCanvasControls } from '../hooks/useCanvasControls';
import { CanvasLayer } from './CanvasLayer';
import { Minimap } from './Minimap';
import { CanvasToolbar } from './CanvasToolbar';
import { ResolvedImage } from './ResolvedImage';
import { LayerPanel } from './LayerPanel';
import { PromptBar } from './PromptBar';

import { ConnectionLines } from './ConnectionLines';
import { canvasModelService } from '../services/canvasModelService';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { LayerDetailPanel } from './LayerDetailPanel';
import { CanvasSettingsPanel } from './CanvasSettingsPanel';
import { PromptLinkPanel } from './PromptLinkPanel';
import { SaveToLibraryDialog } from './SaveToLibraryDialog';
import { ImageActionMenu } from './ImageActionMenu';
import { FlowOperationCard } from './FlowOperationCard';
import { StoryDeductionFlowPanel } from './StoryDeductionFlowPanel';
import { CanvasIntegrityBanner } from './CanvasIntegrityBanner';
import { GenerateVideoPanel, type GenerationConfig } from './GenerateVideoPanel';
import { VideoNodePanel } from './VideoNodePanel';
import { StyleTemplatePanel } from './StyleTemplatePanel';
import type { LayerData } from '../types/canvas';
import type { FlowState } from '../types/flow';
import type { ProjectState } from '../../../../types';
import { logger, LogCategory } from '../../../../services/logger.ts';

interface InfiniteCanvasProps {
  className?: string;
  project?: ProjectState;
}

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  points: { x: number; y: number }[];
}

export const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ className = '', project }) => {
  const {
    layers,
    offset,
    scale,
    selectedLayerId,
    selectedLayerIds,
    selectLayer,
    selectAllLayers,
    clearSelection,
    deleteLayer,
    copySelectedLayers,
    pasteLayers,
    toggleLayerLock,
    toggleLayerVisibility,
    addLayer,
    updateLayer,
    duplicateLayer,
    undo,
    redo,
    templatePanelOpen,
    activeTool,
    strokeColor,
    strokeWidth,
  } = useCanvasStore();
  const { canvasRef, handleMouseDown } = useCanvasControls();
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const connectionDragRef = useRef<{
    sourceLayerId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null>(null);

  const [showLayerDetail, setShowLayerDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#1f2937');
  const [showGrid, setShowGrid] = useState(true);
  const [gridSnap, setGridSnap] = useState(false);
  const [gridSize, setGridSize] = useState(50);
  const [promptLinkLayerId, setPromptLinkLayerId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ layerId: string; x: number; y: number } | null>(
    null,
  );
  const [showSaveToLibraryDialog, setShowSaveToLibraryDialog] = useState(false);
  const [saveToLibraryLayer, setSaveToLibraryLayer] = useState<LayerData | null>(null);
  const [generateVideoLayerIds, setGenerateVideoLayerIds] = useState<string[] | null>(null);
  const [regenerateVideoConfig, setRegenerateVideoConfig] = useState<{
    sourceLayerIds: string[];
    config: GenerationConfig;
  } | null>(null);
  const [showAiVideoReGen, setShowAiVideoReGen] = useState(false);
  const [videoNodePanelLayerId, setVideoNodePanelLayerId] = useState<string | null>(null);
  const [, setShowFlowOperationCard] = useState(false);
  const [flowCardLayerId, setFlowCardLayerId] = useState<string | null>(null);
  const [showFlowPanel, setShowFlowPanel] = useState(false);
  const [activeFlowLayerId, setActiveFlowLayerId] = useState<string | null>(null);
  const [showStoryDeductionFlow, setShowStoryDeductionFlow] = useState(false);
  const [storyDeductionFlowLayerId, setStoryDeductionFlowLayerId] = useState<string | null>(null);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    points: [],
  });

  const [, forceRender] = useState(0);
  const isConnectingRef = useRef(false);

  useEffect(() => {
    const layer = selectedLayerId ? layers.find((l) => l.id === selectedLayerId) : null;
    if (!(layer?.type === 'video' && layer?.operationType === 'image-to-video')) {
      setShowAiVideoReGen(false);
    }
  }, [selectedLayerId]);

  // 选中变化时关闭视频节点面板
  useEffect(() => {
    if (videoNodePanelLayerId && selectedLayerId !== videoNodePanelLayerId) {
      setVideoNodePanelLayerId(null);
    }
  }, [selectedLayerId, videoNodePanelLayerId]);

  const createMkrNode = useCallback(
    (sourceImageIds: string[]) => {
      const currentLayers = useCanvasStore.getState().layers;
      const sourceLayers = currentLayers.filter(
        (l) => sourceImageIds.includes(l.id) && l.type === 'image',
      );
      if (sourceLayers.length === 0) return;

      const firstSource = sourceLayers[0];
      const lastSource = sourceLayers[sourceLayers.length - 1];
      const mkrX = firstSource.x;
      const mkrY = lastSource.y + lastSource.height + 40;
      const totalFrames = 360;

      const initialFrames = sourceLayers.map((l, i) => ({
        layerId: l.id,
        frameIndex:
          i === 0
            ? 0
            : i === sourceLayers.length - 1
              ? -1
              : Math.round((i * totalFrames) / (sourceLayers.length - 1)),
        prompt: '',
      }));

      addLayer({
        id: crypto.randomUUID(),
        type: 'video',
        x: mkrX,
        y: mkrY,
        width: 640,
        height: 360,
        src: '',
        title: 'MKR视频节点',
        createdAt: Date.now(),
        sourceLayerIds: sourceImageIds,
        operationType: 'mkr-video',
        generationPrompt: JSON.stringify({
          frames: initialFrames,
          globalPrompt: '',
          duration: 12,
          fps: 30,
          width: 640,
          height: 360,
        }),
      });

      // Select the new node after it's added (it will be the last layer)
      const newLayers = useCanvasStore.getState().layers;
      const newNode = newLayers[newLayers.length - 1];
      if (newNode) {
        selectLayer(newNode.id);
        setVideoNodePanelLayerId(newNode.id);
      }
    },
    [addLayer, selectLayer],
  );

  const [stitchLoading, setStitchLoading] = useState(false);

  const stitchPanorama = useCallback(
    async (sourceImageIds: string[]) => {
      if (stitchLoading) return;
      const currentLayers = useCanvasStore.getState().layers;
      const sourceLayers = currentLayers.filter(
        (l) => sourceImageIds.includes(l.id) && l.type === 'image' && l.src,
      );
      if (sourceLayers.length === 0) return;

      setStitchLoading(true);
      try {
        const refImages = sourceLayers.map((l) => l.src).filter(Boolean) as string[];
        const result = await canvasModelService.generateImage({
          prompt:
            '720 degree equirectangular panorama, seamless stitching of multiple views, wide angle, 360 degree spatial scene',
          referenceImages: refImages,
          aspectRatio: '16:9',
        });

        let panoramaSrc = '';
        if (typeof result === 'string') {
          panoramaSrc = result;
        } else if (result && typeof result === 'object' && 'images' in result) {
          const images = (result as { images?: Array<{ url?: string } | string> }).images;
          const first = images?.[0];
          panoramaSrc = (typeof first === 'string' ? first : first?.url) || '';
        }

        if (!panoramaSrc) throw new Error('生成结果为空');

        const { imageStorageService } = await import('../../../../services/imageStorageService');
        let resolvedUrl = panoramaSrc;
        let imageId: string | undefined;

        if (panoramaSrc.startsWith('local:')) {
          const localId = panoramaSrc.replace('local:', '');
          imageId = localId;
          const blob = await imageStorageService.getImage(localId);
          if (blob) {
            const reader = new FileReader();
            resolvedUrl = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } else if (panoramaSrc.startsWith('data:')) {
          try {
            const imgId = `panorama_stitch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const response = await fetch(panoramaSrc);
            const blob = await response.blob();
            await imageStorageService.saveImage(imgId, blob);
            imageId = imgId;
          } catch (e) {
            logger.warn(LogCategory.CANVAS, '[stitchPanorama] 保存到 IndexedDB 失败:', e);
          }
          resolvedUrl = panoramaSrc;
        } else {
          resolvedUrl = await unifiedImageService.resolveForDisplay(panoramaSrc);
        }

        const firstSource = sourceLayers[0];

        addLayer({
          id: crypto.randomUUID(),
          type: 'panorama',
          x: firstSource.x,
          y: firstSource.y + firstSource.height + 40,
          width: 640,
          height: 360,
          src: resolvedUrl,
          imageId,
          title: `全景拼接 ${new Date().toLocaleTimeString()}`,
          createdAt: Date.now(),
          operationType: 'panorama-generation',
          sourceLayerIds: sourceImageIds,
          isLoading: false,
          progress: 100,
        });
      } catch (e) {
        logger.error(LogCategory.CANVAS, '[stitchPanorama] 拼接失败:', e);
        alert(`拼接失败: ${(e as Error).message}`);
      } finally {
        setStitchLoading(false);
      }
    },
    [addLayer, stitchLoading],
  );

  const handleResumeFlow = useCallback((flowLayerId: string) => {
    setActiveFlowLayerId(flowLayerId);
    setShowFlowOperationCard(false);
    setShowFlowPanel(true);
  }, []);

  const handleLayerClick = useCallback(
    (layerId: string) => {
      const layer = layers.find((l) => l.id === layerId);
      if (layer?.operationType === 'story-deduction-flow') {
        setFlowCardLayerId(layerId);
      }
      // 单击 MKR 视频节点打开视频生成配置面板（按下/拖动不触发）
      if (layer?.type === 'video' && layer?.operationType === 'mkr-video') {
        setVideoNodePanelLayerId(layerId);
      }
    },
    [layers],
  );

  const handleCloseFlowOperationCard = useCallback(() => {
    setFlowCardLayerId(null);
    clearSelection();
  }, [clearSelection]);

  const handleCloseFlowPanel = useCallback(() => {
    setShowFlowPanel(false);
    setActiveFlowLayerId(null);
  }, []);

  const handleStartFlow = useCallback(
    (sourceLayerId: string) => {
      const { layers: currentLayers } = useCanvasStore.getState();
      const sourceLayer = currentLayers.find((l) => l.id === sourceLayerId);
      if (!sourceLayer) return;

      // 计算新 flow 的位置：在源图下方，如果有已有的 flow 则往下叠
      const existingFlows = currentLayers.filter(
        (l) =>
          l.operationType === 'story-deduction-flow' &&
          l.generationPrompt?.includes(`"sourceLayerId":"${sourceLayerId}"`),
      );
      const baseY = sourceLayer.y + sourceLayer.height + 30;
      const flowY = baseY + existingFlows.length * 340;

      const flowId = crypto.randomUUID();
      const flowState: FlowState = {
        phase: 'analyze',
        sourceLayerId,
        vlmAnalysis: null,
        deduction: null,
        storyboard: null,
        video: null,
      };
      addLayer({
        id: flowId,
        type: 'image',
        x: sourceLayer.x,
        y: flowY,
        width: 640,
        height: 320,
        src: '',
        title: `推演→视频 ${existingFlows.length + 1}`,
        createdAt: Date.now(),
        sourceLayerIds: [sourceLayerId],
        operationType: 'story-deduction-flow',
        generationPrompt: JSON.stringify(flowState),
      });
      setActiveFlowLayerId(flowId);
      setShowFlowPanel(true);
    },
    [addLayer],
  );

  const handleEdgeSelect = useCallback(
    (edgeId: string | null) => {
      setSelectedEdgeId(edgeId);
      if (edgeId) {
        selectLayer(null);
      }
    },
    [selectLayer],
  );

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    const [targetId, sourceId] = selectedEdgeId.split('::');
    const target = layers.find((l) => l.id === targetId);
    const newSourceLayerIds = (target?.sourceLayerIds || []).filter((id) => id !== sourceId);
    const updates: Partial<LayerData> = { sourceLayerIds: newSourceLayerIds };
    if (target?.sourceLayerId === sourceId) {
      updates.sourceLayerId = newSourceLayerIds.length > 0 ? newSourceLayerIds[0] : undefined;
    }
    // Also remove the frame from generationPrompt
    if (target?.generationPrompt) {
      try {
        const config = JSON.parse(target.generationPrompt);
        if (config.mkr?.frames) {
          config.mkr.frames = config.mkr.frames.filter(
            (f: { layerId?: string }) => f.layerId !== sourceId,
          );
          updates.generationPrompt = JSON.stringify(config);
        }
      } catch {
        /* empty */
      }
    }
    updateLayer(targetId, updates);
    setSelectedEdgeId(null);
  }, [selectedEdgeId, layers, updateLayer]);

  const handleConnectionStart = useCallback(
    (layerId: string, clientX: number, clientY: number) => {
      const sourceLayer = layers.find((l) => l.id === layerId);
      if (!sourceLayer || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      connectionDragRef.current = {
        sourceLayerId: layerId,
        fromX: (sourceLayer.x + sourceLayer.width) * scale + offset.x,
        fromY: (sourceLayer.y + sourceLayer.height / 2) * scale + offset.y,
        toX: clientX - rect.left,
        toY: clientY - rect.top,
      };
      isConnectingRef.current = true;
      forceRender((n) => n + 1);
    },
    [layers, offset, scale],
  );

  const handlePromptLinkRequest = useCallback((layerId: string) => {
    setPromptLinkLayerId(layerId);
  }, []);

  const handleContextMenuRequest = useCallback((layerId: string, x: number, y: number) => {
    setContextMenu({ layerId, x, y });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // 鼠标事件处理器通过 ref 封装，避免闭包过时问题
  const mouseHandlersRef = useRef({
    mousemove: (_e: MouseEvent) => {},
    mouseup: (_e: MouseEvent) => {},
  });

  // 每次渲染后更新 ref（保证 handler 内捕获最新值）
  mouseHandlersRef.current = {
    mousemove: (e: MouseEvent) => {
      if (isConnectingRef.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        if (connectionDragRef.current) {
          connectionDragRef.current.toX = e.clientX - rect.left;
          connectionDragRef.current.toY = e.clientY - rect.top;
        }
        forceRender((n) => n + 1);
        return;
      }
      if (isDraggingRef.current) {
        const currentOffset = useCanvasStore.getState().offset;
        const deltaX = e.clientX - lastMouseRef.current.x;
        const deltaY = e.clientY - lastMouseRef.current.y;
        useCanvasStore.getState().setOffset({
          x: currentOffset.x + deltaX,
          y: currentOffset.y + deltaY,
        });
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    mouseup: (e: MouseEvent) => {
      if (isConnectingRef.current) {
        isConnectingRef.current = false;
        const dragState = connectionDragRef.current;
        connectionDragRef.current = null;
        forceRender((n) => n + 1);
        if (dragState && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const store = useCanvasStore.getState();
          const mcX = (e.clientX - rect.left - store.offset.x) / store.scale;
          const mcY = (e.clientY - rect.top - store.offset.y) / store.scale;
          const sourceLayer = store.layers.find((l) => l.id === dragState.sourceLayerId);
          const target = store.layers.find(
            (l) =>
              l.id !== dragState.sourceLayerId &&
              mcX >= l.x &&
              mcX <= l.x + l.width &&
              mcY >= l.y &&
              mcY <= l.y + l.height,
          );
          // Strict mode: only allow image/panorama → video
          const isValid =
            target &&
            (sourceLayer?.type === 'image' || sourceLayer?.type === 'panorama') &&
            target.type === 'video';
          if (isValid) {
            const existing =
              target.sourceLayerIds || (target.sourceLayerId ? [target.sourceLayerId] : []);
            if (!existing.includes(dragState.sourceLayerId)) {
              const newSourceIds = [...existing, dragState.sourceLayerId];
              const updates: Partial<LayerData> = {
                sourceLayerIds: newSourceIds,
                sourceLayerId: existing.length === 0 ? dragState.sourceLayerId : undefined,
              };
              // Also add a frame to generationPrompt
              if (target.generationPrompt) {
                try {
                  const config = JSON.parse(target.generationPrompt);
                  if (config.mkr?.frames) {
                    config.mkr.frames.push({
                      layerId: dragState.sourceLayerId,
                      frameIndex: -1,
                      prompt: '',
                    });
                    updates.generationPrompt = JSON.stringify(config);
                  }
                } catch {
                  /* empty */
                }
              }
              store.updateLayer(target.id, updates);
            }
          }
        }
        return;
      }
      isDraggingRef.current = false;
    },
  };

  // 选中图层时清除连线选中
  useEffect(() => {
    if (selectedLayerId) {
      setSelectedEdgeId(null);
    }
  }, [selectedLayerId]);

  // 只用一次注册稳定的事件监听器，通过 ref 调用最新 handler
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => mouseHandlersRef.current.mousemove(e);
    const onMouseUp = (e: MouseEvent) => mouseHandlersRef.current.mouseup(e);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 'a':
            e.preventDefault();
            selectAllLayers();
            break;
          case 'c':
            e.preventDefault();
            copySelectedLayers();
            break;
          case 'v':
            e.preventDefault();
            pasteLayers();
            break;
          case 'l':
            e.preventDefault();
            if (selectedLayerId) {
              if (selectedLayerIds.length > 1) {
                selectedLayerIds.forEach((id) => toggleLayerLock(id));
              } else {
                toggleLayerLock(selectedLayerId);
              }
            }
            break;
          case 'h':
            e.preventDefault();
            if (selectedLayerId) {
              if (selectedLayerIds.length > 1) {
                selectedLayerIds.forEach((id) => toggleLayerVisibility(id));
              } else {
                toggleLayerVisibility(selectedLayerId);
              }
            }
            break;
        }
      } else {
        switch (e.key) {
          case 'Delete':
          case 'Backspace':
            e.preventDefault();
            if (selectedEdgeId) {
              const [targetId] = selectedEdgeId.split('::');
              const target = layers.find((l) => l.id === targetId);
              if (target && !target.isLoading && !target.error && target.src) break;
              deleteSelectedEdge();
            } else if (selectedLayerIds.length > 0) {
              selectedLayerIds.forEach((id) => deleteLayer(id));
              clearSelection();
            }
            break;
          case 'Escape':
            e.preventDefault();
            setSelectedEdgeId(null);
            clearSelection();
            break;
        }
      }
    },
    [
      undo,
      redo,
      selectedLayerId,
      selectedLayerIds,
      selectedEdgeId,
      layers,
      selectAllLayers,
      copySelectedLayers,
      pasteLayers,
      toggleLayerLock,
      toggleLayerVisibility,
      deleteLayer,
      clearSelection,
      updateLayer,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current || e.target === e.currentTarget) {
        if (activeTool === 'select') {
          setSelectedEdgeId(null);
          selectLayer(null);
        }
      }
    },
    [selectLayer, activeTool],
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isDraggingRef.current = true;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      if (activeTool === 'select') {
        handleMouseDown(e);
      } else if (e.button === 0) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        setDrawingState({
          isDrawing: true,
          startX: screenX,
          startY: screenY,
          currentX: screenX,
          currentY: screenY,
          points: [{ x: screenX, y: screenY }],
        });
      }
    },
    [activeTool, handleMouseDown],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingState.isDrawing) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      setDrawingState((prev) => ({
        ...prev,
        currentX: screenX,
        currentY: screenY,
        points:
          activeTool === 'pencil' ? [...prev.points, { x: screenX, y: screenY }] : prev.points,
      }));

      if (drawingCanvasRef.current) {
        const ctx = drawingCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (activeTool === 'pencil') {
            ctx.beginPath();
            drawingState.points.forEach((point, i) => {
              if (i === 0) {
                ctx.moveTo(point.x, point.y);
              } else {
                ctx.lineTo(point.x, point.y);
              }
            });
            ctx.lineTo(screenX, screenY);
            ctx.stroke();
          } else if (activeTool === 'rectangle') {
            const width = screenX - drawingState.startX;
            const height = screenY - drawingState.startY;
            ctx.strokeRect(drawingState.startX, drawingState.startY, width, height);
          } else if (activeTool === 'arrow') {
            ctx.beginPath();
            ctx.moveTo(drawingState.startX, drawingState.startY);
            ctx.lineTo(screenX, screenY);
            ctx.stroke();

            const angle = Math.atan2(screenY - drawingState.startY, screenX - drawingState.startX);
            const arrowLength = 15;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(
              screenX - arrowLength * Math.cos(angle - Math.PI / 6),
              screenY - arrowLength * Math.sin(angle - Math.PI / 6),
            );
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(
              screenX - arrowLength * Math.cos(angle + Math.PI / 6),
              screenY - arrowLength * Math.sin(angle + Math.PI / 6),
            );
            ctx.stroke();
          }
        }
      }
    },
    [
      drawingState.isDrawing,
      drawingState.startX,
      drawingState.startY,
      drawingState.points,
      activeTool,
      strokeColor,
      strokeWidth,
    ],
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (drawingState.isDrawing) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect && drawingCanvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = drawingCanvasRef.current.width;
        canvas.height = drawingCanvasRef.current.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (activeTool === 'pencil' && drawingState.points.length > 1) {
            ctx.beginPath();
            drawingState.points.forEach((point, i) => {
              if (i === 0) {
                ctx.moveTo(point.x, point.y);
              } else {
                ctx.lineTo(point.x, point.y);
              }
            });
            ctx.stroke();
          } else if (activeTool === 'rectangle') {
            const width = drawingState.currentX - drawingState.startX;
            const height = drawingState.currentY - drawingState.startY;
            ctx.strokeRect(drawingState.startX, drawingState.startY, width, height);
          } else if (activeTool === 'arrow') {
            ctx.beginPath();
            ctx.moveTo(drawingState.startX, drawingState.startY);
            ctx.lineTo(drawingState.currentX, drawingState.currentY);
            ctx.stroke();

            const angle = Math.atan2(
              drawingState.currentY - drawingState.startY,
              drawingState.currentX - drawingState.startX,
            );
            const arrowLength = 15;
            ctx.beginPath();
            ctx.moveTo(drawingState.currentX, drawingState.currentY);
            ctx.lineTo(
              drawingState.currentX - arrowLength * Math.cos(angle - Math.PI / 6),
              drawingState.currentY - arrowLength * Math.sin(angle - Math.PI / 6),
            );
            ctx.moveTo(drawingState.currentX, drawingState.currentY);
            ctx.lineTo(
              drawingState.currentX - arrowLength * Math.cos(angle + Math.PI / 6),
              drawingState.currentY - arrowLength * Math.sin(angle + Math.PI / 6),
            );
            ctx.stroke();
          }

          const padding = strokeWidth + 2;
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;

          if (activeTool === 'pencil') {
            drawingState.points.forEach((point) => {
              minX = Math.min(minX, point.x);
              minY = Math.min(minY, point.y);
              maxX = Math.max(maxX, point.x);
              maxY = Math.max(maxY, point.y);
            });
          } else {
            minX = Math.min(drawingState.startX, drawingState.currentX);
            minY = Math.min(drawingState.startY, drawingState.currentY);
            maxX = Math.max(drawingState.startX, drawingState.currentX);
            maxY = Math.max(drawingState.startY, drawingState.currentY);
          }

          minX = Math.max(0, minX - padding);
          minY = Math.max(0, minY - padding);
          maxX = Math.min(canvas.width, maxX + padding);
          maxY = Math.min(canvas.height, maxY + padding);

          const cropWidth = Math.max(maxX - minX, 20);
          const cropHeight = Math.max(maxY - minY, 20);

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropWidth;
          cropCanvas.height = cropHeight;
          const cropCtx = cropCanvas.getContext('2d');
          if (cropCtx) {
            cropCtx.drawImage(canvas, -minX, -minY);
          }

          const dataUrl = cropCanvas.toDataURL('image/png');
          const canvasX = (minX - offset.x) / scale;
          const canvasY = (minY - offset.y) / scale;
          const canvasWidth = cropWidth / scale;
          const canvasHeight = cropHeight / scale;

          if (cropWidth > 10 && cropHeight > 10) {
            addLayer({
              id: crypto.randomUUID(),
              type: 'drawing',
              x: canvasX,
              y: canvasY,
              width: canvasWidth,
              height: canvasHeight,
              src: dataUrl,
              title: `${activeTool === 'pencil' ? '铅笔' : activeTool === 'rectangle' ? '矩形' : '箭头'}标注`,
              createdAt: Date.now(),
            });
          }
        }
      }

      if (drawingCanvasRef.current) {
        const ctx = drawingCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
        }
      }

      setDrawingState({
        isDrawing: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        points: [],
      });
    }
  }, [drawingState, activeTool, strokeColor, strokeWidth, scale, offset, addLayer]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-gray-900 ${className}`}>
      <CanvasIntegrityBanner />
      <CanvasToolbar />

      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onClick={handleCanvasClick}
        style={{
          cursor: activeTool !== 'select' ? 'crosshair' : undefined,
          backgroundColor: backgroundColor,
        }}
      >
        {showGrid && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <pattern
                id="grid"
                width={gridSize * scale}
                height={gridSize * scale}
                patternUnits="userSpaceOnUse"
                x={offset.x % (gridSize * scale)}
                y={offset.y % (gridSize * scale)}
              >
                <path
                  d={`M ${gridSize * scale} 0 L 0 0 0 ${gridSize * scale}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={1}
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        )}

        <canvas
          ref={drawingCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          width={canvasRef.current?.clientWidth || 1920}
          height={canvasRef.current?.clientHeight || 1080}
        />

        <ConnectionLines
          offset={offset}
          scale={scale}
          selectedEdgeId={selectedEdgeId}
          onEdgeSelect={handleEdgeSelect}
        />

        {/* 连线可点击命中区（HTML div，不受 SVG pointer-events 影响） */}
        {layers
          .flatMap((layer) => {
            const sourceIds =
              layer.sourceLayerIds && layer.sourceLayerIds.length > 0
                ? layer.sourceLayerIds
                : layer.sourceLayerId
                  ? [layer.sourceLayerId]
                  : [];
            return sourceIds.map((sourceId) => {
              const source = layers.find((l) => l.id === sourceId);
              if (!source) return null;
              const edgeId = `${layer.id}::${sourceId}`;
              const isThisEdgeSelected = selectedEdgeId === edgeId;
              const fromX = (source.x + source.width) * scale + offset.x;
              const fromY = (source.y + source.height / 2) * scale + offset.y;
              const toX = layer.x * scale + offset.x;
              const toY = (layer.y + layer.height / 2) * scale + offset.y;
              const midX = (fromX + toX) / 2;
              const midY = (fromY + toY) / 2;
              return (
                <div
                  key={`hit-${edgeId}`}
                  className="absolute z-[3]"
                  style={{
                    left: midX - 15,
                    top: midY - 15,
                    width: 30,
                    height: 30,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdgeSelect(isThisEdgeSelected ? null : edgeId);
                  }}
                />
              );
            });
          })
          .filter(Boolean)}

        {connectionDragRef.current &&
          (() => {
            const d = connectionDragRef.current;
            const controlOffset = Math.abs(d.toX - d.fromX) * 0.5;
            const store = useCanvasStore.getState();
            const src = store.layers.find((l) => l.id === d.sourceLayerId);
            const isValidSource = src?.type === 'image' || src?.type === 'panorama';
            return (
              <>
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ zIndex: 60 }}
                >
                  <defs>
                    <marker
                      id="arrow-connect"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
                    </marker>
                  </defs>
                  <path
                    d={`M ${d.fromX} ${d.fromY} C ${d.fromX + controlOffset} ${d.fromY}, ${d.toX - controlOffset} ${d.toY}, ${d.toX} ${d.toY}`}
                    fill="none"
                    stroke={isValidSource ? '#a855f7' : '#ef4444'}
                    strokeWidth={2.5}
                    strokeDasharray="8,4"
                    markerEnd="url(#arrow-connect)"
                  />
                </svg>
                {!isValidSource && (
                  <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[300] px-3 py-1.5 bg-red-900/80 text-red-300 text-[10px] rounded-lg border border-red-700/60 pointer-events-none">
                    仅支持图片 → 视频连线
                  </div>
                )}
              </>
            );
          })()}

        {/* 选中连线的删除按钮 */}
        {selectedEdgeId &&
          (() => {
            const [targetId, sourceId] = selectedEdgeId.split('::');
            const target = layers.find((l) => l.id === targetId);
            const source = layers.find((l) => l.id === sourceId);
            if (!target || !source) return null;
            const fromX = (source.x + source.width) * scale + offset.x;
            const fromY = (source.y + source.height / 2) * scale + offset.y;
            const toX = target.x * scale + offset.x;
            const toY = (target.y + target.height / 2) * scale + offset.y;
            const midX = (fromX + toX) / 2;
            const midY = (fromY + toY) / 2;
            return (
              <div
                className="absolute z-[70]"
                style={{ left: midX - 14, top: midY - 14, width: 28, height: 28 }}
              >
                <button
                  className="w-full h-full rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer"
                  title="删除该连线"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSelectedEdge();
                  }}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            );
          })()}

        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {layers.map((layer) => (
            <CanvasLayer
              key={layer.id}
              layer={layer}
              isSelected={selectedLayerIds.includes(layer.id)}
              onPromptLinkRequest={handlePromptLinkRequest}
              onContextMenuRequest={handleContextMenuRequest}
              onConnectionStart={handleConnectionStart}
              onClick={handleLayerClick}
            />
          ))}
        </div>
      </div>

      {/* 推演流程操作卡 — 点击时弹出 */}
      {flowCardLayerId && (
        <FlowOperationCard
          flowLayerId={flowCardLayerId}
          onResume={handleResumeFlow}
          onClose={handleCloseFlowOperationCard}
        />
      )}

      {/* 推演流程面板 */}
      {showFlowPanel && activeFlowLayerId && (
        <StoryDeductionFlowPanel flowLayerId={activeFlowLayerId} onClose={handleCloseFlowPanel} />
      )}

      {/* 推演流程面板（从 ImageActionMenu 打开） */}
      {showStoryDeductionFlow && storyDeductionFlowLayerId && (
        <StoryDeductionFlowPanel
          flowLayerId={storyDeductionFlowLayerId}
          onClose={() => {
            setShowStoryDeductionFlow(false);
            setStoryDeductionFlowLayerId(null);
          }}
        />
      )}

      {/* 单图操作菜单 — 仅对普通图片（非 flow 图层） */}
      {(() => {
        const imgLayer = selectedLayerId
          ? layers.find(
              (l) =>
                l.id === selectedLayerId &&
                l.type === 'image' &&
                l.operationType !== 'story-deduction-flow',
            )
          : undefined;
        if (!imgLayer || !canvasRef.current) return null;
        const cr = canvasRef.current.getBoundingClientRect();
        return (
          <ImageActionMenu
            layer={imgLayer}
            screenRect={{
              top: cr.top + offset.y + imgLayer.y * scale,
              left: cr.left + offset.x + imgLayer.x * scale,
              width: imgLayer.width * scale,
              height: imgLayer.height * scale,
            }}
            onStartFlow={handleStartFlow}
            onMkrNodeCreated={(id) => setVideoNodePanelLayerId(id)}
          />
        );
      })()}

      {/* AI 生成视频 - 重新生成弹窗 */}
      {showAiVideoReGen &&
        (() => {
          const videoLayer = selectedLayerId
            ? layers.find(
                (l) =>
                  l.id === selectedLayerId &&
                  l.type === 'video' &&
                  l.operationType === 'image-to-video',
              )
            : null;
          if (!videoLayer) return null;

          let initialConfig: GenerationConfig | undefined;
          try {
            if (videoLayer.generationPrompt) {
              initialConfig = JSON.parse(videoLayer.generationPrompt) as GenerationConfig;
            }
          } catch {
            /* empty */
          }

          return (
            <ErrorBoundary name="GenerateVideoPanel">
              <GenerateVideoPanel
                selectedLayerIds={videoLayer.sourceLayerIds || []}
                initialConfig={initialConfig}
                onClose={() => setShowAiVideoReGen(false)}
              />
            </ErrorBoundary>
          );
        })()}

      {/* 视频节点面板：通过右键菜单打开，选中变化时关闭 */}
      {videoNodePanelLayerId && (
        <ErrorBoundary name="VideoNodePanel">
          <VideoNodePanel
            layerId={videoNodePanelLayerId}
            onClose={() => setVideoNodePanelLayerId(null)}
          />
        </ErrorBoundary>
      )}

      {/* 多图操作栏：当选中 2+ 图片时显示 */}
      {(() => {
        const selectedImages = selectedLayerIds.filter((id) => {
          const l = layers.find((la) => la.id === id);
          return l && l.type === 'image' && !l.isLoading;
        });
        if (selectedImages.length < 2 || !canvasRef.current) return null;
        const hasSingleImageMenu =
          selectedLayerId && layers.find((l) => l.id === selectedLayerId && l.type === 'image');
        if (hasSingleImageMenu) return null;
        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]">
            <div className="flex items-center gap-3 bg-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700 shadow-2xl px-5 py-3">
              <Film className="w-5 h-5 text-purple-400" />
              <span className="text-sm text-gray-300">
                已选 <span className="text-white font-semibold">{selectedImages.length}</span>{' '}
                张图片
              </span>
              <div className="flex items-center -space-x-2">
                {selectedImages.slice(0, 5).map((id) => {
                  const l = layers.find((la) => la.id === id);
                  if (!l) return null;
                  return (
                    <div
                      key={id}
                      className="w-8 h-8 rounded-full border-2 border-gray-800 overflow-hidden bg-gray-700"
                    >
                      {l.src && (
                        <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  );
                })}
                {selectedImages.length > 5 && (
                  <div className="w-8 h-8 rounded-full border-2 border-gray-800 bg-gray-700 flex items-center justify-center text-[10px] text-gray-400">
                    +{selectedImages.length - 5}
                  </div>
                )}
              </div>
              <div className="w-px h-6 bg-gray-700" />
              <button
                onClick={() => createMkrNode(selectedImages)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors font-medium"
              >
                <Film className="w-4 h-4" />
                多关键帧 (MKR)
              </button>
              <button
                onClick={() => setGenerateVideoLayerIds(selectedImages)}
                className="flex items-center gap-2 px-5 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors font-medium"
              >
                <Sparkles className="w-4 h-4" />
                AI 生成视频
              </button>
              <button
                onClick={() => stitchPanorama(selectedImages)}
                disabled={stitchLoading}
                className="flex items-center gap-2 px-5 py-2 text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg transition-colors font-medium"
              >
                <Orbit className="w-4 h-4" />
                {stitchLoading ? '拼接中...' : '全景拼接'}
              </button>
            </div>
          </div>
        );
      })()}

      <Minimap />
      <LayerPanel />
      <PromptBar selectedLayerId={selectedLayerId} />

      <button
        onClick={() => setShowSettings(true)}
        className="absolute top-4 left-4 z-50 p-2 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 text-gray-300 hover:text-white transition-colors"
        title="画布设置"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {selectedLayerId && (
        <button
          onClick={() => setShowLayerDetail(true)}
          className="absolute top-16 left-4 z-50 p-2 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 text-gray-300 hover:text-white transition-colors"
          title="图层详情"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      )}

      {showLayerDetail && <LayerDetailPanel onClose={() => setShowLayerDetail(false)} />}

      {templatePanelOpen && <StyleTemplatePanel />}

      {showSettings && (
        <CanvasSettingsPanel
          backgroundColor={backgroundColor}
          onBackgroundColorChange={setBackgroundColor}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          gridSnap={gridSnap}
          onGridSnapChange={setGridSnap}
          gridSize={gridSize}
          onGridSizeChange={setGridSize}
          onClose={() => setShowSettings(false)}
        />
      )}

      {promptLinkLayerId && (
        <PromptLinkPanel
          sourceLayerId={promptLinkLayerId}
          onClose={() => setPromptLinkLayerId(null)}
        />
      )}

      {showSaveToLibraryDialog && saveToLibraryLayer && project && (
        <SaveToLibraryDialog
          layer={saveToLibraryLayer}
          project={project}
          onClose={() => {
            setShowSaveToLibraryDialog(false);
            setSaveToLibraryLayer(null);
          }}
        />
      )}

      {generateVideoLayerIds && (
        <ErrorBoundary name="GenerateVideoPanel">
          <GenerateVideoPanel
            selectedLayerIds={generateVideoLayerIds}
            onClose={() => setGenerateVideoLayerIds(null)}
          />
        </ErrorBoundary>
      )}

      {regenerateVideoConfig && (
        <ErrorBoundary name="GenerateVideoPanel">
          <GenerateVideoPanel
            selectedLayerIds={regenerateVideoConfig.sourceLayerIds}
            initialConfig={regenerateVideoConfig.config}
            onClose={() => setRegenerateVideoConfig(null)}
          />
        </ErrorBoundary>
      )}

      {contextMenu && (
        <div
          className="fixed z-[200] bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setContextMenu(null);
              setPromptLinkLayerId(contextMenu.layerId);
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
          >
            <span>⚡</span>
            <span>关联到提示词</span>
          </button>
          <button
            onClick={() => {
              setContextMenu(null);
              duplicateLayer(contextMenu.layerId);
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
          >
            <span>📋</span>
            <span>复制图层</span>
          </button>

          {/* 重新生成视频 - 仅对 image-to-video 视频图层显示 */}
          {layers.find((l) => l.id === contextMenu.layerId)?.type === 'video' &&
            layers.find((l) => l.id === contextMenu.layerId)?.operationType ===
              'image-to-video' && (
              <>
                <div className="border-t border-gray-700 my-1" />
                <button
                  onClick={() => {
                    selectLayer(contextMenu.layerId);
                    setShowAiVideoReGen(true);
                    setContextMenu(null);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                >
                  <span>✨</span>
                  <span>重新生成视频</span>
                </button>
              </>
            )}

          {/* 视频生成配置 - 仅对 mkr-video 视频节点显示 */}
          {layers.find((l) => l.id === contextMenu.layerId)?.type === 'video' &&
            layers.find((l) => l.id === contextMenu.layerId)?.operationType === 'mkr-video' && (
              <>
                <div className="border-t border-gray-700 my-1" />
                <button
                  onClick={() => {
                    selectLayer(contextMenu.layerId);
                    setVideoNodePanelLayerId(contextMenu.layerId);
                    setContextMenu(null);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                >
                  <span>🎬</span>
                  <span>视频生成配置</span>
                </button>
              </>
            )}

          {/* 保存到资产库 - 仅对图片和视频图层显示 */}
          {(layers.find((l) => l.id === contextMenu.layerId)?.type === 'image' ||
            layers.find((l) => l.id === contextMenu.layerId)?.type === 'video') && (
            <>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => {
                  const layer = layers.find((l) => l.id === contextMenu.layerId);
                  if (layer) {
                    setSaveToLibraryLayer(layer);
                    setShowSaveToLibraryDialog(true);
                  }
                  setContextMenu(null);
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
              >
                <span>💾</span>
                <span>保存到资产库</span>
              </button>
            </>
          )}

          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={() => {
              setContextMenu(null);
              deleteLayer(contextMenu.layerId);
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-600/20 hover:text-red-300 flex items-center gap-2"
          >
            <span>🗑️</span>
            <span>删除图层</span>
          </button>
        </div>
      )}
    </div>
  );
};
