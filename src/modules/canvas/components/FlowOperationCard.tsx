import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasStore } from '../hooks/useCanvasState';
import { Play, Trash2, RefreshCw, Sparkles, X, Film, AlertTriangle } from 'lucide-react';
import type { FlowState } from '../types/flow';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { logger, LogCategory } from '../../../../services/logger.ts';

interface FlowOperationCardProps {
  flowLayerId: string;
  onResume: (flowLayerId: string) => void;
  onClose: () => void;
}

export const FlowOperationCard: React.FC<FlowOperationCardProps> = ({
  flowLayerId,
  onResume,
  onClose,
}) => {
  const { layers, updateLayer, deleteLayer, addLayer } = useCanvasStore();
  const flowLayer = layers.find((l) => l.id === flowLayerId);
  const [sourceThumbnail, setSourceThumbnail] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  let flow: FlowState | null = null;
  try {
    flow = flowLayer?.generationPrompt
      ? (JSON.parse(flowLayer.generationPrompt) as FlowState)
      : null;
  } catch {
    /* empty */
  }

  const sourceLayer = flow?.sourceLayerId ? layers.find((l) => l.id === flow.sourceLayerId) : null;

  useEffect(() => {
    if (sourceLayer?.src) {
      unifiedImageService.resolveForDisplay(sourceLayer.src).then(setSourceThumbnail);
    }
  }, [sourceLayer?.src]);

  useEffect(() => {
    if (flow?.video?.thumbnailUrl) {
      unifiedImageService.resolveForDisplay(flow.video.thumbnailUrl).then(setVideoThumbnail);
    } else if (flow?.storyboard?.compositeImageUrl) {
      unifiedImageService
        .resolveForDisplay(flow.storyboard.compositeImageUrl)
        .then(setVideoThumbnail);
    }
  }, [flow?.video?.thumbnailUrl, flow?.storyboard?.compositeImageUrl]);

  if (!flowLayer || !flow) {
    return createPortal(
      <div className="fixed inset-0 z-[300] flex items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50" />
        <div
          className="relative bg-gray-900 rounded-xl border border-gray-700 shadow-2xl p-6 max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-gray-400">图层数据异常</p>
          <button
            onClick={onClose}
            className="mt-3 px-4 py-2 bg-gray-700 text-white text-sm rounded-lg"
          >
            关闭
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  const isDone = flow.phase === 'done';
  void (isDone
    ? '已完成'
    : `进行中 · 步骤 ${['选择', '分析', '推演', '宫格', '视频'].indexOf(flow.phase) + 1}/5`);
  const steps = ['选择图片', 'AI 分析', '剧情推演', '宫格生成', '生成视频'];
  const phaseIndex = ['select', 'analyze', 'deduce', 'storyboard', 'video', 'done'].indexOf(
    flow.phase,
  );
  const currentStepLabel = steps[Math.min(phaseIndex, 4)];

  const handleDelete = () => {
    deleteLayer(flowLayerId);
    onClose();
  };

  const handleExportVideo = async () => {
    if (!flow?.video?.videoUrl) return;
    try {
      const videoRef = flow.video.videoUrl;
      const videoId = videoRef.startsWith('video:') ? videoRef.replace('video:', '') : null;

      if (!videoId) {
        const savedRef = await unifiedImageService.saveVideoToLocal(videoRef);
        const finalVideoId = savedRef.replace('video:', '');
        const baseX = flowLayer.x;
        const baseY = flowLayer.y + flowLayer.height + 30;
        addLayer({
          id: crypto.randomUUID(),
          type: 'video',
          x: baseX,
          y: baseY,
          width: 640,
          height: 360,
          src: savedRef,
          imageId: finalVideoId,
          title: '推演→视频',
          createdAt: Date.now(),
          sourceLayerIds: [flowLayerId],
          operationType: 'story-deduction-video',
          duration: flow.video.duration,
          generationPrompt: flowLayer.generationPrompt,
        });
      } else {
        const baseX = flowLayer.x;
        const baseY = flowLayer.y + flowLayer.height + 30;
        addLayer({
          id: crypto.randomUUID(),
          type: 'video',
          x: baseX,
          y: baseY,
          width: 640,
          height: 360,
          src: videoRef,
          imageId: videoId,
          title: '推演→视频',
          createdAt: Date.now(),
          sourceLayerIds: [flowLayerId],
          operationType: 'story-deduction-video',
          duration: flow.video.duration,
          generationPrompt: flowLayer.generationPrompt,
        });
      }
    } catch (e) {
      logger.error(LogCategory.CANVAS, '[FlowOperationCard] 导出视频失败:', e);
    }
  };

  const fullReset = () => {
    if (!flow?.sourceLayerId) return;
    const resetFlow: FlowState = {
      phase: 'analyze',
      sourceLayerId: flow.sourceLayerId,
      vlmAnalysis: null,
      deduction: null,
      storyboard: null,
      video: null,
    };
    updateLayer(flowLayerId, { generationPrompt: JSON.stringify(resetFlow) });
    onResume(flowLayerId);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" /> 推演→视频
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isDone ? 'bg-green-800 text-green-300' : 'bg-amber-900 text-amber-300'}`}
            >
              {isDone ? '✅ 已完成' : '⚡ 进行中'}
            </div>
            {!isDone && <span className="text-[9px] text-gray-500">{currentStepLabel}</span>}
          </div>

          <div className="flex gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
            <div className="w-16 h-12 bg-gray-700 rounded overflow-hidden flex-shrink-0 border border-gray-700">
              {sourceThumbnail && (
                <img src={sourceThumbnail} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-300 truncate">{sourceLayer?.title || '源图片'}</p>
              <p className="text-[9px] text-gray-500">
                创建于 {new Date(flowLayer.createdAt).toLocaleDateString()}
              </p>
              {!isDone && (
                <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${((phaseIndex + 1) / 5) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {isDone && videoThumbnail && (
            <div className="rounded-lg overflow-hidden border border-gray-700">
              <img src={videoThumbnail} className="w-full h-28 object-cover" alt="预览" />
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-700 flex gap-2">
          {!isDone && (
            <button
              onClick={() => {
                onResume(flowLayerId);
                onClose();
              }}
              className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 flex items-center justify-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> 继续推演
            </button>
          )}
          {isDone && flow?.video?.videoUrl && (
            <button
              onClick={handleExportVideo}
              className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex items-center justify-center gap-1.5"
            >
              <Film className="w-3.5 h-3.5" /> 导出视频
            </button>
          )}
          {isDone && !showResetConfirm && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex-1 py-2 border border-gray-600 text-gray-300 text-sm rounded-lg hover:text-white flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 重新生成
            </button>
          )}
          {isDone && showResetConfirm && (
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 border border-gray-600 text-gray-300 text-xs rounded-lg hover:text-white"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  fullReset();
                }}
                className="flex-1 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 flex items-center justify-center gap-1"
              >
                <AlertTriangle className="w-3 h-3" /> 确认重置
              </button>
            </div>
          )}
          <button
            onClick={handleDelete}
            className="p-2 border border-red-400/40 text-red-400 text-sm rounded-lg hover:bg-red-800"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
