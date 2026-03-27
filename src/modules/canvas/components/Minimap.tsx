/**
 * Minimap Component
 * 提供画布小地图导航功能
 */

import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData } from '../types/canvas';

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;
const PADDING = 20;

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const Minimap: React.FC = () => {
  const { layers, offset, scale, setOffset } = useCanvasStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const contentBounds = useMemo((): Bounds => {
    if (layers.length === 0) {
      return { x: 0, y: 0, width: 1000, height: 1000 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const layer of layers) {
      minX = Math.min(minX, layer.x);
      minY = Math.min(minY, layer.y);
      maxX = Math.max(maxX, layer.x + layer.width);
      maxY = Math.max(maxY, layer.y + layer.height);
    }

    return {
      x: minX - PADDING,
      y: minY - PADDING,
      width: Math.max(maxX - minX + PADDING * 2, 1000),
      height: Math.max(maxY - minY + PADDING * 2, 1000)
    };
  }, [layers]);

  const viewportBounds = useMemo((): Bounds => {
    const viewportWidth = window.innerWidth / scale;
    const viewportHeight = window.innerHeight / scale;
    return {
      x: -offset.x / scale,
      y: -offset.y / scale,
      width: viewportWidth,
      height: viewportHeight
    };
  }, [offset, scale]);

  const worldToMinimap = useCallback((worldX: number, worldY: number) => {
    const scaleX = MINIMAP_WIDTH / contentBounds.width;
    const scaleY = MINIMAP_HEIGHT / contentBounds.height;
    const fitScale = Math.min(scaleX, scaleY);

    return {
      x: (worldX - contentBounds.x) * fitScale,
      y: (worldY - contentBounds.y) * fitScale,
      scale: fitScale
    };
  }, [contentBounds]);

  const minimapToWorld = useCallback((minimapX: number, minimapY: number) => {
    const scaleX = MINIMAP_WIDTH / contentBounds.width;
    const scaleY = MINIMAP_HEIGHT / contentBounds.height;
    const fitScale = Math.min(scaleX, scaleY);

    return {
      x: minimapX / fitScale + contentBounds.x,
      y: minimapY / fitScale + contentBounds.y
    };
  }, [contentBounds]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const minimapX = e.clientX - rect.left;
    const minimapY = e.clientY - rect.top;
    const worldPos = minimapToWorld(minimapX, minimapY);

    setOffset({
      x: window.innerWidth / 2 - worldPos.x * scale,
      y: window.innerHeight / 2 - worldPos.y * scale
    });
  }, [isDragging, minimapToWorld, scale, setOffset]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const minimapX = e.clientX - rect.left;
      const minimapY = e.clientY - rect.top;
      const worldPos = minimapToWorld(minimapX, minimapY);

      setOffset({
        x: window.innerWidth / 2 - worldPos.x * scale,
        y: window.innerHeight / 2 - worldPos.y * scale
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minimapToWorld, scale, setOffset]);

  const layerColors: Record<LayerData['type'], string> = {
    image: '#f59e0b',
    video: '#8b5cf6',
    audio: '#10b981',
    sticky: '#fbbf24',
    text: '#fafaf9',
    group: 'rgba(99, 102, 241, 0.5)',
    drawing: '#f472b6',
    prompt: '#3b82f6'
  };

  return (
    <div
      ref={containerRef}
      className="absolute bottom-4 right-4 z-50 rounded-lg overflow-hidden shadow-lg select-none bg-gray-900/85 backdrop-blur-sm border border-gray-700"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onClick={handleClick}
    >
      <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT}>
        {layers.map((layer) => {
          const pos = worldToMinimap(layer.x, layer.y);
          const width = Math.max(layer.width * pos.scale, 2);
          const height = Math.max(layer.height * pos.scale, 2);

          return (
            <rect
              key={layer.id}
              x={pos.x}
              y={pos.y}
              width={width}
              height={height}
              fill={layerColors[layer.type]}
              opacity={0.8}
            />
          );
        })}

        {(() => {
          const vp = worldToMinimap(viewportBounds.x, viewportBounds.y);
          const vpWidth = viewportBounds.width * vp.scale;
          const vpHeight = viewportBounds.height * vp.scale;

          return (
            <rect
              x={vp.x}
              y={vp.y}
              width={vpWidth}
              height={vpHeight}
              fill="transparent"
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth={1}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
              onMouseDown={handleMouseDown}
            />
          );
        })()}
      </svg>
    </div>
  );
};
