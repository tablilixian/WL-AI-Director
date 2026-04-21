/**
 * 时间标尺组件
 * 显示时间刻度和刻度标签
 */

import React, { useMemo } from 'react';
import { generateRulerTicks, pixelsToTime } from '../../../utils/timeCalculation';
import { formatTime } from '../../../utils/timeFormat';

interface RulerProps {
  width: number;
  height: number;
  zoom: number;
  scrollPosition: number;
  duration: number;
  onClick: (time: number) => void;
}

export const Ruler: React.FC<RulerProps> = ({
  width,
  height,
  zoom,
  scrollPosition,
  duration,
  onClick,
}) => {
  // 生成刻度点
  const ticks = useMemo(() => {
    const fullDuration = duration * 2;
    const result = generateRulerTicks(fullDuration, zoom, scrollPosition, width);
    if (result.length > 0) {
      console.log('[Ruler] ticks 详情', { width, height, tickCount: result.length, firstX: result[0]?.x, lastX: result[result.length-1]?.x });
    }
    return result;
  }, [duration, zoom, scrollPosition, width]);

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollPosition;
    const time = pixelsToTime(Math.max(0, x), zoom);
    onClick(Math.max(0, time));
  };

  return (
    <div
      data-testid="ruler"
      className="relative bg-[var(--bg-base)] border-b border-[var(--border-subtle)]"
      style={{ width, height }}
      onClick={handleClick}
    >
      {/* 刻度线 */}
      {ticks.map(({ time, x, major }) => (
        <div
          key={time}
          className="absolute top-0 w-px bg-[var(--border-subtle)]"
          style={{ 
            left: x,
            height: major ? '100%' : '40%',
            opacity: major ? 1 : 0.5,
          }}
        />
      ))}

      {/* 刻度标签 */}
      {ticks.filter(t => t.major).map(({ time, x }) => (
        <div
          key={`label-${time}`}
          className="absolute text-[9px] text-[var(--text-muted)] font-mono"
          style={{
            left: x,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          {formatTime(time)}
        </div>
      ))}

      {/* 顶部高亮线 */}
      <div className="absolute top-0 left-0 right-0 h-px bg-[var(--border-primary)]" />
    </div>
  );
};

export default Ruler;
