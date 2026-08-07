import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Image, Trash2 } from 'lucide-react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { StepSelectImage } from './steps/StepSelectImage';
import { StepVLMAnalysis } from './steps/StepVLMAnalysis';
import { StepDeduction } from './steps/StepDeduction';
import { StepStoryboard } from './steps/StepStoryboard';
import { StepVideo } from './steps/StepVideo';
import { FlowState, FlowPhase, INITIAL_FLOW_STATE } from '../types/flow';
import { ResolvedImage } from './ResolvedImage';

interface StoryDeductionFlowPanelProps {
  flowLayerId: string;
  onClose: () => void;
}

const PHASE_LABELS: Record<FlowPhase, string> = {
  select: '确认源图',
  analyze: 'AI 分析',
  deduce: '剧情推演',
  storyboard: '宫格生成',
  video: '生成视频',
  done: '完成',
};

const PHASE_ORDER: FlowPhase[] = ['select', 'analyze', 'deduce', 'storyboard', 'video', 'done'];

const STEP_INDICES: Record<FlowPhase, number> = {
  select: 0,
  analyze: 1,
  deduce: 2,
  storyboard: 3,
  video: 4,
  done: 5,
};

const DonePhase: React.FC<{ flow: FlowState; onClose: () => void; onReset: () => void }> = ({
  flow,
  onClose,
  onReset,
}) => {
  const [playableUrl, setPlayableUrl] = useState('');

  useEffect(() => {
    if (flow.video?.videoUrl) {
      import('../../../../services/unifiedImageService').then(({ unifiedImageService }) =>
        unifiedImageService.resolveForDisplay(flow.video!.videoUrl!).then(setPlayableUrl),
      );
    }
  }, [flow.video?.videoUrl]);

  return (
    <div className="py-12 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-green-800 flex items-center justify-center mx-auto">
        <Sparkles className="w-8 h-8 text-green-400" />
      </div>
      <h3 className="text-lg font-semibold text-white">推演 + 视频生成完成！</h3>
      <p className="text-sm text-gray-400">
        已生成 {flow.video?.keyframePrompts.length || 0} 帧关键帧
        {flow.video ? `，${flow.video.duration || 15} 秒视频` : ''}
      </p>
      {playableUrl && (
        <video src={playableUrl} controls className="w-full max-w-md mx-auto rounded-lg bg-black" />
      )}
      <div className="flex gap-2 justify-center">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
        >
          关闭
        </button>
        <button
          onClick={onReset}
          className="px-6 py-2 border border-gray-600 text-gray-300 text-sm rounded-lg hover:text-white flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" /> 重新开始
        </button>
      </div>
    </div>
  );
};

export const StoryDeductionFlowPanel: React.FC<StoryDeductionFlowPanelProps> = ({
  flowLayerId,
  onClose,
}) => {
  const { layers, updateLayer } = useCanvasStore();
  const flowLayer = layers.find((l) => l.id === flowLayerId);

  const [flow, setFlow] = useState<FlowState>(() => {
    try {
      if (flowLayer?.generationPrompt) {
        const saved = JSON.parse(flowLayer.generationPrompt) as FlowState;
        if (saved?.sourceLayerId) return saved;
      }
    } catch {
      /* empty */
    }
    return { ...INITIAL_FLOW_STATE, phase: 'select' };
  });

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // 持久化 flow 到图层
  useEffect(() => {
    if (flowLayerId && flow.sourceLayerId) {
      updateLayer(flowLayerId, { generationPrompt: JSON.stringify(flow) });
    }
  }, [flow, flowLayerId, updateLayer]);

  const handleClearFlow = useCallback(() => {
    if (!flow.sourceLayerId) return;
    const resetFlow: FlowState = {
      ...INITIAL_FLOW_STATE,
      sourceLayerId: flow.sourceLayerId,
      phase: 'select',
    };
    setFlow(resetFlow);
    updateLayer(flowLayerId, { generationPrompt: JSON.stringify(resetFlow) });
  }, [flow.sourceLayerId, flowLayerId, updateLayer]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const goToPhase = useCallback((phase: FlowPhase) => {
    setFlow((prev) => ({ ...prev, phase }));
  }, []);

  const updateFlow = useCallback((partial: Partial<FlowState>) => {
    setFlow((prev) => {
      const next = { ...prev, ...partial };
      return next;
    });
  }, []);

  const currentPhaseIndex = STEP_INDICES[flow.phase];
  const sourceLayer = layers.find((l) => l.id === flow.sourceLayerId);

  const renderStep = () => {
    switch (flow.phase) {
      case 'select':
        return (
          <StepSelectImage
            sourceLayerId={flow.sourceLayerId}
            onSelect={(layerId) => {
              updateFlow({ sourceLayerId: layerId, phase: 'analyze' });
            }}
            onNext={() => goToPhase('analyze')}
          />
        );
      case 'analyze':
        return (
          <StepVLMAnalysis
            sourceLayerId={flow.sourceLayerId!}
            initialData={flow.vlmAnalysis}
            onSave={(data) => updateFlow({ vlmAnalysis: data, phase: 'deduce' })}
            onNext={() => goToPhase('deduce')}
            onBack={() => goToPhase('select')}
          />
        );
      case 'deduce':
        return (
          <StepDeduction
            sourceLayerId={flow.sourceLayerId!}
            initialData={flow.deduction}
            vlmRawAnalysis={flow.vlmAnalysis?.editedAnalysis || flow.vlmAnalysis?.rawOutput || ''}
            onSave={(data) => updateFlow({ deduction: data, phase: 'storyboard' })}
            onNext={() => goToPhase('storyboard')}
            onBack={() => goToPhase('analyze')}
          />
        );
      case 'storyboard':
        return (
          <StepStoryboard
            sourceLayerId={flow.sourceLayerId!}
            deductionData={flow.deduction!}
            initialData={flow.storyboard}
            onSave={(data) => updateFlow({ storyboard: data, phase: 'video' })}
            onNext={() => goToPhase('video')}
            onBack={() => goToPhase('deduce')}
          />
        );
      case 'video':
        return (
          <StepVideo
            sourceLayerId={flow.sourceLayerId!}
            vlmData={flow.vlmAnalysis}
            deductionData={flow.deduction!}
            storyboardData={flow.storyboard!}
            initialData={flow.video}
            onSave={(data) => updateFlow({ video: data, phase: 'done' })}
            onNext={() => goToPhase('done')}
            onBack={() => goToPhase('storyboard')}
          />
        );
      case 'done':
        return <DonePhase flow={flow} onClose={onClose} onReset={handleClearFlow} />;
    }
  };

  const showSidebar = flow.phase !== 'select' && flow.phase !== 'done';

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        className="relative bg-gray-900 rounded-xl border border-gray-700 shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* header */}
        <div className="flex-shrink-0 bg-gray-900 border-b border-gray-700 px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">🎬 推演 → 视频</h2>
          <div className="flex items-center gap-1">
            {flow.phase !== 'select' && (
              <button
                onClick={handleClearFlow}
                className="text-[10px] text-gray-500 hover:text-red-400 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
              >
                重新开始
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex flex-1 overflow-hidden">
          {/* left sidebar — source image */}
          {showSidebar && (
            <div className="flex-shrink-0 w-64 border-r border-gray-700 bg-gray-800 p-3 flex flex-col gap-3 overflow-y-auto">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Image className="w-3 h-3" /> 源图片
              </div>
              <div className="rounded-lg overflow-hidden border border-gray-700 bg-gray-800">
                {sourceLayer?.src && (
                  <ResolvedImage src={sourceLayer.src} className="w-full object-cover" alt="源" />
                )}
              </div>
              <div className="text-[10px] text-gray-400 truncate">{sourceLayer?.title || ''}</div>
              {sourceLayer && (
                <div className="text-[9px] text-gray-500">
                  {sourceLayer.width}×{sourceLayer.height}
                </div>
              )}

              {/* mini steps */}
              <div className="mt-auto pt-3 border-t border-gray-700">
                <div className="flex flex-col gap-1.5">
                  {PHASE_ORDER.slice(0, 5).map((phase, i) => (
                    <div key={phase} className="flex items-center gap-2">
                      <div
                        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          i < currentPhaseIndex
                            ? 'bg-amber-500 text-white'
                            : i === currentPhaseIndex
                              ? 'bg-amber-900 text-amber-300 border border-amber-500'
                              : 'bg-gray-800 text-gray-500 border border-gray-600'
                        }`}
                      >
                        {i + 1}
                      </div>
                      <span
                        className={`text-[10px] ${i <= currentPhaseIndex ? 'text-gray-300' : 'text-gray-500'}`}
                      >
                        {PHASE_LABELS[phase]}
                      </span>
                      {i < currentPhaseIndex && (
                        <svg
                          className="w-3 h-3 text-green-500 ml-auto"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* right — step content */}
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
            {/* progress bar */}
            <div className="flex-shrink-0 px-5 pt-3 pb-2 bg-gray-900">
              <div className="flex items-center gap-1">
                {PHASE_ORDER.slice(0, 5).map((phase, i) => (
                  <React.Fragment key={phase}>
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${
                        i < currentPhaseIndex
                          ? 'bg-amber-500 text-white'
                          : i === currentPhaseIndex
                            ? 'bg-amber-900 text-amber-300 border border-amber-500'
                            : 'bg-gray-800 text-gray-500 border border-gray-600'
                      }`}
                    >
                      {i + 1}
                    </div>
                    {i < 4 && (
                      <div
                        className={`flex-1 h-0.5 rounded ${i < currentPhaseIndex ? 'bg-amber-500' : 'bg-gray-700'}`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div className="flex items-center justify-between mt-1">
                {PHASE_ORDER.slice(0, 5).map((phase) => (
                  <span
                    key={phase}
                    className={`text-[9px] font-medium ${
                      phase === flow.phase ? 'text-amber-400' : 'text-gray-500'
                    }`}
                  >
                    {PHASE_LABELS[phase]}
                  </span>
                ))}
              </div>
            </div>

            {/* step content scrollable */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 bg-gray-900">{renderStep()}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
