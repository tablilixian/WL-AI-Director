/**
 * 画布数据完整性校验（只读、确定性、0 网络 / 0 数据库操作）
 *
 * 设计参照 Hell-Grind-AIGC-Skill 的 validate_project.py 理念：
 * 在加载项目后跑一次只读检查，发现引用断链、损坏数据、非法持久态，
 * 把问题暴露给用户（而非静默），支撑"工作中断后无缝续作 + 数据安全"诉求。
 *
 * 注意：本模块不修改任何数据，只产出问题清单。
 */

import type { LayerData } from '../types/canvas';

export interface IntegrityIssue {
  /** 稳定错误码，便于日志筛查与去重 */
  code: string;
  severity: 'error' | 'warning';
  /** 关联图层 ID（如有） */
  layerId?: string;
  message: string;
}

const STORY_FLOW_OP_TYPES = new Set(['story-deduction-flow', 'story-deduction-video']);

/**
 * 校验一组画布图层的数据完整性。
 * @param layers 即将（或已经）载入 store 的图层数组
 * @returns 按严重程度排序的问题清单（空数组表示通过）
 */
export function validateCanvasIntegrity(layers: LayerData[]): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  if (!Array.isArray(layers) || layers.length === 0) {
    return issues;
  }

  // 第一遍：建立完整图层 ID 集合（用于引用完整性比对，避免"来源图层排在后面"的误报）
  const allIds = new Set<string>();
  for (const layer of layers) {
    if (layer.id) allIds.add(layer.id);
  }

  // 第二遍：逐图层检查
  const seenIds = new Set<string>();
  for (const layer of layers) {
    // 1) 重复图层 ID —— 会导致引用歧义、恢复错乱
    if (layer.id) {
      if (seenIds.has(layer.id)) {
        issues.push({
          code: 'DUPLICATE_LAYER_ID',
          severity: 'error',
          layerId: layer.id,
          message: `发现重复的图层 ID：${layer.id}，引用将指向错误对象`,
        });
      } else {
        seenIds.add(layer.id);
      }
    }

    // 2) 来源引用断链 —— 推演流 / 宫格 / 图生图等依赖 sourceLayerId(s) 指向已存在图层
    const refs = collectSourceRefs(layer);
    for (const ref of refs) {
      if (!allIds.has(ref)) {
        issues.push({
          code: 'BROKEN_SOURCE_REF',
          severity: 'error',
          layerId: layer.id,
          message: `图层「${layer.title || layer.id}」引用了不存在的来源图层：${ref}`,
        });
      }
    }

    // 3) 推演流数据损坏 —— generationPrompt 本应可解析为 FlowState
    if (STORY_FLOW_OP_TYPES.has(layer.operationType ?? '') && layer.generationPrompt) {
      try {
        JSON.parse(layer.generationPrompt);
      } catch {
        issues.push({
          code: 'CORRUPT_FLOW_DATA',
          severity: 'error',
          layerId: layer.id,
          message: `推演流数据已损坏（generationPrompt 不是合法 JSON），无法恢复进度`,
        });
      }
    }

    // 4) 非法持久态 —— blob: URL 绝不应写入持久 layer.src（A3 修复后应为 local:/video:）
    if (layer.src && layer.src.startsWith('blob:')) {
      issues.push({
        code: 'BLOB_SRC_PERSISTED',
        severity: 'warning',
        layerId: layer.id,
        message: `图层「${layer.title || layer.id}」持久 src 为 blob: 临时 URL，刷新后将无法显示`,
      });
    }
  }

  // 排序：error 在前，便于 UI 优先展示
  const rank = (s: string) => (s === 'error' ? 0 : 1);
  issues.sort((a, b) => rank(a.severity) - rank(b.severity));
  return issues;
}

/** 收集图层所有来源引用（单来源 + 多来源） */
function collectSourceRefs(layer: LayerData): string[] {
  const refs: string[] = [];
  if (layer.sourceLayerId) refs.push(layer.sourceLayerId);
  if (Array.isArray(layer.sourceLayerIds)) {
    for (const id of layer.sourceLayerIds) {
      if (id) refs.push(id);
    }
  }
  return refs;
}
