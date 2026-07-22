import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Video, Loader2, Edit2, Settings2 } from 'lucide-react';
import { Shot, AspectRatio, VideoDuration, VideoGenerationMode, TimedKeyframe, VideoPreset, Keyframe, FourGridDeduction } from '../../types';
import { getImageAspectRatio, getDefaultResolution, buildVideoPrompt } from './utils';
import type { PipelineShotData } from './utils';
import { VideoSettingsPanel } from '../AspectRatioSelector';
import { 
  getDefaultAspectRatio, 
  getDefaultVideoDuration,
  getVideoModels,
  getActiveVideoModel,
} from '../../services/modelRegistry';
import { VideoModelDefinition } from '../../types/model';
import { unifiedImageService } from '../../services/unifiedImageService';
import AdvancedVideoPanel from './AdvancedVideoPanel';
import DeductionModal from './DeductionModal';
import VideoConfirmDialog from './VideoConfirmDialog';
import { useAlert } from '../GlobalAlert';

interface VideoGeneratorProps {
  shot: Shot;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  isNineGridMode?: boolean;
  onGenerate: (aspectRatio: AspectRatio, duration: VideoDuration, modelId: string) => void;
  onGenerateAdvanced: (params: {
    mode: VideoGenerationMode;
    fps: number;
    width: number;
    height: number;
    timedKeyframes: TimedKeyframe[];
    backgroundImage?: string;
    gridType?: number;
    frameIndexes?: number[];
    aspectRatio: AspectRatio;
    duration: VideoDuration;
    modelId: string;
  }) => void;
  onEditPrompt: () => void;
  onEditCameraChoreography?: () => void;
  onModelChange?: (modelId: string) => void;
  /** 保存高级参数到 shot.interval（Tab 切换前持久化，避免丢失） */
  onSaveAdvancedParams?: (params: {
    mode: VideoGenerationMode;
    fps: number;
    width: number;
    height: number;
    timedKeyframes: TimedKeyframe[];
    backgroundImage?: string;
    gridType?: number;
    frameIndexes?: number[];
  }) => void;
  // Pipeline 字段自动打通
  projectAspectRatio?: AspectRatio;  // 用于推断默认分辨率
  // 预设系统
  videoPresets?: VideoPreset[];
  onSavePreset: (name: string, description?: string) => void;
  onApplyPreset: (presetId: string) => void;
  onDeletePreset?: (presetId: string) => void;
  // 悬空引用校验
  shotKeyframes?: Keyframe[];
  // 四宫格推演持久化
  onSaveFourGrid?: (fourGrid: FourGridDeduction) => void;
  // 视频生成实时进度
  generationProgress?: { percent: number; message: string } | null;
  // 项目上下文（用于提示词拼装来源展示）
  projectLanguage?: string;
  projectEraContext?: string;
}

const VideoGenerator: React.FC<VideoGeneratorProps> = ({
  shot,
  hasStartFrame,
  hasEndFrame,
  isNineGridMode = false,
  onGenerate,
  onGenerateAdvanced,
  onEditPrompt,
  onEditCameraChoreography,
  onModelChange,
  videoPresets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  shotKeyframes,
  projectAspectRatio,
  onSaveAdvancedParams,
  onSaveFourGrid,
  generationProgress,
  projectLanguage,
  projectEraContext,
}) => {
  const { showAlert } = useAlert();

  const normalizeModelId = (modelId?: string) => {
    if (!modelId) return modelId;
    return modelId.toLowerCase() === 'veo_3_1-fast-4k' ? 'veo_3_1-fast' : modelId;
  };

  const resolveVeoFastQuality = (modelId?: string): 'standard' | '4k' => {
    if (!modelId) return 'standard';
    return modelId.toLowerCase() === 'veo_3_1-fast-4k' ? '4k' : 'standard';
  };

  // 获取可用的视频模型
  const videoModels = getVideoModels().filter(m => m.isEnabled);
  const defaultModel = getActiveVideoModel();
  
  // 状态（废弃模型已在数据加载层迁移，此处无需额外处理）
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');
  const [selectedModelId, setSelectedModelId] = useState<string>(
    normalizeModelId(shot.videoModel) || defaultModel?.id || videoModels[0]?.id || 'sora-2'
  );
  const [veoFastQuality, setVeoFastQuality] = useState<'standard' | '4k'>(
    resolveVeoFastQuality(shot.videoModel)
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => getDefaultAspectRatio());
  const [duration, setDuration] = useState<VideoDuration>(() => shot.interval?.duration || getDefaultVideoDuration());
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  // 从 shot 现有字段推断高级面板默认值
  const inferredResolution = getDefaultResolution(projectAspectRatio || '16:9');

  // 构建完整 timedKeyframes：首帧(0%) + 尾帧(100%) + 已保存的中间帧，去重
  const buildTimedKeyframes = (shot: Shot): TimedKeyframe[] => {
    const result: TimedKeyframe[] = [];
    const seenIds = new Set<string>();
    const add = (kfId: string | undefined, pos: number) => {
      if (!kfId || seenIds.has(kfId)) return;
      seenIds.add(kfId);
      result.push({ keyframeId: kfId, positionPercent: pos });
    };
    add(shot.interval?.startKeyframeId, 0);
    add(shot.interval?.endKeyframeId, 100);
    for (const tk of (shot.interval?.timedKeyframes || [])) {
      add(tk.keyframeId, tk.positionPercent);
    }
    return result;
  };

  const [advancedParams, setAdvancedParams] = useState<{
    mode: VideoGenerationMode;
    fps: number;
    width: number;
    height: number;
    timedKeyframes: TimedKeyframe[];
    backgroundImage?: string;
    gridType?: number;
    frameIndexes?: number[];
  }>({
    mode: shot.interval?.mode || 'basic',
    fps: shot.interval?.fps || 30,
    width: shot.interval?.width || inferredResolution.width,
    height: shot.interval?.height || inferredResolution.height,
    timedKeyframes: buildTimedKeyframes(shot),
    backgroundImage: shot.interval?.backgroundImage,
    gridType: shot.interval?.gridType,
    frameIndexes: shot.interval?.frameIndexes,
  });
  
  // 推演弹框状态
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [fourGrid, setFourGrid] = useState<FourGridDeduction | undefined>(shot.fourGrid);

  // 切换镜头时同步状态
  useEffect(() => {
    setFourGrid(shot.fourGrid);
    setShowDeductionModal(false);
    setAdvancedParams(prev => ({
      ...prev,
      mode: shot.interval?.mode || 'basic',
      fps: shot.interval?.fps || 30,
      width: shot.interval?.width || inferredResolution.width,
      height: shot.interval?.height || inferredResolution.height,
      timedKeyframes: buildTimedKeyframes(shot),
      backgroundImage: shot.interval?.backgroundImage,
      gridType: shot.interval?.gridType,
      frameIndexes: shot.interval?.frameIndexes,
    }));
  }, [shot.id]);

  const startKf = shot.keyframes?.find(k => k.type === 'start');
  const startKeyframeImageUrl = startKf?.imageUrl;

  const handleSaveFourGrid = (data: FourGridDeduction) => {
    setFourGrid(data);
    onSaveFourGrid?.(data);
  };

  const handleConfirmFourGrid = (frameIndexes: number[]) => {
    const grid = advancedParams.gridType || 4;
    if (frameIndexes.length === 0) {
      showAlert('请至少选择一个分镜', { type: 'warning' });
      return;
    }
    if (frameIndexes.length !== grid) {
      showAlert(`选择了 ${frameIndexes.length} 个分镜但当前网格是 ${grid} 格`, { type: 'warning' });
      return;
    }
    setAdvancedParams(prev => ({ ...prev, frameIndexes }));
  };

  // 用 ref 稳定引用，避免父组件内联回调重渲染导致 cleanup 死循环
  const saveRef = useRef(onSaveAdvancedParams);
  const paramsRef = useRef(advancedParams);
  saveRef.current = onSaveAdvancedParams;
  paramsRef.current = advancedParams;

  // 当前选中的模型
  const selectedModel = videoModels.find(m => m.id === selectedModelId) as VideoModelDefinition | undefined;
  const modelType: 'sora' | 'veo' = selectedModel?.params.mode === 'async' ? 'sora' : 'veo';
  const effectiveModelId = selectedModelId === 'veo_3_1-fast'
    ? (veoFastQuality === '4k' ? 'veo_3_1-fast-4K' : 'veo_3_1-fast')
    : selectedModelId;
  
  const isGenerating = shot.interval?.status === 'generating';
  const hasVideo = !!shot.interval?.videoUrl;

  // 当模型变化时，更新横竖屏和时长的默认值
  useEffect(() => {
    if (selectedModel) {
      // 如果当前选择的横竖屏不被新模型支持，切换到默认值
      if (!selectedModel.params.supportedAspectRatios.includes(aspectRatio)) {
        setAspectRatio(selectedModel.params.defaultAspectRatio);
      }
      // 如果当前选择的时长不被新模型支持，切换到默认值
      if (!selectedModel.params.supportedDurations.includes(duration)) {
        setDuration(selectedModel.params.defaultDuration);
      }
    }
  }, [selectedModelId]);

  useEffect(() => {
    if (!shot.videoModel) return;
    setSelectedModelId(normalizeModelId(shot.videoModel));
    setVeoFastQuality(resolveVeoFastQuality(shot.videoModel));
  }, [shot.videoModel]);

  useEffect(() => {
    const loadVideoUrl = async () => {
      if (shot.interval?.videoUrl) {
        const url = await unifiedImageService.resolveForDisplay(shot.interval.videoUrl);
        setVideoUrl(url);
      } else {
        setVideoUrl(null);
      }
    };
    loadVideoUrl();
  }, [shot.interval?.videoUrl]);

  const handleGenerate = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmGenerate = () => {
    setShowConfirmDialog(false);
    if (activeTab === 'advanced') {
      onGenerateAdvanced({ ...advancedParams, aspectRatio, duration, modelId: effectiveModelId });
    } else {
      onGenerate(aspectRatio, duration, effectiveModelId);
    }
  };

  const handleVeoFastQualityChange = (quality: 'standard' | '4k') => {
    setVeoFastQuality(quality);
    if (selectedModelId === 'veo_3_1-fast') {
      const modelId = quality === '4k' ? 'veo_3_1-fast-4K' : 'veo_3_1-fast';
      onModelChange?.(modelId);
    }
  };

  const canGenerate = hasStartFrame;

  // 始终根据当前配置动态构建提示词（反映最新修改）
  const videoPrompt = useMemo(() => {
    return buildVideoPrompt(
      shot.actionSummary || '',
      shot.cameraMovement || '',
      effectiveModelId,
      projectLanguage || '中文',
      isNineGridMode ? (shot.nineGrid ?? undefined) : undefined,
      duration,
      shot.cameraChoreography,
      projectEraContext,
    );
  }, [shot.actionSummary, shot.cameraMovement, effectiveModelId, projectLanguage, isNineGridMode, shot.nineGrid, duration, shot.cameraChoreography, projectEraContext]);

  // 确认弹框需要的衍生数据
  const timedKeyframeImages = advancedParams.mode === 'mkr' && advancedParams.timedKeyframes
    ? advancedParams.timedKeyframes.map(tk => {
        const kf = shot.keyframes?.find(k => k.id === tk.keyframeId);
        return { positionPercent: tk.positionPercent, imageUrl: kf?.imageUrl };
      })
    : undefined;
  const refGridImageUrl = fourGrid?.status === 'completed' && fourGrid?.imageUrl
    ? fourGrid.imageUrl
    : (shot.nineGrid?.status === 'completed' ? shot.nineGrid?.imageUrl : undefined);
  const totalFrames = duration * advancedParams.fps;
  const actualFrameIndexes = advancedParams.frameIndexes?.map(pct =>
    Math.min(Math.round((pct / 100) * totalFrames), totalFrames - 1)
  );

  // Pipeline 字段自动打通：构建 shot 现有字段预览数据
  const pipelineShotData: PipelineShotData | undefined = (shot.shotSize || shot.cameraMovement || shot.actionSummary || shot.cameraChoreography)
    ? {
        shotSize: shot.shotSize,
        cameraMovement: shot.cameraMovement,
        actionSummary: shot.actionSummary,
        cameraChoreography: shot.cameraChoreography,
      }
    : undefined;

  // 九宫格模式下自动切换到高级 Tab 以配置网格参数
  useEffect(() => {
    if (isNineGridMode) {
      setActiveTab('advanced');
    }
  }, [isNineGridMode]);

  // 组件卸载 / Tab 切换前持久化高级参数，防止丢失
  // 使用 ref 避免 inline callback 重引用导致的死循环
  useEffect(() => {
    return () => {
      if (saveRef.current && activeTab === 'advanced') {
        saveRef.current(paramsRef.current);
      }
    };
  }, [activeTab]);

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl p-5 border border-[var(--border-primary)] space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
          <Video className="w-3 h-3 text-[var(--accent)]" />
          视频生成
          {shot.cameraChoreography ? (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onEditCameraChoreography?.()}
                className="p-1 text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors"
                title="编辑运镜编排"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <span className="text-[8px] text-[var(--text-muted)]">|</span>
              <button
                onClick={onEditPrompt}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--warning-text)] transition-colors"
                title="编辑原始提示词"
              >
                <span className="text-[9px] font-mono">raw</span>
              </button>
            </div>
          ) : (
            <button 
              onClick={onEditPrompt}
              className="p-1 text-[var(--warning-text)] hover:text-[var(--text-primary)] transition-colors"
              title="预览/编辑视频提示词"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
        </h4>
        {shot.interval?.status === 'completed' && (
          <span className="text-[10px] text-[var(--success)] font-mono flex items-center gap-1">
            ● READY
          </span>
        )}
      </div>

      {/* nineGrid 锁定提示 */}
      {isNineGridMode && (
        <div className="flex items-start gap-2 px-3 py-2 bg-[var(--info-bg)]/30 border border-[var(--accent)]/30 rounded-lg">
          <div className="text-[10px] text-[var(--text-secondary)]">
            <span className="font-bold">网格分镜模式已激活。</span>
            <span className="block mt-0.5">当前使用网格整图作为起始帧，可在高级面板中配置网格类型与帧位置。</span>
          </div>
        </div>
      )}

      {/* Basic / Advanced Tab */}
      <div className="flex gap-1 border-b border-[var(--border-primary)] pb-0.5">
        <button
          onClick={() => setActiveTab('basic')}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-t transition-colors ${
            activeTab === 'basic'
              ? 'text-[var(--text-primary)] border-b-2 border-[var(--accent)] bg-[var(--bg-elevated)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          基本
        </button>
        <button
          onClick={() => setActiveTab('advanced')}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-t transition-colors flex items-center gap-1 ${
            activeTab === 'advanced'
              ? 'text-[var(--text-primary)] border-b-2 border-[var(--accent)] bg-[var(--bg-elevated)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
          title="高级视频生成"
        >
          <Settings2 className="w-3 h-3" />
          高级
        </button>
      </div>

      {/* Advanced Panel */}
      {activeTab === 'advanced' && (
        <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg p-4">
          <AdvancedVideoPanel
            initialMode={advancedParams.mode}
            initialFps={advancedParams.fps}
            initialWidth={advancedParams.width}
            initialHeight={advancedParams.height}
            initialTimedKeyframes={advancedParams.timedKeyframes}
            initialBackground={advancedParams.backgroundImage}
            initialGridType={advancedParams.gridType}
            initialFrameIndexes={advancedParams.frameIndexes}
            isNineGridMode={isNineGridMode}
            videoPresets={videoPresets}
            onSavePreset={onSavePreset}
            onApplyPreset={onApplyPreset}
            onDeletePreset={onDeletePreset}
            shotKeyframes={shotKeyframes}
            pipelineShotData={pipelineShotData}
            fourGrid={fourGrid}
            onOpenDeduction={() => setShowDeductionModal(true)}
            onParamsChange={(params) => setAdvancedParams(prev => ({ ...prev, ...params }))}
          />
        </div>
      )}
      
      {/* Model Selector (always visible) */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block">
          选择视频模型
        </label>
        <select
          value={selectedModelId}
          onChange={(e) => {
            const newModelId = e.target.value;
            setSelectedModelId(newModelId);
            const resolvedModelId = newModelId === 'veo_3_1-fast'
              ? (veoFastQuality === '4k' ? 'veo_3_1-fast-4K' : 'veo_3_1-fast')
              : newModelId;
            onModelChange?.(resolvedModelId);
          }}
          className="w-full bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg px-3 py-2 text-xs outline-none focus:border-[var(--accent)] transition-colors"
          disabled={isGenerating}
        >
          {videoModels.map((model) => {
            const vm = model as VideoModelDefinition;
            const modeLabel = vm.params.mode === 'async' ? '异步' : '首尾帧';
            return (
              <option key={model.id} value={model.id}>
                {model.name} ({modeLabel})
              </option>
            );
          })}
        </select>
        {selectedModel && (
          <p className="text-[9px] text-[var(--text-muted)] font-mono">
            ✦ {selectedModel.name}: 
            {selectedModel.params.mode === 'async' 
              ? ` 支持 ${selectedModel.params.supportedAspectRatios.join('/')}，可选 ${selectedModel.params.supportedDurations.join('/')}秒`
              : ` 首尾帧模式，支持 ${selectedModel.params.supportedAspectRatios.join('/')}`
            }
          </p>
        )}
        {selectedModelId === 'veo_3_1-fast' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase">清晰度</span>
            <div className="flex gap-1">
              <button
                onClick={() => handleVeoFastQualityChange('standard')}
                disabled={isGenerating}
                className={`
                  px-3 py-1.5 rounded-md text-xs transition-all
                  ${veoFastQuality === 'standard'
                    ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)] hover:text-[var(--text-secondary)]'
                  }
                  ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                标准
              </button>
              <button
                onClick={() => handleVeoFastQualityChange('4k')}
                disabled={isGenerating}
                className={`
                  px-3 py-1.5 rounded-md text-xs transition-all
                  ${veoFastQuality === '4k'
                    ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)] hover:text-[var(--text-secondary)]'
                  }
                  ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                4K
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 视频设置：横竖屏 & 时长 */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block">
          视频设置
        </label>
        <VideoSettingsPanel
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          duration={duration}
          onDurationChange={setDuration}
          modelType={modelType}
          disabled={isGenerating}
          supportedAspectRatios={selectedModel?.params.supportedAspectRatios}
          supportedDurations={selectedModel?.params.supportedDurations}
        />
      </div>
      
      {/* Video Preview */}
      {videoUrl ? (
        <div className="w-full bg-[var(--bg-base)] rounded-lg overflow-hidden border border-[var(--border-secondary)] relative shadow-lg" style={{ aspectRatio: getImageAspectRatio(aspectRatio) }}>
          <video src={videoUrl} controls className="w-full h-full" />
        </div>
      ) : (
        <div className="w-full bg-[var(--nav-hover-bg)] rounded-lg border border-dashed border-[var(--border-primary)] flex items-center justify-center" style={{ aspectRatio: getImageAspectRatio(aspectRatio) }}>
          <span className="text-xs text-[var(--text-muted)] font-mono">PREVIEW AREA</span>
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate || isGenerating}
        className={`w-full py-3 rounded-lg font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
          hasVideo 
            ? 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border-secondary)]'
            : 'bg-[var(--accent)] text-[var(--text-primary)] hover:bg-[var(--accent-hover)] shadow-lg shadow-[var(--accent-shadow)]'
        } ${(!canGenerate) ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {`生成视频中 (${aspectRatio}, ${modelType === 'sora' ? `${duration}秒` : selectedModel?.name})...`}
          </>
        ) : (
          <>{hasVideo ? '重新生成视频' : '开始生成视频'}</>
        )}
      </button>

      {/* 生成进度条 */}
      {generationProgress && (
        <div className="space-y-1.5">
          <div className="h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${generationProgress.percent}%` }}
            />
          </div>
          <p className="text-[9px] text-[var(--text-muted)] text-center font-mono">
            {generationProgress.message} ({generationProgress.percent}%)
          </p>
        </div>
      )}
      
      {/* Status Messages */}
      {!hasEndFrame && (
        <div className="text-[9px] text-[var(--text-tertiary)] text-center font-mono">
          * 未检测到结束帧，将使用单图生成模式 (Image-to-Video)
        </div>
      )}

      <DeductionModal
        isOpen={showDeductionModal}
        onClose={() => setShowDeductionModal(false)}
        startKeyframeImageUrl={startKeyframeImageUrl}
        initialFourGrid={fourGrid}
        gridType={advancedParams.gridType || 4}
        onSave={handleSaveFourGrid}
        onConfirm={handleConfirmFourGrid}
      />

      <VideoConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleConfirmGenerate}
        shotId={shot.id}
        shotIndex={parseInt(shot.id.split('-')[1] || '0', 10)}
        cameraMovement={shot.cameraMovement}
        shotSize={shot.shotSize}
        actionSummary={shot.actionSummary}
        cameraChoreography={shot.cameraChoreography}
        mode={activeTab === 'advanced' ? advancedParams.mode : 'basic'}
        modelName={selectedModel?.name || effectiveModelId}
        modelProvider={selectedModel?.providerId || ''}
        aspectRatio={aspectRatio}
        duration={duration}
        fps={activeTab === 'advanced' ? advancedParams.fps : 30}
        width={activeTab === 'advanced' ? advancedParams.width : inferredResolution.width}
        height={activeTab === 'advanced' ? advancedParams.height : inferredResolution.height}
        videoPrompt={videoPrompt}
        language={projectLanguage || '中文'}
        eraContext={projectEraContext}
        fourGridDescriptions={fourGrid?.descriptions}
        nineGridPanels={shot.nineGrid?.panels}
        startKeyframeImageUrl={startKeyframeImageUrl}
        endKeyframeImageUrl={shot.keyframes?.find(k => k.type === 'end')?.imageUrl}
        refGridImageUrl={refGridImageUrl}
        backgroundImage={advancedParams.backgroundImage}
        timedKeyframeImages={timedKeyframeImages}
        gridType={advancedParams.gridType}
        frameIndexes={actualFrameIndexes}
        frameIndexesPercent={advancedParams.frameIndexes}
      />
    </div>
  );
};

export default VideoGenerator;
