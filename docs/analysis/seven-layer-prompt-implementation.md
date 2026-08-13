# 七层提示词架构落地实施方案

## 1. 现状问题

代码审查发现当前提示词生成存在 4 个结构性问题：

| 问题                 | 具体表现                                                                                                                                                                                           | 影响                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **纯字符串拼接**     | 所有 prompt 都是模板字符串内联在 service 函数中（`visualService.ts` ~1700行）                                                                                                                      | 无法独立测试、无法复用、无法按层诊断                               |
| **大量重复片段**     | "MANDATORY" 要求块（signature pose / microAction / silhouette / body part / dynamic motion）在 `generateCharacterVisualPrompt`、`generateVisualPrompt`、`generateAllCharacterPrompts` 三处逐字重复 | 改一处需同步改三处，极易遗漏                                       |
| **无 system prompt** | `chatCompletion` 只发 `messages: [{role: 'user', content: prompt}]`，而 `callChatApi` 已支持 `systemPrompt`                                                                                        | 不变约束（美术指导、风格规则）每次重复发送，浪费 token、稀释注意力 |
| **无版本/层追踪**    | 生成结果只存最终 prompt 字符串，无法定位"哪层出了问题"                                                                                                                                             | 失败时只能盲调，无诊断依据                                         |

## 2. 七层映射到现有数据结构

当前项目**已有**七层所需的大部分数据，只是全部在最后一步拍平成了字符串：

| 层        | HGAS 原始定义                          | 映射到 WL-AI-Director 现有类型                                                     | 当前去向                                        |
| --------- | -------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| L1 意图   | generation purpose + output schema     | 新增 `PromptIntent` 类型                                                           | 散落在各函数的 prompt 开头模板                  |
| L2 资产   | character/scene/prop descriptions      | `Character` / `Scene` / `Prop` + `eraContext`                                      | 内联在模板字符串 `${character.name}`            |
| L3 空间   | camera angle/size/subject position     | `CameraChoreography` (已存在完整类型)                                              | `renderCameraChoreographyPrompt()` 渲染为字符串 |
| L4 动作   | action/dialogue/micro-action           | `Shot.actionSummary` + `Shot.dialogue` + `Character.microAction` / `signaturePose` | 内联在 `optimizeBothKeyframes` 等函数           |
| L5 摄影   | lighting/color/texture/mood            | `ArtDirection` (已存在结构化对象)                                                  | `buildArtDirectionBlock()` 拍平为字符串         |
| L6 约束   | mustHold / changesHere / mustNotAppear | **新增** `ShotConstraint` 类型                                                     | 当前仅靠 `negativePrompt` 字符串                |
| L7 连续性 | prev shot context / character state    | `CharacterVariation[]` + `ConsistencyConflict[]`                                   | `consistencyService` 检查但未注入 prompt        |

**结论**：L2-L5 的数据源已存在，核心工作量在 L1(新增意图类型) + L6(新增三栏约束) + L7(注入连续性上下文) + 整体的 Builder 基础设施。

## 3. 核心设计：system/user prompt 分离

当前 `chatCompletion` 的签名：

```typescript
// 现状：纯 user message
chatCompletion(prompt: string, model?, temperature?, maxTokens?, responseFormat?, timeout?)
// 内部: messages: [{ role: 'user', content: prompt }]
```

七层架构的关键洞察是**按变更频率分层**：

| 频率       | 层                                          | 角色              | 理由                                       |
| ---------- | ------------------------------------------- | ----------------- | ------------------------------------------ |
| 项目级不变 | L5 摄影(ArtDirection) + L1 意图规则         | **system prompt** | 同一项目的美术指导、输出格式规则不变       |
| 镜头级不变 | L6 约束(mustHold/mustNotAppear) + L7 连续性 | **system prompt** | 同一镜头的约束和前后文关系在多次生成间不变 |
| 每次变化   | L2 资产 + L3 空间 + L4 动作                 | **user prompt**   | 角色/场景/动作是本次生成的具体内容         |

**改造方案**：给 `chatCompletion` 增加可选的 `systemPrompt` 参数（非 breaking change，默认不传则行为不变）：

```typescript
// 改造后
export const chatCompletion = async (
  prompt: string,
  model?: string,
  temperature: number = 0.7,
  maxTokens: number = 8192,
  responseFormat?: 'json_object',
  timeout: number = 600000,
  systemPrompt?: string, // ← 新增，可选
): Promise<string> => {
  const messages = systemPrompt
    ? [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ]
    : [{ role: 'user', content: prompt }];
  // ... rest unchanged
};
```

## 4. 新增类型定义

### 4.1 LayeredPrompt — 七层结构化容器

```typescript
// types/prompt.ts (新建文件)

export type PromptTarget =
  | 'art-direction'
  | 'character-design'
  | 'scene-environment'
  | 'keyframe-start'
  | 'keyframe-end'
  | 'video-motion'
  | 'prop-design'
  | 'style-detection';

export interface PromptIntent {
  target: PromptTarget;
  outputFormat: 'json' | 'text';
  outputSchema?: string; // JSON 结构描述
  language: string; // '中文' | 'English'
  wordCountRange?: { min: number; max: number };
  qualityTags?: string; // 从 promptConstants.DEFAULT_QUALITY_TAGS
  cinematographyTermsRule?: boolean; // 保留英文摄影术语
}

export interface ShotConstraint {
  mustHold: string[]; // 必须保持不变的元素（如"红色外套"、"短发"）
  changesHere: string[]; // 本镜头允许的变化（如"衣服破损"、"从站到跪"）
  mustNotAppear: string[]; // 禁止出现的元素
}

export interface ContinuityContext {
  previousShotSummary?: string; // 前一镜头的动作/画面摘要
  characterStates: {
    // 角色当前状态版本
    characterId: string;
    stateLabel: string; // 如 "受伤后"、"换装后"
    visualDelta?: string; // 相对基线的视觉变化描述
  }[];
  consistencyAnchors?: string; // 从 ArtDirection.consistencyAnchors
}

export interface LayeredPrompt {
  intent: PromptIntent;
  assets: {
    characters?: Character[];
    scenes?: Scene[];
    props?: Prop[];
    eraContextBlock?: string; // 从 eraContext.buildEraContextBlock()
  };
  spatial?: {
    cameraChoreography?: CameraChoreography;
    customAngle?: string;
    customShotSize?: string;
  };
  action?: {
    actionSummary?: string;
    dialogue?: string;
    microActions?: string[];
    signaturePoses?: string[];
  };
  photography?: ArtDirection;
  constraints?: ShotConstraint;
  continuity?: ContinuityContext;
}
```

### 4.2 PromptBuilder — 分层组装器

```typescript
// services/ai/promptBuilder.ts (新建文件)

export class PromptBuilder {
  private layers: LayeredPrompt;

  constructor(intent: PromptIntent) {
    this.layers = { intent };
  }

  // 链式 API
  withAssets(assets: LayeredPrompt['assets']): this {
    this.layers.assets = assets;
    return this;
  }

  withSpatial(spatial: LayeredPrompt['spatial']): this {
    this.layers.spatial = spatial;
    return this;
  }

  withAction(action: LayeredPrompt['action']): this {
    this.layers.action = action;
    return this;
  }

  withPhotography(artDirection: ArtDirection): this {
    this.layers.photography = artDirection;
    return this;
  }

  withConstraints(constraints: ShotConstraint): this {
    this.layers.constraints = constraints;
    return this;
  }

  withContinuity(continuity: ContinuityContext): this {
    this.layers.continuity = continuity;
    return this;
  }

  // 输出 system prompt（不变约束层）
  buildSystemPrompt(): string {
    const parts: string[] = [];
    // L1: 意图规则
    parts.push(buildIntentSystemBlock(this.layers.intent));
    // L5: 摄影层
    if (this.layers.photography) {
      parts.push(buildArtDirectionBlock(this.layers.photography, 'Character'));
    }
    // L6: 约束层
    if (this.layers.constraints) {
      parts.push(buildConstraintBlock(this.layers.constraints));
    }
    // L7: 连续性层
    if (this.layers.continuity) {
      parts.push(buildContinuityBlock(this.layers.continuity));
    }
    return parts.join('\n\n');
  }

  // 输出 user prompt（本次内容层）
  buildUserPrompt(): string {
    const parts: string[] = [];
    // L2: 资产层
    if (this.layers.assets) {
      parts.push(buildAssetBlock(this.layers.assets, this.layers.intent));
    }
    // L3: 空间层
    if (this.layers.spatial) {
      parts.push(buildSpatialBlock(this.layers.spatial));
    }
    // L4: 动作层
    if (this.layers.action) {
      parts.push(buildActionBlock(this.layers.action));
    }
    // 输出格式要求
    parts.push(buildOutputFormatBlock(this.layers.intent));
    return parts.join('\n\n');
  }

  // 完整 prompt（兼容模式，不使用 system/user 分离时使用）
  build(): string {
    return [this.buildSystemPrompt(), this.buildUserPrompt()].join('\n\n---\n\n');
  }
}
```

### 4.3 各层 builder 函数（拆分到独立文件）

```
services/ai/promptLayers/
  ├── index.ts              ← 统一导出
  ├── intentLayer.ts        ← L1: 意图层
  ├── assetLayer.ts         ← L2: 资产层
  ├── spatialLayer.ts       ← L3: 空间层
  ├── actionLayer.ts       ← L4: 动作层
  ├── photographyLayer.ts   ← L5: 摄影层（含现有 buildArtDirectionBlock 迁移）
  ├── constraintLayer.ts    ← L6: 约束层（新增三栏约束）
  └── continuityLayer.ts   ← L7: 连续性层
```

## 5. 迁移策略：三层渐进式

### Phase 1：基础设施 + 试点（1-2天）

**目标**：建立 PromptBuilder 基础设施，用 `generateCharacterVisualPrompt` 验证模式。

1. 新建 `types/prompt.ts`（类型定义）
2. 新建 `services/ai/promptBuilder.ts`（PromptBuilder 类）
3. 新建 `services/ai/promptLayers/` 目录（7 个层 builder）
4. 将现有 `buildArtDirectionBlock` 迁移到 `photographyLayer.ts`，原位置改为 re-export
5. 改造 `chatCompletion` 增加可选 `systemPrompt` 参数
6. 用 PromptBuilder 重写 `generateCharacterVisualPrompt` 作为试点

**试点前后对比**：

```typescript
// === 改造前 ===
export const generateCharacterVisualPrompt = async (
  character,
  artDirection,
  visualStyle,
  language,
  model,
) => {
  const prompt = `You are a world-class visual prompt engineer for ${visualStyle}...
    ## Character Information
    - Name: ${character.name} ...
    ${buildArtDirectionBlock(artDirection, 'Character')}
    ## Your Task
    CRITICAL REQUIREMENTS:
    1. Describe the character's appearance in DETAIL: ...
    Output JSON format: { "visualPrompt": "...", "negativePrompt": "..." }`;
  const response = await chatCompletion(prompt, resolvedModel, 0.4, 4096);
  // ...parse
};

// === 改造后 ===
export const generateCharacterVisualPrompt = async (
  character,
  artDirection,
  visualStyle,
  language,
  model,
) => {
  const builder = new PromptBuilder({
    target: 'character-design',
    outputFormat: 'json',
    outputSchema: '{ "visualPrompt": "...", "negativePrompt": "..." }',
    language,
    wordCountRange: { min: 200, max: 400 },
    qualityTags: DEFAULT_QUALITY_TAGS,
    cinematographyTermsRule: true,
  })
    .withAssets({ characters: [character] })
    .withPhotography(artDirection);

  const systemPrompt = builder.buildSystemPrompt();
  const userPrompt = builder.buildUserPrompt();

  const response = await chatCompletion(
    userPrompt,
    resolvedModel,
    0.4,
    4096,
    undefined,
    600000,
    systemPrompt,
  );
  // ...parse (不变)
};
```

**验证标准**：

- `tsc --noEmit` 0 错误
- 试点函数的生成质量不低于改造前（人工对比 3-5 个角色）
- 其他未改造函数行为完全不变

### Phase 2：扩展迁移（2-3天）

按以下优先级迁移其余函数（**每次迁移一个函数，验证后再迁移下一个**）：

| 优先级 | 函数                           | 迁移理由                                        |
| ------ | ------------------------------ | ----------------------------------------------- |
| P1     | `generateSceneVisualPrompt`    | 与角色版高度对称，快速完成                      |
| P1     | `generateVisualPrompt`         | 通用入口，统一后消除三处重复                    |
| P2     | `generateAllCharacterPrompts`  | 批量版，复用角色层 builder                      |
| P2     | `optimizeBothKeyframes`        | shotService 最大的 prompt，含 L3 空间 + L4 动作 |
| P2     | `optimizeKeyframePrompt`       | 单帧版                                          |
| P3     | `generateArtDirection`         | Art Direction 生成本身（元层，特殊处理）        |
| P3     | `generateAllPropPrompts`       | 道具提示词                                      |
| P3     | `fixKeyframeConsistency`       | 修复版，天然需要 L6 约束 + L7 连续性            |
| P4     | `suggestVisualStyleFromScript` | 风格检测，逻辑差异较大                          |

### Phase 3：引入 L6 约束 + L7 连续性（2-3天）

这是价值最大但当前完全缺失的部分：

**L6 三栏约束**：在 `Shot` 类型上新增可选字段：

```typescript
// types.ts 扩展
export interface Shot {
  // ... existing fields
  constraints?: ShotConstraint; // 新增
}
```

在 UI 层（Shot 面板）增加三栏约束编辑入口，在关键帧/视频生成时自动注入。

**L7 连续性上下文**：在 `optimizeBothKeyframes` 和视频生成时，自动从前后 shot 的数据构建 `ContinuityContext`：

```typescript
// 在 generateVideo 流程中自动构建
const continuity: ContinuityContext = {
  previousShotSummary: prevShot?.actionSummary,
  characterStates: shot.characters.map((charId) => {
    const char = scriptData.characters.find((c) => c.id === charId);
    const variation = shot.characterVariations?.[charId];
    return {
      characterId: charId,
      stateLabel: variation || 'default',
      visualDelta: variation ? `Outfit changed to: ${variation}` : undefined,
    };
  }),
  consistencyAnchors: artDirection?.consistencyAnchors,
};
```

## 6. 关键设计决策

### 6.1 不做的事

| 不做                               | 理由                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 不用 CSV/JSON 文件存储 prompt 模板 | HGAS 用 CSV 是因为它是 Agent Skill 形态；Web 应用应保持在代码中，享受类型安全和版本控制                                                  |
| 不做"平台适配层"分离               | 当前 5 个 provider 的 prompt 格式**没有差异**（都是纯字符串），分离适配层是过度设计。等真正接入即梦/可灵等有 prompt 格式差异的模型时再做 |
| 不引入 prompt 版本数据库           | 初始阶段直接在代码中管理，等有 A/B 测试需求时再考虑                                                                                      |
| 不改 `chatCompletion` 的返回类型   | 保持 `Promise<string>`，改造仅增加参数，非 breaking                                                                                      |

### 6.2 必须做的事

| 必做                                          | 理由                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| 每个层 builder 函数必须是纯函数               | 无副作用、可独立单测、可组合                                                 |
| `buildArtDirectionBlock` 迁移后保持 re-export | 现有引用 `import { buildArtDirectionBlock } from './visualService'` 不需要改 |
| PromptBuilder 的 `build()` 方法输出兼容旧格式 | 渐进迁移期间，未改造的函数可继续直接调 `build()` 获得单个字符串              |
| 每次迁移一个函数                              | 不批量改造，每步验证                                                         |

### 6.3 system prompt 的 token 收益估算

以 `generateCharacterVisualPrompt` 为例：

| 部分                 | 当前(user prompt)    | 改造后                              |
| -------------------- | -------------------- | ----------------------------------- |
| ArtDirection block   | ~400 token，每次发送 | system，同项目内复用                |
| MANDATORY 要求块     | ~200 token，每次发送 | system，同 target 类型复用          |
| 语言/术语规则        | ~50 token，每次发送  | system                              |
| **每次实际变化内容** | ~150 token           | user ~150 token                     |
| **总计**             | ~800 token/次        | system ~650(首次) + user ~150(每次) |

同一项目生成 10 个角色：当前 8000 token → 改造后 650 + 1500 = 2150 token，**节省 ~73%**。

## 7. 文件变更清单

```
新增：
  types/prompt.ts                              ← LayeredPrompt, PromptIntent, ShotConstraint, ContinuityContext
  services/ai/promptBuilder.ts                 ← PromptBuilder 类
  services/ai/promptLayers/index.ts            ← 统一导出
  services/ai/promptLayers/intentLayer.ts      ← L1 builder
  services/ai/promptLayers/assetLayer.ts       ← L2 builder
  services/ai/promptLayers/spatialLayer.ts     ← L3 builder
  services/ai/promptLayers/actionLayer.ts      ← L4 builder
  services/ai/promptLayers/photographyLayer.ts ← L5 builder (迁移 buildArtDirectionBlock)
  services/ai/promptLayers/constraintLayer.ts  ← L6 builder (新增三栏约束)
  services/ai/promptLayers/continuityLayer.ts  ← L7 builder (新增连续性注入)

修改：
  services/ai/apiCore.ts                       ← chatCompletion 增加 systemPrompt 可选参数
  services/ai/visualService.ts                 ← 迁移各函数到使用 PromptBuilder（渐进式）
  services/ai/shotService.ts                   ← 迁移 optimizeBothKeyframes 等
  services/ai/consistencyService.ts            ← 注入 L7 连续性
  types.ts                                     ← Shot 增加 constraints 可选字段
  services/ai/index.ts                         ← 导出 PromptBuilder + 新类型
```

## 8. 风险与缓解

| 风险                                 | 缓解措施                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------- |
| system prompt 在某些模型上行为不一致 | `chatCompletion` 已有 `wldramallm` 特殊处理分支；新参数默认不传，行为不变  |
| 迁移期间 prompt 变化导致生成质量回归 | 每个函数迁移后做 A/B 对比（同一角色/场景，旧 vs 新 prompt）                |
| L6 约束/L7 连续性需要 UI 改动        | Phase 3 才涉及 UI，Phase 1-2 纯后端改造，无前端风险                        |
| PromptBuilder 类增加复杂度           | 限制在 `services/ai/` 内部使用，不暴露给 UI 层；UI 层仍调原有 service 函数 |
