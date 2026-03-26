import React from 'react';
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
  'style-transfer': '风格迁移',
  'background-replace': '背景替换',
  'expand': '图片扩展',
  'background-remove': '智能抠图',
  'variant': '图片变体',
  'import': '导入',
  'drawing': '绘图'
};

const operationIcons: Record<string, string> = {
  'text-to-image': '📝',
  'image-to-image': '🖼️',
  'text-to-video': '🎬',
  'image-to-video': '📹',
  'style-transfer': '🎨',
  'background-replace': '🌅',
  'expand': '↔️',
  'background-remove': '✂️',
  'variant': '🔄',
  'import': '📥',
  'drawing': '✏️'
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
  const { layers, selectedLayerId } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const sourceLayer = selectedLayer?.sourceLayerId 
    ? layers.find(l => l.id === selectedLayer.sourceLayerId) 
    : null;

  if (!selectedLayer) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto">
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
          <div className="p-4 bg-gray-800 rounded-lg">
            <h4 className="text-sm font-medium text-gray-400 mb-2">基本信息</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">名称</span>
                <span className="text-sm text-white">{selectedLayer.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">类型</span>
                <span className="text-sm text-white">
                  {layerTypeLabels[selectedLayer.type] || selectedLayer.type}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">尺寸</span>
                <span className="text-sm text-white">
                  {Math.round(selectedLayer.width)} × {Math.round(selectedLayer.height)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">位置</span>
                <span className="text-sm text-white">
                  ({Math.round(selectedLayer.x)}, {Math.round(selectedLayer.y)})
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800 rounded-lg">
            <h4 className="text-sm font-medium text-gray-400 mb-2">来源信息</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">生成方式</span>
                <span className="text-sm text-white flex items-center gap-1">
                  {selectedLayer.operationType && (
                    <span>{operationIcons[selectedLayer.operationType]}</span>
                  )}
                  {operationLabels[selectedLayer.operationType || 'import'] || '未知'}
                </span>
              </div>
              {sourceLayer && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">来源图层</span>
                  <span className="text-sm text-white">{sourceLayer.title}</span>
                </div>
              )}
            </div>
          </div>

          {operationHistory.length > 0 && (
            <div className="p-4 bg-gray-800 rounded-lg">
              <h4 className="text-sm font-medium text-gray-400 mb-2">操作历史</h4>
              <div className="space-y-2">
                {operationHistory.map((item, index) => (
                  <div 
                    key={item.layer.id}
                    className="flex items-center gap-2 p-2 bg-gray-700 rounded"
                  >
                    <span className="text-lg">{operationIcons[item.operation]}</span>
                    <div className="flex-1">
                      <div className="text-sm text-white">{item.layer.title}</div>
                      <div className="text-xs text-gray-400">
                        {operationLabels[item.operation] || item.operation}
                      </div>
                    </div>
                    {index < operationHistory.length - 1 && (
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 bg-gray-800 rounded-lg">
            <h4 className="text-sm font-medium text-gray-400 mb-2">时间信息</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">创建时间</span>
                <span className="text-sm text-white">
                  {formatDate(selectedLayer.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {selectedLayer.src && (
            <div className="p-4 bg-gray-800 rounded-lg">
              <h4 className="text-sm font-medium text-gray-400 mb-2">预览</h4>
              <div className="aspect-video bg-gray-900 rounded overflow-hidden">
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
