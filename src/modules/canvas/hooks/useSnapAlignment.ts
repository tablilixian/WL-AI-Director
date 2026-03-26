/**
 * Snap Alignment Hook
 * 提供图层吸附对齐功能
 */

import { useCallback } from 'react';
import { useCanvasStore } from './useCanvasState';
import { LayerData, SnapResult, SnapGuide } from '../types/canvas';

const SNAP_THRESHOLD = 5;

interface UseSnapAlignmentOptions {
  gridSnap?: boolean;
  gridSize?: number;
}

interface UseSnapAlignmentReturn {
  calculateSnap: (draggedLayer: LayerData, newX: number, newY: number, options?: UseSnapAlignmentOptions) => SnapResult;
  getAlignmentGuides: (draggedLayer: LayerData, newX: number, newY: number) => SnapGuide[];
}

export function useSnapAlignment(): UseSnapAlignmentReturn {
  const { layers } = useCanvasStore();

  const calculateSnap = useCallback((
    draggedLayer: LayerData,
    newX: number,
    newY: number,
    options: UseSnapAlignmentOptions = {}
  ): SnapResult => {
    const { gridSnap = false, gridSize = 50 } = options;
    const guides: SnapGuide[] = [];
    let snapX = newX;
    let snapY = newY;

    if (gridSnap) {
      snapX = Math.round(newX / gridSize) * gridSize;
      snapY = Math.round(newY / gridSize) * gridSize;
      return { x: snapX, y: snapY, guides };
    }

    const draggedRight = newX + draggedLayer.width;
    const draggedBottom = newY + draggedLayer.height;
    const draggedCenterX = newX + draggedLayer.width / 2;
    const draggedCenterY = newY + draggedLayer.height / 2;

    for (const layer of layers) {
      if (layer.id === draggedLayer.id) continue;

      const layerRight = layer.x + layer.width;
      const layerBottom = layer.y + layer.height;
      const layerCenterX = layer.x + layer.width / 2;
      const layerCenterY = layer.y + layer.height / 2;

      if (Math.abs(newX - layer.x) < SNAP_THRESHOLD) {
        snapX = layer.x;
        guides.push({ type: 'vertical', position: layer.x });
      }

      if (Math.abs(draggedRight - layerRight) < SNAP_THRESHOLD) {
        snapX = layerRight - draggedLayer.width;
        guides.push({ type: 'vertical', position: layerRight });
      }

      if (Math.abs(draggedCenterX - layerCenterX) < SNAP_THRESHOLD) {
        snapX = layerCenterX - draggedLayer.width / 2;
        guides.push({ type: 'vertical', position: layerCenterX });
      }

      if (Math.abs(newY - layer.y) < SNAP_THRESHOLD) {
        snapY = layer.y;
        guides.push({ type: 'horizontal', position: layer.y });
      }

      if (Math.abs(draggedBottom - layerBottom) < SNAP_THRESHOLD) {
        snapY = layerBottom - draggedLayer.height;
        guides.push({ type: 'horizontal', position: layerBottom });
      }

      if (Math.abs(draggedCenterY - layerCenterY) < SNAP_THRESHOLD) {
        snapY = layerCenterY - draggedLayer.height / 2;
        guides.push({ type: 'horizontal', position: layerCenterY });
      }
    }

    return { x: snapX, y: snapY, guides };
  }, [layers]);

  const getAlignmentGuides = useCallback((
    draggedLayer: LayerData,
    newX: number,
    newY: number
  ): SnapGuide[] => {
    return calculateSnap(draggedLayer, newX, newY).guides;
  }, [calculateSnap]);

  return {
    calculateSnap,
    getAlignmentGuides
  };
}
