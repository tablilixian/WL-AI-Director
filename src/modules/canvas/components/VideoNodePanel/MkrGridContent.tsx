import React from 'react';
import type { LayerData } from '../../types/canvas';
import type { VideoNodeConfig } from '../../types/video';
import { ResolvedImage } from '../ResolvedImage';

interface MkrGridContentProps {
  sourceLayers: LayerData[];
  config: VideoNodeConfig;
  updateConfig: (updater: (prev: VideoNodeConfig) => VideoNodeConfig) => void;
  totalFrames: number;
}

const MkrGridContent: React.FC<MkrGridContentProps> = ({
  sourceLayers,
  config,
  updateConfig,
  totalFrames,
}) => {
  return (
    <div className="pt-3 pb-1 space-y-3">
      {/* Reference image */}
      <div>
        <span className="text-[10px] text-gray-400 mb-2 block">参考图片（所有宫格共用）</span>
        <div className="flex items-center gap-2 flex-wrap">
          {sourceLayers.map((l) => (
            <div
              key={l.id}
              className="w-14 h-14 rounded-lg overflow-hidden border-2 border-purple-500"
              title={l.title}
            >
              {l.src && <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />}
            </div>
          ))}
        </div>
      </div>

      {/* Grid type */}
      <div>
        <span className="text-[10px] text-gray-400 mb-2 block">宫格类型</span>
        <div className="flex items-center gap-2">
          {[4, 6, 9].map((g) => (
            <button
              key={g}
              onClick={() =>
                updateConfig((prev) => ({
                  ...prev,
                  mkrGrid: {
                    gridtype: g,
                    gridFrameIndexs: new Array(g)
                      .fill(0)
                      .map((_, i) => (i === 0 ? 0 : Math.round((i * totalFrames) / (g - 1)))),
                  },
                }))
              }
              className={`px-3 py-1 text-[10px] rounded-lg border transition-colors ${
                config.mkrGrid.gridtype === g
                  ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {g} 宫格
            </button>
          ))}
        </div>
      </div>

      {/* Frame indexs */}
      <div>
        <span className="text-[10px] text-gray-400 mb-2 block">每个宫格的帧位置</span>
        <div className="grid grid-cols-3 gap-2">
          {config.mkrGrid.gridFrameIndexs.map((fi, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 bg-gray-800/40 rounded-lg px-2 py-1.5"
            >
              <span className="text-[9px] text-gray-500 w-4">#{idx + 1}</span>
              <input
                type="number"
                min={0}
                max={totalFrames}
                value={fi}
                onChange={(e) => {
                  const newIndexs = [...config.mkrGrid.gridFrameIndexs];
                  newIndexs[idx] = Math.max(0, Math.min(totalFrames, Number(e.target.value)));
                  updateConfig((prev) => ({
                    ...prev,
                    mkrGrid: { ...prev.mkrGrid, gridFrameIndexs: newIndexs },
                  }));
                }}
                className="w-14 bg-gray-900 border border-gray-700 rounded text-[9px] text-gray-300 px-1 py-0.5 text-center focus:outline-none focus:border-purple-500 font-mono"
              />
              <input
                type="range"
                min={0}
                max={totalFrames}
                value={fi}
                onChange={(e) => {
                  const newIndexs = [...config.mkrGrid.gridFrameIndexs];
                  newIndexs[idx] = Number(e.target.value);
                  updateConfig((prev) => ({
                    ...prev,
                    mkrGrid: { ...prev.mkrGrid, gridFrameIndexs: newIndexs },
                  }));
                }}
                className="flex-1 h-1 accent-purple-500"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MkrGridContent;
