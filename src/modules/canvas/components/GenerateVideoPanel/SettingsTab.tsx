import React from 'react';
import { Settings, Clock } from 'lucide-react';
import { VIDEO_SIZE_PRESETS, type GenerationPanelState } from './types';

export const SettingsTab: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const {
    selectedSizePreset,
    setSelectedSizePreset,
    useCustomSize,
    setUseCustomSize,
    customWidth,
    setCustomWidth,
    customHeight,
    setCustomHeight,
    currentSize,
    durationMs,
    durationInput,
    durationInputRef,
    handleDurationSlider,
    handleDurationInput,
  } = panel;
  return (
    <div className="p-4 space-y-5">
      {/* 尺寸选择 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-2">
          <Settings className="w-3.5 h-3.5 text-gray-400" />
          视频尺寸
        </label>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {VIDEO_SIZE_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              onClick={() => {
                setSelectedSizePreset(i);
                setUseCustomSize(false);
              }}
              className={`px-2.5 py-2 text-xs rounded-lg border transition-all ${
                !useCustomSize && selectedSizePreset === i
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5">
                {preset.width}×{preset.height}
              </div>
            </button>
          ))}
          <button
            onClick={() => setUseCustomSize(true)}
            className={`px-2.5 py-2 text-xs rounded-lg border transition-all ${
              useCustomSize
                ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600 hover:text-gray-200'
            }`}
          >
            <div className="font-medium">自定义</div>
            <div className="text-[10px] opacity-60 mt-0.5">自定尺寸</div>
          </button>
        </div>
        {useCustomSize && (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              value={customWidth}
              onChange={(e) => setCustomWidth(parseInt(e.target.value) || 720)}
              min={256}
              max={4096}
              step={2}
              className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 text-center focus:outline-none focus:border-purple-500/50"
            />
            <span className="text-gray-500 text-xs">×</span>
            <input
              type="number"
              value={customHeight}
              onChange={(e) => setCustomHeight(parseInt(e.target.value) || 720)}
              min={256}
              max={4096}
              step={2}
              className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 text-center focus:outline-none focus:border-purple-500/50"
            />
            <span className="text-[10px] text-gray-600">px</span>
          </div>
        )}
        <div className="text-[10px] text-gray-600 mt-1.5">
          当前: {currentSize.width}×{currentSize.height}px
        </div>
      </div>

      {/* 时长 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-2">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          视频时长
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={3000}
            max={15000}
            step={100}
            value={durationMs}
            onChange={handleDurationSlider}
            className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
          />
          <input
            ref={durationInputRef}
            type="text"
            value={durationInput}
            onChange={handleDurationInput}
            className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 text-center focus:outline-none focus:border-purple-500/50 font-mono"
          />
          <span className="text-xs text-gray-500">秒</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>3秒</span>
          <span className={durationMs < 3000 || durationMs > 15000 ? 'text-red-400' : ''}>
            {durationMs}ms
          </span>
          <span>15秒</span>
        </div>
      </div>

      {/* 模型信息 */}
      <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-3">
        <div className="text-[10px] text-gray-500 space-y-0.5">
          <p>• 视频尺寸将按实际比例传递给 AI 模型</p>
          <p>• 时长精确到毫秒，模型会根据支持的时长做适配</p>
          <p>• 部分模型不支持竖屏(9:16)或方形(1:1)，会在生成时自动处理</p>
        </div>
      </div>
    </div>
  );
};
