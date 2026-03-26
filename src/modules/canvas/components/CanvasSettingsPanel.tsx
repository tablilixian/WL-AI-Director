import React from 'react';

interface CanvasSettingsPanelProps {
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  gridSnap: boolean;
  onGridSnapChange: (snap: boolean) => void;
  gridSize: number;
  onGridSizeChange: (size: number) => void;
  onClose: () => void;
}

const backgroundColors = [
  { id: 'dark', name: '深色', color: '#1f2937' },
  { id: 'light', name: '浅色', color: '#f3f4f6' },
  { id: 'white', name: '白色', color: '#ffffff' },
  { id: 'black', name: '黑色', color: '#000000' },
  { id: 'blue', name: '蓝色', color: '#1e40af' },
  { id: 'green', name: '绿色', color: '#166534' },
  { id: 'red', name: '红色', color: '#991b1b' },
  { id: 'purple', name: '紫色', color: '#7c3aed' },
  { id: 'orange', name: '橙色', color: '#c2410c' },
  { id: 'pink', name: '粉色', color: '#be185d' }
];

const gridSizes = [10, 20, 50, 100];

export const CanvasSettingsPanel: React.FC<CanvasSettingsPanelProps> = ({
  backgroundColor,
  onBackgroundColorChange,
  showGrid,
  onShowGridChange,
  gridSnap,
  onGridSnapChange,
  gridSize,
  onGridSizeChange,
  onClose
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">画布设置</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-3">背景颜色</h4>
            <div className="grid grid-cols-5 gap-2">
              {backgroundColors.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => onBackgroundColorChange(bg.color)}
                  className={`w-full aspect-square rounded-lg border-2 transition-transform hover:scale-110 ${
                    backgroundColor === bg.color ? 'border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: bg.color }}
                  title={bg.name}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => onBackgroundColorChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
              />
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => onBackgroundColorChange(e.target.value)}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                placeholder="#000000"
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-3">网格设置</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">显示网格</span>
                <button
                  onClick={() => onShowGridChange(!showGrid)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    showGrid ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      showGrid ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-white">网格吸附</span>
                <button
                  onClick={() => onGridSnapChange(!gridSnap)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    gridSnap ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      gridSnap ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-white">网格大小</span>
                <select
                  value={gridSize}
                  onChange={(e) => onGridSizeChange(parseInt(e.target.value))}
                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                >
                  {gridSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
