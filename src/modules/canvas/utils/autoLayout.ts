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

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) console.log('[AutoLayout]', ...args);
}

function logTree(node: TreeNode, indent = 0) {
  if (!DEBUG) return;
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}├─ ${node.layer.title} (${node.layer.id.slice(0,8)}) type=${node.layer.type} w=${node.layer.width} h=${node.layer.height} parentId=${node.layer.parentId?.slice(0,8)} sourceLayerId=${node.layer.sourceLayerId?.slice(0,8)}`);
  for (const child of node.children) {
    logTree(child, indent + 1);
  }
}

function logRow(row: LayerData[], rowIndex: number) {
  if (!DEBUG) return;
  console.log(`[AutoLayout] Row ${rowIndex}:`, row.map(l => `${l.title}(${l.id.slice(0,8)}) y=${l.y} h=${l.height} parent=${l.parentId?.slice(0,8)} src=${l.sourceLayerId?.slice(0,8)}`).join(' | '));
}

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
  log('childrenMap:', Array.from(map.entries()).map(([k, v]) => `${k.slice(0,8)} → [${v.map(x => x.title).join(', ')}]`));
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
 * Check if two layers overlap vertically by more than 50% of the shorter layer's height
 */
function layersOverlap(a: LayerData, b: LayerData): boolean {
  const overlapStart = Math.max(a.y, b.y);
  const overlapEnd = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const minH = Math.min(a.height, b.height);
  return overlap > minH * 0.5;
}

/**
 * Detect rows using anchor-based clustering (no transitive cascading):
 * 1. Sort layers by Y position
 * 2. Each row is defined by its anchor (first placed layer)
 * 3. A new layer joins a row only if it overlaps with the ANCHOR (not any layer)
 * 4. After initial placement, pull descendants into their ancestor's row
 */
function detectRows(
  visibleLayers: LayerData[],
  childrenMap: Map<string, LayerData[]>,
): LayerData[][] {
  const allLayerMap = new Map(visibleLayers.map(l => [l.id, l]));
  const sorted = [...visibleLayers].sort((a, b) => a.y - b.y);
  const rows: LayerData[][] = [];
  const usedIds = new Set<string>();
  // Map layerId → row index (for descendant pulling)
  const rowOfLayer = new Map<string, number>();

  function collectDescendants(id: string): string[] {
    const result: string[] = [];
    const children = childrenMap.get(id) || [];
    for (const child of children) {
      result.push(child.id);
      result.push(...collectDescendants(child.id));
    }
    return result;
  }

  // Step 1: Anchor-based row assignment (no transitive cascading)
  for (const layer of sorted) {
    if (usedIds.has(layer.id)) continue;

    let placed = false;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const anchor = rows[rowIndex][0]; // anchor = first layer in row
      if (layersOverlap(layer, anchor)) {
        rows[rowIndex].push(layer);
        usedIds.add(layer.id);
        rowOfLayer.set(layer.id, rowIndex);
        log(`  ${layer.title} (y=${layer.y}) → Row ${rowIndex} (anchor: ${anchor.title} y=${anchor.y})`);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newRow: LayerData[] = [layer];
      usedIds.add(layer.id);
      rowOfLayer.set(layer.id, rows.length);
      log(`  ${layer.title} (y=${layer.y}) → NEW Row ${rows.length}`);
      rows.push(newRow);
    }
  }

  // Step 2: Pull descendants into ancestor's row
  // Process ancestors in reverse order so deeper lineage is handled first
  const ancestorIds = [...allLayerMap.keys()].filter(id => {
    const children = childrenMap.get(id);
    return children && children.length > 0;
  });

  for (const ancestorId of ancestorIds) {
    const ancestorRow = rowOfLayer.get(ancestorId);
    if (ancestorRow === undefined) continue;

    const descendants = collectDescendants(ancestorId);
    for (const descId of descendants) {
      const descLayer = allLayerMap.get(descId);
      if (!descLayer) continue;

      const descRow = rowOfLayer.get(descId);
      if (descRow !== undefined && descRow !== ancestorRow) {
        // Move descendant from its current row to ancestor's row
        const srcRow = rows[descRow];
        const idx = srcRow.indexOf(descLayer);
        if (idx !== -1) srcRow.splice(idx, 1);
        rows[ancestorRow].push(descLayer);
        rowOfLayer.set(descId, ancestorRow);
        log(`  MOVED: ${descLayer.title} from Row ${descRow} → Row ${ancestorRow} (child of ${allLayerMap.get(ancestorId)?.title})`);
      } else if (descRow === undefined) {
        // Descendant wasn't placed yet
        rows[ancestorRow].push(descLayer);
        usedIds.add(descId);
        rowOfLayer.set(descId, ancestorRow);
      }
    }
  }

  // Step 3: Remove empty rows
  const nonEmptyRows = rows.filter(r => r.length > 0);

  log('Final rows:', nonEmptyRows.map((r, i) => `Row${i}: [${r.map(l => l.title).join(', ')}]`));
  return nonEmptyRows;
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
  log('Forest:', trees.map(t => t.layer.title));
  for (const tree of trees) {
    logTree(tree);
  }
  return trees;
}

/** Calculate tree dimensions without side effects, with caching */
function calcTreeSize(node: TreeNode, cache?: Map<string, PlacedNode>): PlacedNode {
  if (cache && cache.has(node.layer.id)) {
    return cache.get(node.layer.id)!;
  }

  let size: PlacedNode;
  if (node.children.length === 0) {
    size = { width: node.layer.width, height: node.layer.height };
    log(`  calcTreeSize: ${node.layer.title} (leaf) → ${size.width}x${size.height}`);
  } else {
    const childX = node.layer.width + PARENT_CHILD_GAP;
    let maxRightExtent = 0;
    let totalChildH = 0;

    for (const child of node.children) {
      const placed = calcTreeSize(child, cache);
      maxRightExtent = Math.max(maxRightExtent, childX + placed.width);
      totalChildH += placed.height;
      totalChildH += VERTICAL_GAP;
    }
    if (node.children.length > 0) {
      totalChildH -= VERTICAL_GAP;
    }

    const totalHeight = Math.max(node.layer.height, totalChildH);
    size = { width: maxRightExtent, height: totalChildH };
    log(`  calcTreeSize: ${node.layer.title} (parent) → ${size.width}x${size.height} (childX=${childX}, children=${node.children.length})`);
  }

  if (cache) {
    cache.set(node.layer.id, size);
  }
  return size;
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
  sizeCache: Map<string, PlacedNode>,
): void {
  positions.set(node.layer.id, { x, y });
  log(`  placeTree: ${node.layer.title} → (${Math.round(x)}, ${Math.round(y)})`);

  if (node.children.length === 0) return;

  const childX = x + node.layer.width + PARENT_CHILD_GAP;
  let childY = y;

  for (let i = 0; i < node.children.length; i++) {
    placeTree(node.children[i], childX, childY, positions, sizeCache);
    if (i < node.children.length - 1) {
      const childSize = sizeCache.get(node.children[i].layer.id) || calcTreeSize(node.children[i]);
      const childHeight = childSize.height;
      childY += childHeight + VERTICAL_GAP;
      log(`    next child Y: ${Math.round(childY)} (prev height=${childHeight} + VERTICAL_GAP=${VERTICAL_GAP})`);
    }
  }
}

export function autoLayout(
  layers: LayerData[],
  viewportWidth: number,
  viewportHeight: number
): { updatedLayers: LayerData[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } } {
  log('========== autoLayout START ==========');
  log(`Viewport: ${viewportWidth}x${viewportHeight}, Total layers: ${layers.length}`);
  
  const visibleLayers = layers.filter(l => l.visible !== false);
  log(`Visible layers: ${visibleLayers.length}`);
  
  if (visibleLayers.length === 0) {
    return { updatedLayers: layers, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  const childrenMap = buildChildrenMap(visibleLayers);

  // Step 1: detect rows
  const rows = detectRows(visibleLayers, childrenMap);

  // Step 2: lay out rows top to bottom
  const layerPositionMap = new Map<string, { x: number; y: number }>();
  const sizeCache = new Map<string, PlacedNode>();
  let currentRowY = PADDING;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    log(`\n--- Processing Row ${rowIndex} (startY=${currentRowY}) ---`);
    logRow(row, rowIndex);
    
    const forest = buildForest(row, childrenMap);

    let rowHeight = 0;
    const treeSizes = forest.map(tree => {
      const size = calcTreeSize(tree, sizeCache);
      rowHeight = Math.max(rowHeight, size.height);
      return { tree, ...size };
    });

    let rowX = PADDING;

    for (const { tree, width } of treeSizes) {
      placeTree(tree, rowX, currentRowY, layerPositionMap, sizeCache);
      rowX += width + CLUSTER_GAP;
    }

    currentRowY += rowHeight + ROW_GAP;
    log(`Row ${rowIndex} done. rowHeight=${rowHeight}, nextRowY=${currentRowY}`);
  }

  // Step 3: apply positions to all layers
  const updatedLayers = layers.map(layer => {
    const pos = layerPositionMap.get(layer.id);
    if (pos) {
      const moved = layer.x !== pos.x || layer.y !== pos.y;
      if (moved) {
        log(`  MOVE: ${layer.title} (${layer.x},${layer.y}) → (${Math.round(pos.x)},${Math.round(pos.y)})`);
      }
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

  log(`\n========== autoLayout END ==========`);
  log(`Bounds: (${Math.round(minX)},${Math.round(minY)}) - (${Math.round(maxX)},${Math.round(maxY)})`);
  log(`Content size: ${Math.round(maxX-minY)}x${Math.round(maxY-minY)}`);
  
  // Check for overlaps
  log('\n--- Overlap Check ---');
  for (let i = 0; i < updatedLayers.length; i++) {
    for (let j = i + 1; j < updatedLayers.length; j++) {
      const a = updatedLayers[i];
      const b = updatedLayers[j];
      if (a.visible === false || b.visible === false) continue;
      const hOverlap = !(a.x + a.width < b.x || b.x + b.width < a.x);
      const vOverlap = !(a.y + a.height < b.y || b.y + b.height < a.y);
      if (hOverlap && vOverlap) {
        log(`⚠️ OVERLAP: ${a.title} vs ${b.title}`);
        log(`  A: (${Math.round(a.x)},${Math.round(a.y)}) ${a.width}x${a.height}`);
        log(`  B: (${Math.round(b.x)},${Math.round(b.y)}) ${b.width}x${b.height}`);
      }
    }
  }
  
  // Check parent-child distances
  log('\n--- Parent-Child Distance Check ---');
  for (const layer of updatedLayers) {
    if (layer.parentId || layer.sourceLayerId) {
      const parentId = layer.parentId || layer.sourceLayerId;
      const parent = updatedLayers.find(l => l.id === parentId);
      if (parent) {
        const dx = layer.x - (parent.x + parent.width);
        const dy = Math.abs(layer.y - parent.y);
        log(`  ${layer.title} ← ${parent.title}: dx=${Math.round(dx)} (expected ~${PARENT_CHILD_GAP}), dy=${Math.round(dy)}`);
        if (dx < PARENT_CHILD_GAP * 0.5 || dx > PARENT_CHILD_GAP * 2) {
          log(`    ⚠️ ABNORMAL dx!`);
        }
      } else {
        log(`  ${layer.title}: parent ${parentId.slice(0,8)} NOT FOUND in updatedLayers!`);
      }
    }
  }

  return { updatedLayers, bounds: { minX, minY, maxX, maxY } };
}
