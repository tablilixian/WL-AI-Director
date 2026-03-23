/**
 * Resize Handle Component
 * 提供图层缩放控制点
 */

import React from 'react';

interface ResizeHandleProps {
  position: 'nw' | 'ne' | 'sw' | 'se';
  onMouseDown: (e: React.MouseEvent) => void;
}

const positionStyles: Record<string, string> = {
  nw: '-top-1.5 -left-1.5 cursor-nw-resize',
  ne: '-top-1.5 -right-1.5 cursor-ne-resize',
  sw: '-bottom-1.5 -left-1.5 cursor-sw-resize',
  se: '-bottom-1.5 -right-1.5 cursor-se-resize'
};

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ position, onMouseDown }) => {
  return (
    <div
      className={`absolute w-3 h-3 bg-white border border-blue-500 rounded-full hover:scale-125 transition-transform ${positionStyles[position]}`}
      onMouseDown={onMouseDown}
    />
  );
};
