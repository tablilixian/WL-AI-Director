import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData } from '../types/canvas';

interface LayerDetailPanelProps {
  onClose: () => void;
}

const operationLabels: Record<string, string> = {
  'text-to-image': '文生图',
  'image-to-image': '图生图',
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
  'mkr-video': 'MKR 视频',
  'style-transfer': '风格迁移',
  'direct-style-transfer': '直接风格迁移',
  'ipa-style-transfer': 'IPA风格迁移',
  'background-replace': '背景替换',
  'expand': '图片扩展',
  'background-remove': '智能抠图',
  'variant': '图片变体',
  'import': '导入',
  'drawing': '绘图',
  'visual-language': 'AI 视觉分析',
  '4grid': '四宫格剧情推演',
  '9grid': '九宫格',
  '25grid': '二十五宫格',
  'multi-angle': '多角度',
  'three-view': '三视图',
  'lighting': '光照控制',
  'inpaint': '局部重绘',
  'panorama-generation': '全景图生成',
  'panorama-screenshot': '全景截图',
  'storyboard-deduction': '剧情推演'
};

const operationIcons: Record<string, string> = {
  'text-to-image': '📝',
  'image-to-image': '🖼️',
  'text-to-video': '🎬',
  'image-to-video': '📹',
  'mkr-video': '🎞️',
  'style-transfer': '🎨',
  'direct-style-transfer': '🎨',
  'ipa-style-transfer': '✨',
  'background-replace': '🌅',
  'expand': '↔️',
  'background-remove': '✂️',
  'variant': '🔄',
  'import': '📥',
  'drawing': '✏️',
  'visual-language': '🧠',
  '4grid': '📖',
  '9grid': '🔲',
  '25grid': '🔳',
  'multi-angle': '🔄',
  'three-view': '📐',
  'lighting': '💡',
  'inpaint': '🖌️',
  'panorama-generation': '🌄',
  'panorama-screenshot': '📷',
  'storyboard-deduction': '📋'
};

const layerTypeLabels: Record<string, string> = {
  'image': '图片',
  'video': '视频',
  'sticky': '便签',
  'text': '文字',
  'group': '分组',
  'drawing': '绘制',
  'audio': '音频'
};

export const LayerDetailPanel: React.FC<LayerDetailPanelProps> = ({ onClose }) => {
  const { layers, selectedLayerId, updateLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const sourceLayer = selectedLayer?.sourceLayerId 
    ? layers.find(l => l.id === selectedLayer.sourceLayerId) 
    : null;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(selectedLayer?.title || '');

  const handleTitleSubmit = () => {
    if (titleInput.trim() && selectedLayer) {
      updateLayer(selectedLayer.id, { title: titleInput.trim() });
    }
    setEditingTitle(false);
  };

  if (!selectedLayer) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" onClick={onClose}>
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">图层详情</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一个图层，然后再查看详细信息。
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getOperationHistory = (layer: LayerData): Array<{ layer: LayerData; operation: string }> => {
    const history: Array<{ layer: LayerData; operation: string }> = [];
    let currentLayer: LayerData | undefined = layer;

    while (currentLayer) {
      if (currentLayer.operationType) {
        history.unshift({
          layer: currentLayer,
          operation: currentLayer.operationType
        });
      }
      currentLayer = currentLayer.sourceLayerId 
        ? layers.find(l => l.id === currentLayer!.sourceLayerId)
        : undefined;
    }

    return history;
  };

  const operationHistory = getOperationHistory(selectedLayer);
  const showGenerationPrompt = !!(selectedLayer.generationPrompt && 
    (selectedLayer.operationType === 'text-to-image' || selectedLayer.operationType === 'text-to-video' || selectedLayer.operationType === 'image-to-image'));
  const [showHistory, setShowHistory] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" onClick={onClose}>
      <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">图层详情</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {selectedLayer.src && (
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="aspect-video">
                {selectedLayer.type === 'video' ? (
                  <video
                    src={selectedLayer.src}
                    className="w-full h-full object-contain"
                    controls
                    muted
                    loop
                  />
                ) : (
                  <img
                    src={selectedLayer.src}
                    alt={selectedLayer.title}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {selectedLayer.operationType && (
              <span className="text-lg">{operationIcons[selectedLayer.operationType]}</span>
            )}
            {editingTitle ? (
              <input
                type="text"
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTitleSubmit();
                  if (e.key === 'Escape') { setEditingTitle(false); setTitleInput(selectedLayer.title); }
                }}
                className="flex-1 bg-gray-700 text-white text-base font-medium px-2 py-1 rounded outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <span
                className="text-base font-medium text-[var(--text-primary)] cursor-pointer hover:text-blue-400 transition-colors"
                onClick={() => { setEditingTitle(true); setTitleInput(selectedLayer.title); }}
              >
                {selectedLayer.title}
              </span>
            )}
            <button
              onClick={() => { setEditingTitle(true); setTitleInput(selectedLayer.title); }}
              className="text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>

          {showGenerationPrompt && (
            <div className="bg-gray-800/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowPrompt(!showPrompt)}
                className="w-full flex items-center justify-between p-3 text-sm font-medium text-blue-300 hover:text-blue-200 transition-colors"
              >
                <span>{operationLabels[selectedLayer.operationType!]} 提示词</span>
                <svg className={`w-4 h-4 transition-transform ${showPrompt ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showPrompt && (
                <div className="px-3 pb-3">
                  <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
                    <p className="text-sm text-blue-100 leading-relaxed whitespace-pre-wrap break-words">
                      {selectedLayer.generationPrompt}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">类型</div>
              <div className="text-sm text-white">{layerTypeLabels[selectedLayer.type] || selectedLayer.type}</div>
            </div>
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">尺寸</div>
              <div className="text-sm text-white">{Math.round(selectedLayer.width)} × {Math.round(selectedLayer.height)}</div>
            </div>
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">位置</div>
              <div className="text-sm text-white">({Math.round(selectedLayer.x)}, {Math.round(selectedLayer.y)})</div>
            </div>
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">创建时间</div>
              <div className="text-sm text-white">{formatDate(selectedLayer.createdAt)}</div>
            </div>
          </div>

          <div className="p-3 bg-gray-800/50 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500">生成方式</span>
              <div className="text-sm text-white flex items-center gap-1 mt-0.5">
                {selectedLayer.operationType && (
                  <span>{operationIcons[selectedLayer.operationType]}</span>
                )}
                {operationLabels[selectedLayer.operationType || 'import'] || '未知'}
              </div>
            </div>
            {sourceLayer && (
              <div className="text-right">
                <span className="text-xs text-gray-500">来源图层</span>
                <div className="text-sm text-white mt-0.5">{sourceLayer.title}</div>
              </div>
            )}
          </div>

          {operationHistory.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                <span>操作历史 ({operationHistory.length})</span>
                <svg className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showHistory && (
                <div className="px-3 pb-3 space-y-2">
                  {operationHistory.map((item, index) => (
                    <div key={item.layer.id} className="p-2 bg-gray-700/50 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-lg shrink-0">{operationIcons[item.operation]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{item.layer.title}</div>
                          <div className="text-xs text-gray-400">
                            {operationLabels[item.operation] || item.operation}
                          </div>
                        </div>
                        {index < operationHistory.length - 1 && (
                          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        )}
                      </div>
                      {item.layer.generationPrompt && (
                        <div className="mt-1.5 text-[11px] text-gray-500 leading-relaxed line-clamp-2 pl-7">
                          提示词: {item.layer.generationPrompt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
