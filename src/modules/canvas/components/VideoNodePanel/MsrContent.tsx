import React from 'react';
import { Camera, Sun, Mic, Trash2, Plus } from 'lucide-react';
import type { LayerData } from '../../types/canvas';
import { CAMERA_PRESETS, LIGHTING_PRESETS, type VideoNodeConfig } from '../../types/video';
import { ResolvedImage } from '../ResolvedImage';

interface MsrContentProps {
  sourceLayers: LayerData[];
  config: VideoNodeConfig;
  updateConfig: (updater: (prev: VideoNodeConfig) => VideoNodeConfig) => void;
  layers: LayerData[];
}

const MsrContent: React.FC<MsrContentProps> = ({ sourceLayers, config, updateConfig, layers }) => {
  const availableImages = layers.filter((l) => l.type === 'image' && !l.isLoading && l.src);

  return (
    <div className="pt-3 pb-1 space-y-3">
      {/* Reference images */}
      <div>
        <span className="text-[10px] text-gray-400 mb-2 block">
          参考图片（第一张为起始帧，可选第二张为结束帧）
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {availableImages.map((l) => {
            const isSelected = sourceLayers.some((sl) => sl.id === l.id);
            return (
              <div
                key={l.id}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-purple-500 ring-1 ring-purple-500/50'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
                title={l.title}
              >
                {l.src && (
                  <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Camera */}
      <details className="group">
        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 flex items-center gap-1.5">
          <Camera className="w-3 h-3" />
          运镜设置
        </summary>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {CAMERA_PRESETS.map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  updateConfig((prev) => ({
                    ...prev,
                    msr: { ...prev.msr, cameraPreset: c.id },
                  }))
                }
                className={`px-2 py-1 text-[9px] rounded-lg border transition-colors ${
                  config.msr.cameraPreset === c.id
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {config.msr.cameraPreset && config.msr.cameraPreset !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500">强度:</span>
              <input
                type="range"
                min={1}
                max={10}
                value={config.msr.cameraIntensity ?? 5}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    msr: { ...prev.msr, cameraIntensity: Number(e.target.value) },
                  }))
                }
                className="w-24 h-1 accent-purple-500"
              />
              <span className="text-[9px] text-gray-400 w-4">{config.msr.cameraIntensity}</span>
            </div>
          )}
        </div>
      </details>

      {/* Lighting */}
      <details className="group">
        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 flex items-center gap-1.5">
          <Sun className="w-3 h-3" />
          光照设置
        </summary>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {LIGHTING_PRESETS.map((l) => (
              <button
                key={l.id}
                onClick={() =>
                  updateConfig((prev) => ({
                    ...prev,
                    msr: { ...prev.msr, lightingPreset: l.id },
                  }))
                }
                className={`px-2 py-1 text-[9px] rounded-lg border transition-colors ${
                  config.msr.lightingPreset === l.id
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          {config.msr.lightingPreset && config.msr.lightingPreset !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500">强度:</span>
              <input
                type="range"
                min={1}
                max={10}
                value={config.msr.lightingIntensity ?? 5}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    msr: { ...prev.msr, lightingIntensity: Number(e.target.value) },
                  }))
                }
                className="w-24 h-1 accent-purple-500"
              />
              <span className="text-[9px] text-gray-400 w-4">{config.msr.lightingIntensity}</span>
            </div>
          )}
        </div>
      </details>

      {/* Dialogue */}
      <details className="group">
        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 flex items-center gap-1.5">
          <Mic className="w-3 h-3" />
          对白 / 旁白
        </summary>
        <div className="mt-2 space-y-1.5">
          {(config.msr.dialogues ?? []).map((d, idx) => (
            <div key={d.id} className="flex items-center gap-1.5">
              <input
                type="text"
                value={d.speaker ?? ''}
                onChange={(e) => {
                  const newDialogues = [...(config.msr.dialogues ?? [])];
                  newDialogues[idx] = { ...newDialogues[idx], speaker: e.target.value };
                  updateConfig((prev) => ({
                    ...prev,
                    msr: { ...prev.msr, dialogues: newDialogues },
                  }));
                }}
                placeholder="说话人"
                className="w-16 bg-gray-900/60 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
              <input
                type="text"
                value={d.text}
                onChange={(e) => {
                  const newDialogues = [...(config.msr.dialogues ?? [])];
                  newDialogues[idx] = { ...newDialogues[idx], text: e.target.value };
                  updateConfig((prev) => ({
                    ...prev,
                    msr: { ...prev.msr, dialogues: newDialogues },
                  }));
                }}
                placeholder="对白内容"
                className="flex-1 bg-gray-900/60 border border-gray-700 rounded px-1.5 py-0.5 text-[9px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={() => {
                  const newDialogues = (config.msr.dialogues ?? []).filter((_, i) => i !== idx);
                  updateConfig((prev) => ({
                    ...prev,
                    msr: { ...prev.msr, dialogues: newDialogues },
                  }));
                }}
                className="p-0.5 text-gray-500 hover:text-red-400"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newId = `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              updateConfig((prev) => ({
                ...prev,
                msr: {
                  ...prev.msr,
                  dialogues: [
                    ...(prev.msr.dialogues ?? []),
                    { id: newId, startTime: 0, endTime: 0, text: '', speaker: '' },
                  ],
                },
              }));
            }}
            className="flex items-center gap-1 text-[9px] text-purple-400 hover:text-purple-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            添加对白
          </button>
        </div>
      </details>
    </div>
  );
};

export default MsrContent;
