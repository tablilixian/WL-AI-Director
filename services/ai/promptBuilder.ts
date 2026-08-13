/**
 * PromptBuilder - 七层提示词结构化组装器
 *
 * 按变更频率分层：
 * - system prompt = L1 意图 + L5 摄影 + L6 约束 + L7 连续性（项目/镜头级不变）
 * - user prompt   = L2 资产 + L3 空间 + L4 动作（每次生成变化）
 *
 * 用法：
 *   const builder = new PromptBuilder(intent)
 *     .withAssets({ characters: [char] })
 *     .withPhotography(artDirection);
 *   const system = builder.buildSystemPrompt(taskRequirements);
 *   const user = builder.buildUserPrompt();
 */
import type { LayeredPrompt, PromptIntent } from '../../types/prompt';
import {
  buildIntentSystemBlock,
  buildAssetBlock,
  buildSpatialBlock,
  buildActionBlock,
  buildArtDirectionBlock,
  buildConstraintBlock,
  buildContinuityBlock,
} from './promptLayers';

export class PromptBuilder {
  private layers: LayeredPrompt;

  constructor(intent: PromptIntent) {
    this.layers = { intent, assets: {} };
  }

  withAssets(assets: LayeredPrompt['assets']): this {
    this.layers.assets = assets;
    return this;
  }

  withSpatial(spatial: NonNullable<LayeredPrompt['spatial']>): this {
    this.layers.spatial = spatial;
    return this;
  }

  withAction(action: NonNullable<LayeredPrompt['action']>): this {
    this.layers.action = action;
    return this;
  }

  withPhotography(photography: NonNullable<LayeredPrompt['photography']>): this {
    this.layers.photography = photography;
    return this;
  }

  withConstraints(constraints: NonNullable<LayeredPrompt['constraints']>): this {
    this.layers.constraints = constraints;
    return this;
  }

  withContinuity(continuity: NonNullable<LayeredPrompt['continuity']>): this {
    this.layers.continuity = continuity;
    return this;
  }

  /** system prompt：不变约束层 L1 + L5 + L6 + L7 */
  buildSystemPrompt(taskRequirements?: string): string {
    const parts: string[] = [buildIntentSystemBlock(this.layers.intent, taskRequirements)];
    if (this.layers.photography) {
      parts.push(buildArtDirectionBlock(this.layers.photography, 'Project'));
    }
    if (this.layers.constraints) {
      parts.push(buildConstraintBlock(this.layers.constraints));
    }
    if (this.layers.continuity) {
      parts.push(buildContinuityBlock(this.layers.continuity));
    }
    return parts.join('\n\n');
  }

  /** user prompt：本次内容层 L2 + L3 + L4 */
  buildUserPrompt(): string {
    const parts: string[] = [];
    parts.push(buildAssetBlock(this.layers.assets, this.layers.intent));
    if (this.layers.spatial) {
      parts.push(buildSpatialBlock(this.layers.spatial, this.layers.action?.actionSummary));
    }
    if (this.layers.action) {
      parts.push(buildActionBlock(this.layers.action));
    }
    return parts.filter(Boolean).join('\n\n');
  }

  /** 兼容模式：合并为单个字符串（不使用 system/user 分离时） */
  build(taskRequirements?: string): string {
    return [this.buildSystemPrompt(taskRequirements), this.buildUserPrompt()].join('\n\n---\n\n');
  }
}
