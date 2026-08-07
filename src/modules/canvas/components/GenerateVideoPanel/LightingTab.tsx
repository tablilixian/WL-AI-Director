import React from 'react';
import { LIGHTING_PRESETS, type GenerationPanelState } from './types';

export const LightingTab: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const { selectedLighting, setSelectedLighting, lightingIntensity, setLightingIntensity } = panel;
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-5 gap-1.5">
        {LIGHTING_PRESETS.map((light) => (
          <button
            key={light.id}
            onClick={() => setSelectedLighting(light.id)}
            className={`p-2 rounded-lg border text-center transition-all ${
              selectedLighting === light.id
                ? 'border-yellow-500 bg-yellow-500/10'
                : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
            }`}
          >
            <div className="w-6 h-6 mx-auto mb-1 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 opacity-80" />
            <div
              className={`text-[10px] font-medium ${
                selectedLighting === light.id ? 'text-yellow-300' : 'text-gray-300'
              }`}
            >
              {light.label}
            </div>
            <div className="text-[8px] text-gray-500 mt-0.5 leading-tight line-clamp-2">
              {light.description}
            </div>
          </button>
        ))}
      </div>

      {selectedLighting !== 'none' && (
        <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-3">
          <label className="text-xs text-gray-400 flex items-center justify-between">
            <span>光照强度</span>
            <span className="text-yellow-400 font-mono">{lightingIntensity}%</span>
          </label>
          <input
            type="range"
            min={10}
            max={100}
            value={lightingIntensity}
            onChange={(e) => setLightingIntensity(parseInt(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-yellow-500 mt-1"
          />
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>自然</span>
            <span>强烈</span>
          </div>
        </div>
      )}
    </div>
  );
};
