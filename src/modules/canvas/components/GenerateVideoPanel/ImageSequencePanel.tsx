import React from 'react';
import { Eye, EyeOff, ChevronDown, Maximize2, Film, Plus, Trash2, X } from 'lucide-react';
import { ResolvedImage } from '../ResolvedImage';
import { CAMERA_MOVEMENTS, type GenerationPanelState } from './types';

export const ImageSequencePanel: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const {
    imageSequence,
    setShowCanvasImagePicker,
    showCanvasImagePicker,
    imageLookup,
    canvasImageLayers,
    activePreviewLayer,
    previewCollapsed,
    setPreviewCollapsed,
    activePreviewId,
    handleItemClick,
    handleItemDoubleClick,
    selectedCamera,
    useChoreography,
    startShotSize,
    startAngle,
    endShotSize,
    endAngle,
    timingStartRatio,
    timingMoveRatio,
    timingEndRatio,
    movementPath,
    cameraIntensity,
    addImageToSequence,
    removeImageFromSequence,
    updateImagePrompt,
    moveImage,
  } = panel;
  return (
    <div className="flex flex-col h-full">
      {/* ── 图片预览区 ── */}
      <div className="border-b border-gray-700/50">
        <button
          onClick={() => setPreviewCollapsed((p) => !p)}
          className="flex items-center justify-between w-full px-4 py-2 hover:bg-gray-800/40 transition-colors"
        >
          <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-purple-400" />
            图片预览
          </h3>
          {previewCollapsed ? (
            <EyeOff className="w-3 h-3 text-gray-500" />
          ) : (
            <ChevronDown className="w-3 h-3 text-gray-500" />
          )}
        </button>

        {!previewCollapsed && (
          <div className="px-3 pb-3">
            {activePreviewLayer?.src ? (
              <div
                className="relative rounded-lg overflow-hidden bg-gray-800 cursor-pointer group/preview"
                onClick={() => handleItemClick(activePreviewLayer.id)}
                onDoubleClick={() => handleItemDoubleClick(activePreviewLayer.id)}
              >
                <ResolvedImage
                  src={activePreviewLayer.src}
                  alt={activePreviewLayer.title}
                  className="w-full h-auto max-h-[180px] object-contain"
                />
                <div className="absolute inset-0 bg-black/0 group-hover/preview:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-white bg-black/50 px-2 py-1 rounded">
                    <Maximize2 className="w-3 h-3" />
                    双击放大
                  </div>
                </div>
                <div className="absolute bottom-1 left-1 text-[9px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded">
                  {activePreviewLayer.title} · {activePreviewLayer.width}×
                  {activePreviewLayer.height}
                </div>
                {selectedCamera !== 'none' && (
                  <div className="absolute bottom-1 right-1 text-[9px] text-white/80 bg-black/60 backdrop-blur-sm px-2 py-1 rounded leading-tight max-w-[60%]">
                    {useChoreography ? (
                      <>
                        <div className="font-semibold text-purple-300">
                          📽 {CAMERA_MOVEMENTS.find((c) => c.id === selectedCamera)?.label}
                        </div>
                        <div className="text-[8px] opacity-80">
                          {startShotSize}/{startAngle} → {endShotSize}/{endAngle}
                        </div>
                        <div className="text-[8px] opacity-60">
                          {Math.round(timingStartRatio * 100)}%/{Math.round(timingMoveRatio * 100)}
                          %/{Math.round(timingEndRatio * 100)}%
                        </div>
                        {movementPath && (
                          <div className="text-[8px] opacity-70 truncate">{movementPath}</div>
                        )}
                      </>
                    ) : (
                      <div>
                        {CAMERA_MOVEMENTS.find((c) => c.id === selectedCamera)?.label} 强度
                        {cameraIntensity}/10
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-[10px] text-gray-600 bg-gray-800/40 rounded-lg border border-dashed border-gray-700">
                {imageSequence.length > 0 ? '点击下方图片预览' : '请先添加图片'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 图片序列列表 ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/50">
        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-purple-400" />
          图片序列
          <span className="text-[10px] text-gray-500 font-normal">({imageSequence.length}张)</span>
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {imageSequence.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs gap-2">
            <Film className="w-6 h-6 opacity-30" />
            <p>尚未选择图片</p>
            <p className="text-[10px]">从下方添加画布上的图片</p>
          </div>
        )}

        {imageSequence.map((item, idx) => {
          const layer = imageLookup.get(item.layerId);
          if (!layer) return null;
          const isActive = activePreviewId === item.layerId;
          return (
            <div
              key={item.layerId}
              className={`rounded-lg border overflow-hidden group cursor-pointer transition-all ${
                isActive
                  ? 'border-purple-500/60 bg-purple-500/5'
                  : 'border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/60'
              }`}
              onClick={() => handleItemClick(item.layerId)}
              onDoubleClick={() => handleItemDoubleClick(item.layerId)}
            >
              <div className="flex items-start gap-2 p-2">
                <div className="flex flex-col items-center gap-0.5 pt-0.5">
                  <span
                    className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                      isActive ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {item.order}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveImage(item.layerId, -1);
                    }}
                    disabled={idx === 0}
                    className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
                  >
                    <ChevronDown className="w-2.5 h-2.5 rotate-180" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveImage(item.layerId, 1);
                    }}
                    disabled={idx === imageSequence.length - 1}
                    className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
                  >
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded overflow-hidden bg-gray-700 flex-shrink-0">
                      {layer.src && (
                        <ResolvedImage
                          src={layer.src}
                          alt={layer.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-[11px] text-gray-300 truncate">{layer.title}</p>
                      <p className="text-[9px] text-gray-600">
                        {layer.width}×{layer.height}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImageFromSequence(item.layerId);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-0.5 mt-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-1">
                    <input
                      type="text"
                      value={item.imagePrompt}
                      onChange={(e) => updateImagePrompt(item.layerId, e.target.value)}
                      placeholder={`描述图片${item.order}在此镜头的动作/表情...`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-gray-900/60 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-2 py-2 border-t border-gray-700/50">
        {showCanvasImagePicker ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-2 max-h-36 overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-gray-400">选择画布上的图片</span>
              <button
                onClick={() => setShowCanvasImagePicker(false)}
                className="text-gray-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {canvasImageLayers.length === 0 ? (
              <p className="text-[9px] text-gray-600 text-center py-2">画布上没有其他可用的图片</p>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {canvasImageLayers.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      addImageToSequence(l.id);
                      setShowCanvasImagePicker(false);
                    }}
                    className="relative group/img aspect-[4/3] rounded overflow-hidden bg-gray-700 border border-transparent hover:border-purple-500 transition-all"
                  >
                    <ResolvedImage
                      src={l.src}
                      alt={l.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
                      <Plus className="w-3 h-3 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowCanvasImagePicker(true)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-800/60 rounded-lg border border-dashed border-gray-700 hover:border-gray-600 transition-all"
          >
            <Plus className="w-3 h-3" />
            从画布添加图片
          </button>
        )}
      </div>
    </div>
  );
};
