/**
 * 播放头组件
 * 显示当前播放位置的竖线
 */

import React from 'react';
import { formatTime } from '../../../utils/timeFormat';

interface PlayheadProps {
  x: number;
  height: number;
  currentTime: number;
}

export const Playhead: React.FC<PlayheadProps> = ({ x, height, currentTime }) => {
  return (
    <div
      className="absolute top-0 z-30 pointer-events-none"
      style={{ left: x }}
    >
      {/* 播放头顶部三角形 */}
      <div 
        className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 
                   border-l-[6px] border-l-transparent
                   border-r-[6px] border-r-transparent
                   border-t-[8px] border-t-red-500"
      />

      {/* 播放头竖线 */}
      <div 
        className="w-0.5 bg-red-500 shadow-sm"
        style={{ height }}
      />

      {/* 时间显示 */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 -translate-y-full">
        <div className="bg-red-500 text-white text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap">
          {formatTime(currentTime)}
        </div>
      </div>
    </div>
  );
};

export default Playhead;
