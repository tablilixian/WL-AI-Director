import { LayerData } from '../types/canvas';

interface TreeNode {
  layer: LayerData;
  children: TreeNode[];
}

interface PlacedNode {
  width: number;
  height: number;
}

const CLUSTER_GAP = 200;
const ROW_GAP = 200;
const PARENT_CHILD_GAP = 240;
const VERTICAL_GAP = 200;
const PADDING = 240;

/** Build a map of layerId → layers whose sourceLayerId or parentId points to it */
function buildChildrenMap(visibleLayers: LayerData[]): Map<string, LayerData[]> {
  const map = new Map<string, LayerData[]>();
  for (const layer of visibleLayers) {
    const parentKey = layer.sourceLayerId || layer.parentId;
    if (parentKey) {
      const list = map.get(parentKey) || [];
      list.push(layer);
      map.set(parentKey, list);
    }
  }
  return map;
}

/**
 * Recursively build a tree from parent-child relationships (sourceLayerId or parentId).
 * Only includes layers present in the row set.
 */
function buildTree(
  layerId: string,
  allLayerMap: Map<string, LayerData>,
  childrenMap: Map<string, LayerData[]>,
  rowSet: Set<string>,
): TreeNode | null {
  const layer = allLayerMap.get(layerId);
  if (!layer || !rowSet.has(layerId)) return null;

  const rawChildren = childrenMap.get(layerId) || [];
  const children: TreeNode[] = [];

  for (const child of rawChildren) {
    if (rowSet.has(child.id)) {
      const subTree = buildTree(child.id, allLayerMap, childrenMap, rowSet);
      if (subTree) children.push(subTree);
    }
  }

  return { layer, children };
}

/**
 * Detect rows:
 * - Layers with >50% Y overlap are in the same row
 * - Descendants (via sourceLayerId/parentId) are pulled into the same row as their root ancestor
 */
function detectRows(
  visibleLayers: LayerData[],
  childrenMap: Map<string, LayerData[]>,
): LayerData[][] {
  const allLayerMap = new Map(visibleLayers.map(l => [l.id, l]));
  const sorted = [...visibleLayers].sort((a, b) => a.y - b.y);
  const rows: LayerData[][] = [];
  const usedIds = new Set<string>();

  function collectDescendants(id: string): string[] {
    const result: string[] = [];
    const children = childrenMap.get(id) || [];
    for (const child of children) {
      result.push(child.id);
      result.push(...collectDescendants(child.id));
    }
    return result;
  }

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
        for (const descId of collectDescendants(layer.id)) {
          if (!usedIds.has(descId)) {
            row.push(allLayerMap.get(descId)!);
            usedIds.add(descId);
          }
        }
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newRow: LayerData[] = [layer];
      usedIds.add(layer.id);
      for (const descId of collectDescendants(layer.id)) {
        if (!usedIds.has(descId)) {
          newRow.push(allLayerMap.get(descId)!);
          usedIds.add(descId);
        }
      }
      rows.push(newRow);
    }
  }

  return rows;
}

/**
 * Find root layers (no sourceLayerId, no parentId) from a row,
 * then recursively build trees.
 */
function buildForest(row: LayerData[], childrenMap: Map<string, LayerData[]>): TreeNode[] {
  const allLayerMap = new Map(row.map(l => [l.id, l]));
  const rowSet = new Set(row.map(l => l.id));
  const nonRoots = new Set<string>();

  for (const layer of row) {
    if (layer.sourceLayerId) nonRoots.add(layer.id);
    if (layer.parentId) nonRoots.add(layer.id);
  }

  const trees: TreeNode[] = [];

  for (const layer of row) {
    if (nonRoots.has(layer.id)) continue;
    const tree = buildTree(layer.id, allLayerMap, childrenMap, rowSet);
    if (tree) trees.push(tree);
  }

  trees.sort((a, b) => a.layer.x - b.layer.x);
  return trees;
}

/** Calculate tree dimensions without side effects */
function calcTreeSize(node: TreeNode): PlacedNode {
  if (node.children.length === 0) {
    return { width: node.layer.width, height: node.layer.height };
  }

  const childX = node.layer.width + PARENT_CHILD_GAP;
  let maxRightExtent = 0;
  let totalChildH = 0;

  for (const child of node.children) {
    const placed = calcTreeSize(child);
    maxRightExtent = Math.max(maxRightExtent, childX + placed.width);
    totalChildH += placed.height;
    totalChildH += VERTICAL_GAP; // gap after this child
  }
  if (node.children.length > 0) {
    totalChildH -= VERTICAL_GAP; // remove trailing gap
  }

  const totalHeight = Math.max(node.layer.height, totalChildH);

  return { width: maxRightExtent, height: totalHeight };
}

/**
 * Recursively place a tree node and all its descendants.
 * Parent on the left, children stacked vertically on the right.
 */
function placeTree(
  node: TreeNode,
  x: number,
  y: number,
  positions: Map<string, { x: number; y: number }>,
): void {
  positions.set(node.layer.id, { x, y });

  if (node.children.length === 0) return;

  const childX = x + node.layer.width + PARENT_CHILD_GAP;
  let childY = y;

  for (let i = 0; i < node.children.length; i++) {
    placeTree(node.children[i], childX, childY, positions);
    if (i < node.children.length - 1) {
      childY += calcTreeSize(node.children[i]).height + VERTICAL_GAP;
    }
  }
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

  const childrenMap = buildChildrenMap(visibleLayers);

  // Step 1: detect rows
  const rows = detectRows(visibleLayers, childrenMap);

  // Step 2: lay out rows top to bottom
  const layerPositionMap = new Map<string, { x: number; y: number }>();
  let currentRowY = PADDING;

  for (const row of rows) {
    const forest = buildForest(row, childrenMap);

    let rowHeight = 0;
    const treeSizes = forest.map(tree => {
      const size = calcTreeSize(tree);
      rowHeight = Math.max(rowHeight, size.height);
      return { tree, ...size };
    });

    let rowX = PADDING;

    for (const { tree, width } of treeSizes) {
      placeTree(tree, rowX, currentRowY, layerPositionMap);
      rowX += width + CLUSTER_GAP;
    }

    currentRowY += rowHeight + ROW_GAP;
  }

  // Step 3: apply positions to all layers
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
