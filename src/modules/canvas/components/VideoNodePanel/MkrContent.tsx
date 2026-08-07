import React, { useMemo } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, Film } from 'lucide-react';
import type { LayerData } from '../../types/canvas';
import type { VideoNodeConfig } from '../../types/video';
import { ResolvedImage } from '../ResolvedImage';

interface MkrContentProps {
  sourceLayers: LayerData[];
  config: VideoNodeConfig;
  updateConfig: (updater: (prev: VideoNodeConfig) => VideoNodeConfig) => void;
  layers: LayerData[];
  totalFrames: number;
}

const MkrContent: React.FC<MkrContentProps> = ({ config, updateConfig, layers, totalFrames }) => {
  const sortedKeyframes = useMemo(
    () =>
      [...config.mkr.frames].sort((a, b) => {
        if (a.frameIndex === -1 && b.frameIndex === -1) return 0;
        if (a.frameIndex === -1) return 1;
        if (b.frameIndex === -1) return -1;
        return a.frameIndex - b.frameIndex;
      }),
    [config.mkr.frames],
  );

  const timelinePercentage = (frameIndex: number) =>
    frameIndex === -1 ? 100 : totalFrames > 0 ? (frameIndex / totalFrames) * 100 : 0;

  const availableCanvasImages = useMemo(
    () =>
      layers.filter(
        (l) => l.type === 'image' && !config.mkr.frames.some((f) => f.layerId === l.id),
      ),
    [layers, config.mkr.frames],
  );

  const updateFrameIndex = (frameLayerId: string, newIndex: number) => {
    updateConfig((prev) => ({
      ...prev,
      mkr: {
        ...prev.mkr,
        frames: prev.mkr.frames.map((f) =>
          f.layerId === frameLayerId
            ? { ...f, frameIndex: Math.max(-1, Math.min(newIndex, totalFrames)) }
            : f,
        ),
      },
    }));
  };

  const updateFramePrompt = (frameLayerId: string, prompt: string) => {
    updateConfig((prev) => ({
      ...prev,
      mkr: {
        ...prev.mkr,
        frames: prev.mkr.frames.map((f) => (f.layerId === frameLayerId ? { ...f, prompt } : f)),
      },
    }));
  };

  const removeKeyframe = (frameLayerId: string) => {
    updateConfig((prev) => ({
      ...prev,
      mkr: {
        ...prev.mkr,
        frames: prev.mkr.frames.filter((f) => f.layerId !== frameLayerId),
      },
    }));
  };

  const moveKeyframe = (frameLayerId: string, direction: -1 | 1) => {
    updateConfig((prev) => {
      const idx = prev.mkr.frames.findIndex((f) => f.layerId === frameLayerId);
      if (idx === -1) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.mkr.frames.length) return prev;
      const items = [...prev.mkr.frames];
      [items[idx], items[nextIdx]] = [items[nextIdx], items[idx]];
      return { ...prev, mkr: { ...prev.mkr, frames: items } };
    });
  };

  const addImageFromCanvas = (imageLayerId: string) => {
    const imageLayer = layers.find((l) => l.id === imageLayerId && l.type === 'image');
    if (!imageLayer || config.mkr.frames.some((f) => f.layerId === imageLayerId)) return;
    updateConfig((prev) => ({
      ...prev,
      mkr: {
        ...prev.mkr,
        frames: [
          ...prev.mkr.frames,
          {
            layerId: imageLayer.id,
            frameIndex: prev.mkr.frames.some((f) => f.frameIndex === -1)
              ? Math.round(totalFrames / 2)
              : -1,
            prompt: '',
          },
        ],
      },
    }));
  };

  return (
    <div>
      {/* Timeline */}
      <div className="pt-3 pb-1.5">
        <div className="relative h-[52px] bg-gray-800/80 rounded-lg border border-gray-700/60 overflow-hidden">
          {sortedKeyframes.map((kf) => {
            const pct = timelinePercentage(kf.frameIndex);
            const src = layers.find((l) => l.id === kf.layerId)?.src || '';
            return (
              <div
                key={kf.layerId}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 transition-all duration-200"
                style={{ left: `${pct}%` }}
              >
                <div className="w-[30px] h-[30px] rounded overflow-hidden border-2 border-purple-500 bg-gray-700 shadow-md">
                  {src && <ResolvedImage src={src} alt="" className="w-full h-full object-cover" />}
                </div>
                <span
                  className={`text-[7px] font-mono whitespace-nowrap bg-gray-900/80 px-1 rounded ${
                    kf.frameIndex === -1 ? 'text-green-400' : 'text-purple-300'
                  }`}
                >
                  {kf.frameIndex === -1 ? '结束' : `#${kf.frameIndex}`}
                </span>
              </div>
            );
          })}
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className="absolute bottom-0 w-px bg-gray-700/50"
              style={{
                left: `${(i / 8) * 100}%`,
                height: i % 4 === 0 ? '8px' : '4px',
              }}
            />
          ))}
          <div className="absolute bottom-0 left-2 text-[7px] text-gray-600">0</div>
          <div className="absolute bottom-0 right-2 text-[7px] text-gray-600">{totalFrames}</div>
        </div>
      </div>

      {/* Keyframe list */}
      <div className="space-y-1.5">
        {config.mkr.frames.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 text-gray-500 text-[10px] gap-1">
            <Film className="w-5 h-5 opacity-30" />
            <p>尚未设置关键帧</p>
          </div>
        )}
        {config.mkr.frames.map((kf, idx) => {
          const imageLayer = layers.find((l) => l.id === kf.layerId);
          const src = imageLayer?.src || '';
          const title = imageLayer?.title || '未知';
          return (
            <div
              key={kf.layerId}
              className="bg-gray-800/40 rounded-lg border border-gray-700/40 p-2 group hover:border-gray-600/60 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-purple-600 text-white text-[7px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="w-8 h-8 rounded overflow-hidden bg-gray-700 flex-shrink-0">
                    {src && (
                      <ResolvedImage src={src} alt={title} className="w-full h-full object-cover" />
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{title}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-gray-500">帧:</span>
                    {kf.frameIndex === -1 ? (
                      <span className="text-[9px] text-green-400 font-semibold flex items-center gap-1">
                        结束
                        <button
                          onClick={() => updateFrameIndex(kf.layerId, Math.round(totalFrames / 2))}
                          className="text-[8px] text-purple-400/60 hover:text-purple-400 underline"
                        >
                          设具体
                        </button>
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="range"
                          min={0}
                          max={totalFrames}
                          value={kf.frameIndex}
                          onChange={(e) => updateFrameIndex(kf.layerId, Number(e.target.value))}
                          className="w-16 h-1 accent-purple-500"
                        />
                        <input
                          type="number"
                          min={0}
                          max={totalFrames}
                          value={kf.frameIndex}
                          onChange={(e) => updateFrameIndex(kf.layerId, Number(e.target.value))}
                          className="w-10 bg-gray-900 border border-gray-700 rounded text-[9px] text-gray-300 px-0.5 py-0 text-center focus:outline-none focus:border-purple-500 font-mono"
                        />
                        <button
                          onClick={() => updateFrameIndex(kf.layerId, -1)}
                          className="text-[8px] text-purple-400/60 hover:text-purple-400 underline whitespace-nowrap"
                        >
                          结束
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={kf.prompt}
                    onChange={(e) => updateFramePrompt(kf.layerId, e.target.value)}
                    placeholder="帧描述..."
                    className="flex-1 min-w-[80px] bg-gray-900/60 border border-gray-700 rounded px-1.5 py-0.5 text-[9px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => moveKeyframe(kf.layerId, -1)}
                    disabled={idx === 0}
                    className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => moveKeyframe(kf.layerId, 1)}
                    disabled={idx === config.mkr.frames.length - 1}
                    className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => removeKeyframe(kf.layerId)}
                    className="p-0.5 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {availableCanvasImages.length > 0 && (
          <div className="flex items-center gap-1 pt-1">
            {availableCanvasImages.slice(0, 6).map((l) => (
              <button
                key={l.id}
                onClick={() => addImageFromCanvas(l.id)}
                className="w-5 h-5 rounded overflow-hidden bg-gray-700 border border-gray-600 hover:border-purple-500 transition-all relative group/img"
                title={`添加 ${l.title}`}
              >
                {l.src && (
                  <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/50 transition-colors flex items-center justify-center">
                  <Plus className="w-2.5 h-2.5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MkrContent;
