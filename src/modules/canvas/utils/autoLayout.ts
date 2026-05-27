import { LayerData } from '../types/canvas';

interface LayoutCluster {
  parent?: LayerData;
  children: LayerData[];
  layers: LayerData[];
  centerX: number;
}

const CLUSTER_GAP = 200;
const ROW_GAP = 200;
const PARENT_CHILD_GAP = 240;
const VERTICAL_GAP = 200;
const PADDING = 240;

/** Build a map of layerId → layers whose sourceLayerId points to it */
function buildSourceChildrenMap(visibleLayers: LayerData[]): Map<string, LayerData[]> {
  const map = new Map<string, LayerData[]>();
  for (const layer of visibleLayers) {
    if (layer.sourceLayerId) {
      const list = map.get(layer.sourceLayerId) || [];
      list.push(layer);
      map.set(layer.sourceLayerId, list);
    }
  }
  return map;
}

/**
 * Group layers into rows.
 * - Layers that overlap vertically >50% are in the same row
 * - Layers linked via sourceLayerId are pulled into the same row as their source
 */
function detectRows(
  visibleLayers: LayerData[],
  sourceChildrenMap: Map<string, LayerData[]>,
): LayerData[][] {
  const sorted = [...visibleLayers].sort((a, b) => a.y - b.y);
  const rows: LayerData[][] = [];
  const usedIds = new Set<string>();

  for (const layer of sorted) {
    if (usedIds.has(layer.id)) continue;

    let placed = false;
    for (const row of rows) {
      const overlaps = row.some(existing => {
        const overlapStart = Math.max(layer.y, existing.y);
        const overlapEnd = Math.min(layer.y + layer.height, existing.y + existing.height);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        const minH = Math.min(layer.height, existing.height);
        return overlap > minH * 0.5;
      });
      if (overlaps) {
        row.push(layer);
        usedIds.add(layer.id);
        // Pull source children into the same row
        const srcChildren = sourceChildrenMap.get(layer.id) || [];
        for (const child of srcChildren) {
          if (!usedIds.has(child.id)) {
            row.push(child);
            usedIds.add(child.id);
          }
        }
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newRow: LayerData[] = [layer];
      usedIds.add(layer.id);
      const srcChildren = sourceChildrenMap.get(layer.id) || [];
      for (const child of srcChildren) {
        if (!usedIds.has(child.id)) {
          newRow.push(child);
          usedIds.add(child.id);
        }
      }
      rows.push(newRow);
    }
  }

  return rows;
}

/**
 * Within a row, group layers into clusters:
 * - parentId-based groups
 * - sourceLayerId-based groups
 * - standalone layers as individual clusters
 */
function buildClustersFromRow(
  row: LayerData[],
  sourceChildrenMap: Map<string, LayerData[]>,
): LayoutCluster[] {
  const clusters: LayoutCluster[] = [];
  const usedIds = new Set<string>();

  // 1. parentId-based grouping
  const byParentId = new Map<string, LayerData[]>();
  for (const layer of row) {
    if (layer.parentId) {
      const list = byParentId.get(layer.parentId) || [];
      list.push(layer);
      byParentId.set(layer.parentId, list);
    }
  }
  for (const [parentId, children] of byParentId) {
    const parent = row.find(l => l.id === parentId);
    if (parent) {
      usedIds.add(parent.id);
      children.forEach(c => usedIds.add(c.id));
      const xs = [parent.x, ...children.map(c => c.x)];
      clusters.push({
        parent,
        children,
        layers: [parent, ...children],
        centerX: xs.reduce((a, b) => a + b, 0) / xs.length,
      });
    }
  }

  // 2. sourceLayerId-based grouping (only for layers not already in a parentId group)
  const remaining = row.filter(l => !usedIds.has(l.id));
  for (const layer of remaining) {
    if (usedIds.has(layer.id)) continue;
    const srcChildren = sourceChildrenMap.get(layer.id) || [];
    const actualChildren = srcChildren.filter(c => !usedIds.has(c.id) && row.some(r => r.id === c.id));
    if (actualChildren.length > 0) {
      usedIds.add(layer.id);
      actualChildren.forEach(c => usedIds.add(c.id));
      const xs = [layer.x, ...actualChildren.map(c => c.x)];
      clusters.push({
        parent: layer,
        children: actualChildren,
        layers: [layer, ...actualChildren],
        centerX: xs.reduce((a, b) => a + b, 0) / xs.length,
      });
    }
  }

  // 3. Remaining orphans (standalone)
  for (const layer of row) {
    if (!usedIds.has(layer.id)) {
      clusters.push({
        parent: undefined,
        children: [],
        layers: [layer],
        centerX: layer.x,
      });
    }
  }

  clusters.sort((a, b) => a.centerX - b.centerX);
  return clusters;
}

function calcClusterSize(cluster: LayoutCluster): { width: number; height: number } {
  if (cluster.parent && cluster.children.length > 0) {
    const maxChildW = Math.max(...cluster.children.map(c => c.width));
    const totalChildH = cluster.children.reduce((s, c) => s + c.height, 0) + (cluster.children.length - 1) * VERTICAL_GAP;
    return {
      width: cluster.parent.width + PARENT_CHILD_GAP + maxChildW,
      height: Math.max(cluster.parent.height, totalChildH),
    };
  }
  return { width: cluster.layers[0].width, height: cluster.layers[0].height };
}

export function autoLayout(
  layers: LayerData[],
  viewportWidth: number,
  viewportHeight: number
): { updatedLayers: LayerData[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } } {
  const visibleLayers = layers.filter(l => l.visible !== false);
  if (visibleLayers.length === 0) {
    return { updatedLayers: layers, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  const sourceChildrenMap = buildSourceChildrenMap(visibleLayers);

  // Step 1: detect rows by vertical overlap + sourceLayerId linkage
  const rows = detectRows(visibleLayers, sourceChildrenMap);

  // Step 2: lay out rows top to bottom
  const layerPositionMap = new Map<string, { x: number; y: number }>();
  let currentRowY = PADDING;

  for (const row of rows) {
    const clusters = buildClustersFromRow(row, sourceChildrenMap);
    const sizes = clusters.map(c => ({ cluster: c, ...calcClusterSize(c) }));
    const rowHeight = Math.max(...sizes.map(s => s.height));

    let rowX = PADDING;

    for (const { cluster, width } of sizes) {
      if (cluster.parent && cluster.children.length > 0) {
        layerPositionMap.set(cluster.parent.id, { x: rowX, y: currentRowY });
        const childX = rowX + cluster.parent.width + PARENT_CHILD_GAP;
        let childY = currentRowY;
        for (const child of cluster.children) {
          layerPositionMap.set(child.id, { x: childX, y: childY });
          childY += child.height + VERTICAL_GAP;
        }
      } else {
        layerPositionMap.set(cluster.layers[0].id, { x: rowX, y: currentRowY });
      }

      rowX += width + CLUSTER_GAP;
    }

    currentRowY += rowHeight + ROW_GAP;
  }

  // Step 3: apply new positions
  const updatedLayers = layers.map(layer => {
    const pos = layerPositionMap.get(layer.id);
    if (pos) {
      return { ...layer, x: pos.x, y: pos.y };
    }
    return layer;
  });

  // Step 4: compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const layer of updatedLayers) {
    if (layer.visible === false) continue;
    minX = Math.min(minX, layer.x);
    minY = Math.min(minY, layer.y);
    maxX = Math.max(maxX, layer.x + layer.width);
    maxY = Math.max(maxY, layer.y + layer.height);
  }

  return { updatedLayers, bounds: { minX, minY, maxX, maxY } };
}
