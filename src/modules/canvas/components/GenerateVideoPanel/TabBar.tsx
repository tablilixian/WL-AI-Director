import React from 'react';
import { TAB_CONFIG, type GenerationPanelState } from './types';

export const TabBar: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const { activeTab, setActiveTab } = panel;
  return (
    <div className="flex border-b border-gray-700/50">
      {TAB_CONFIG.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors relative ${
            activeTab === tab.id ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {tab.icon}
          {tab.label}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
};
