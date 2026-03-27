/**
 * 画布模块入口
 * 导出画布相关的所有公开 API
 */

export { InfiniteCanvas } from './components/InfiniteCanvas';
export { CanvasLayer } from './components/CanvasLayer';
export { Minimap } from './components/Minimap';
export { CanvasToolbar } from './components/CanvasToolbar';
export { DrawingToolbar } from './components/DrawingToolbar';
export { ConnectionLines } from './components/ConnectionLines';
export { LayerPanel } from './components/LayerPanel';
export { LayerDetailPanel } from './components/LayerDetailPanel';
export { CanvasSettingsPanel } from './components/CanvasSettingsPanel';
export { PromptBar } from './components/PromptBar';
export { StyleTransferPanel } from './components/StyleTransferPanel';
export { ImageEditPanel } from './components/ImageEditPanel';
export { PromptLayer } from './components/PromptLayer';
export { PromptLinkPanel } from './components/PromptLinkPanel';

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
  MinimapViewport,
  PromptLayerData,
  PromptLayerConfig,
  PromptMode,
  PromptExecutionStatus,
  PromptExecutionResult
} from './types/canvas';

export {
  PROMPT_MODE_COLORS,
  PROMPT_MODE_ICONS,
  PROMPT_MODE_NAMES
} from './types/canvas';
