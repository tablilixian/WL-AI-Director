/**
 * Layer Utilities
 * 提供图层操作相关的工具函数
 */

import { LayerData, Annotation } from '../types/canvas';

export function createLayer(
  type: LayerData['type'],
  x: number,
  y: number,
  width: number,
  height: number,
  options: Partial<LayerData> = {}
): LayerData {
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    width,
    height,
    src: '',
    title: 'New Layer',
    createdAt: Date.now(),
    ...options
  };
}

export function duplicateLayer(layer: LayerData): LayerData {
  return {
    ...layer,
    id: crypto.randomUUID(),
    x: layer.x + 20,
    y: layer.y + 20,
    title: `${layer.title} (copy)`,
    createdAt: Date.now(),
    annotations: layer.annotations?.map(ann => ({ ...ann, id: crypto.randomUUID() }))
  };
}

export function findLayerById(layers: LayerData[], id: string): LayerData | undefined {
  return layers.find(l => l.id === id);
}

export function findLayersByType(layers: LayerData[], type: LayerData['type']): LayerData[] {
  return layers.filter(l => l.type === type);
}

export function getLayerBounds(layer: LayerData): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height
  };
}

export function getLayerCenter(layer: LayerData): { x: number; y: number } {
  return {
    x: layer.x + layer.width / 2,
    y: layer.y + layer.height / 2
  };
}

export function isLayerVisible(
  layer: LayerData,
  viewportX: number,
  viewportY: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  const layerRight = layer.x + layer.width;
  const layerBottom = layer.y + layer.height;
  const viewportRight = viewportX + viewportWidth;
  const viewportBottom = viewportY + viewportHeight;

  return !(
    layerRight < viewportX ||
    layer.x > viewportRight ||
    layerBottom < viewportY ||
    layer.y > viewportBottom
  );
}

export function sortLayersByZIndex(layers: LayerData[]): LayerData[] {
  return [...layers].sort((a, b) => {
    if (a.parentId && !b.parentId) return 1;
    if (!a.parentId && b.parentId) return -1;
    return a.createdAt - b.createdAt;
  });
}

export function addAnnotationToLayer(
  layer: LayerData,
  annotation: Annotation
): LayerData {
  return {
    ...layer,
    annotations: [...(layer.annotations || []), annotation]
  };
}

export function removeAnnotationFromLayer(
  layer: LayerData,
  annotationId: string
): LayerData {
  return {
    ...layer,
    annotations: layer.annotations?.filter(a => a.id !== annotationId)
  };
}

export function updateAnnotationInLayer(
  layer: LayerData,
  annotationId: string,
  updates: Record<string, unknown>
): LayerData {
  return {
    ...layer,
    annotations: layer.annotations?.map(a =>
      a.id === annotationId ? { ...a, ...updates } as Annotation : a
    )
  };
}

export function clearLayerAnnotations(layer: LayerData): LayerData {
  return {
    ...layer,
    annotations: []
  };
}

export function getLayerGroup(
  layers: LayerData[],
  groupId: string
): LayerData[] {
  return layers.filter(l => l.parentId === groupId);
}

export function getLayerParent(
  layers: LayerData[],
  layerId: string
): LayerData | undefined {
  const layer = findLayerById(layers, layerId);
  if (!layer?.parentId) return undefined;
  return findLayerById(layers, layer.parentId);
}

export function moveLayerToGroup(
  layers: LayerData[],
  layerId: string,
  groupId: string | undefined
): LayerData[] {
  return layers.map(l =>
    l.id === layerId ? { ...l, parentId: groupId } : l
  );
}
