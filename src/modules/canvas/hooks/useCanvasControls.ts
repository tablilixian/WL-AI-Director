/**
 * Canvas Controls Hook
 * 处理画布平移和缩放
 */

import React, { useCallback, useRef } from 'react';
import { useCanvasStore } from './useCanvasState';
import { CanvasOffset } from '../types/canvas';
import { clamp } from '../utils/canvasMath';

interface UseCanvasControlsReturn {
  handleMouseDown: (e: React.MouseEvent) => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToContent: () => void;
}

export function useCanvasControls(): UseCanvasControlsReturn {
  const { offset, scale, setOffset, setScale, layers, undo, redo } = useCanvasStore();
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isPanningRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      const newScale = clamp(scale + delta, 0.1, 5);
      setScale(newScale);
    } else {
      const newOffset: CanvasOffset = {
        x: offset.x - e.deltaX,
        y: offset.y - e.deltaY
      };
      setOffset(newOffset);
    }
  }, [offset, scale, setOffset, setScale]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    }
  }, [undo, redo]);

  const zoomIn = useCallback(() => {
    setScale(clamp(scale * 1.2, 0.1, 5));
  }, [scale, setScale]);

  const zoomOut = useCallback(() => {
    setScale(clamp(scale / 1.2, 0.1, 5));
  }, [scale, setScale]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [setScale, setOffset]);

  const fitToContent = useCallback(() => {
    if (layers.length === 0) {
      resetZoom();
      return;
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

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const padding = 50;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const scaleX = (viewportWidth - padding * 2) / contentWidth;
    const scaleY = (viewportHeight - padding * 2) / contentHeight;
    const newScale = clamp(Math.min(scaleX, scaleY), 0.1, 5);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newOffset: CanvasOffset = {
      x: viewportWidth / 2 - centerX * newScale,
      y: viewportHeight / 2 - centerY * newScale
    };

    setScale(newScale);
    setOffset(newOffset);
  }, [layers, setScale, setOffset, resetZoom]);

  return {
    handleMouseDown,
    handleWheel,
    handleKeyDown,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToContent
  };
}
