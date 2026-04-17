import React from 'react';

interface SnapLineProps {
  x: number;
  height: number;
  label?: string;
}

export const SnapLine: React.FC<SnapLineProps> = ({ x, height, label }) => {
  return (
    <div
      className="absolute top-0 w-px pointer-events-none z-40"
      style={{
        left: x,
        height,
        backgroundColor: '#22c55e',
        boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
      }}
    >
      {label && (
        <div
          className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap"
          style={{
            backgroundColor: '#22c55e',
            color: '#fff',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
