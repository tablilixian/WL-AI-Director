import React, { useState } from 'react';

export type DrawingTool = 'select' | 'pencil' | 'rectangle' | 'arrow' | 'text';

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  strokeColor: string;
  onStrokeColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
}

const colors = ['#ffffff', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
const strokeWidths = [2, 4, 6, 8, 12];

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  onToolChange,
  strokeColor,
  onStrokeColorChange,
  strokeWidth,
  onStrokeWidthChange
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="absolute top-1/2 left-4 -translate-y-1/2 z-50 flex flex-col items-center gap-1 bg-gray-800/90 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-gray-700">
      <button
        onClick={() => onToolChange('select')}
        className={`p-2 rounded-md transition-colors ${
          activeTool === 'select'
            ? 'bg-blue-600 text-white'
            : 'hover:bg-gray-700 text-gray-300 hover:text-white'
        }`}
        title="选择工具"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      </button>

      <button
        onClick={() => onToolChange('pencil')}
        className={`p-2 rounded-md transition-colors ${
          activeTool === 'pencil'
            ? 'bg-blue-600 text-white'
            : 'hover:bg-gray-700 text-gray-300 hover:text-white'
        }`}
        title="铅笔工具"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>

      <button
        onClick={() => onToolChange('rectangle')}
        className={`p-2 rounded-md transition-colors ${
          activeTool === 'rectangle'
            ? 'bg-blue-600 text-white'
            : 'hover:bg-gray-700 text-gray-300 hover:text-white'
        }`}
        title="矩形工具"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <button
        onClick={() => onToolChange('arrow')}
        className={`p-2 rounded-md transition-colors ${
          activeTool === 'arrow'
            ? 'bg-blue-600 text-white'
            : 'hover:bg-gray-700 text-gray-300 hover:text-white'
        }`}
        title="箭头工具"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </button>

      <div className="w-6 h-px bg-gray-600 my-1" />

      <div className="relative">
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="p-2 hover:bg-gray-700 rounded-md transition-colors"
          title="颜色选择"
        >
          <div
            className="w-4 h-4 rounded-full border border-gray-500"
            style={{ backgroundColor: strokeColor }}
          />
        </button>

        {showColorPicker && (
          <div className="absolute left-full top-0 ml-2 p-2 bg-gray-800 rounded-lg shadow-lg border border-gray-700 flex gap-1">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onStrokeColorChange(color);
                  setShowColorPicker(false);
                }}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  strokeColor === color ? 'border-white' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </div>

      <select
        value={strokeWidth}
        onChange={(e) => onStrokeWidthChange(parseInt(e.target.value))}
        className="bg-gray-700 text-white text-xs rounded px-1 py-1 border border-gray-600 focus:outline-none focus:border-blue-500 w-10"
        title="线条粗细"
      >
        {strokeWidths.map((width) => (
          <option key={width} value={width}>
            {width}
          </option>
        ))}
      </select>
    </div>
  );
};
