/**
 * 画布模块入口
 * 导出画布相关的所有公开 API
 */

export { InfiniteCanvas } from './components/InfiniteCanvas';
export { CanvasLayer } from './components/CanvasLayer';
export { Minimap } from './components/Minimap';
export { CanvasToolbar } from './components/CanvasToolbar';
export { LayerPanel } from './components/LayerPanel';
export { PromptBar } from './components/PromptBar';
export { StyleTransferPanel } from './components/StyleTransferPanel';
export { ImageEditPanel } from './components/ImageEditPanel';

export { useCanvasStore } from './hooks/useCanvasState';
export { useCanvasControls } from './hooks/useCanvasControls';
export { useSnapAlignment } from './hooks/useSnapAlignment';

export { CanvasModelService } from './services/canvasModelService';
export { canvasIntegrationService, CanvasIntegrationService } from './services/canvasIntegrationService';
export { assetStore } from './services/assetStore';
export { thumbnailService } from './services/thumbnailService';

export type {
  LayerData,
  LayerType,
  CanvasState,
  CanvasOffset,
  Annotation,
  DrawingPath,
  TextAnnotation,
  RectangleAnnotation,
  SnapGuide,
  SnapResult,
  GenerationTask,
  GenerationOptions,
  ExportOptions,
  MinimapViewport
} from './types/canvas';
