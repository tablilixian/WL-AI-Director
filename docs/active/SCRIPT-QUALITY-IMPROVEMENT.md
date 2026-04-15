# 漫剧剧本质量提升方案

**文档版本**: v1.1
**创建日期**: 2026-04-14
**最后更新**: 2026-04-15
**状态**: 🔴 开发中
**优先级**: 高

---

## 1. 概述

### 1.1 背景

本文档基于顶级漫剧剧本创作工业标准（26条核心约束），为 WL-AI-Director 项目制定剧本质量提升方案。核心目标是让 AI 生成的剧本从"能生成"进化到"生成得好"，达到专业编剧的工业标准。

### 1.2 核心原则

> **"拒绝文学修辞，一切皆为视觉指令"**

剧本中严禁出现无法直接拍摄的形容词（如"他感到悲伤"、"气氛压抑"），必须转化为可拍摄的具体动作和画面。

### 1.3 改进目标

| 维度 | 当前状态 | 目标状态 |
|------|---------|---------|
| 角色视觉描述 | "绝世美女" | "高跟鞋落地，脚踝绷直；腰肢扭动，S形剪影逆光" |
| 开篇吸引力 | 无检测 | 前3秒必须有冲突/危机 |
| 情绪传达 | 台词直接描述 | 动作传达情绪（静音测试） |
| 动作描写 | "他打了一拳" | "握紧拳头，青筋暴起 → 挥拳带风 → 重击脸颊，面部变形" |

---

## 2. 改进一：角色视觉化约束

### 2.1 问题分析

**当前问题**：
- `Character` 类型缺少微动作和标志性姿态字段
- 视觉提示词生成没有强制约束具体部位+动态描写

**参考约束**：
- 女性魅力必须用部位特写+动态描写
- 反派必须设定【病态微动作】
- 任何主要角色必须备注【标志性姿态】

### 2.2 类型扩展 ✅ 已完成

**文件**: `types.ts`

```typescript
// ✅ 已实现：VisualDescriptionField 接口
export interface VisualDescriptionField {
  original: string;        // 用户输入的原文本
  polished?: string;        // AI 润色后的文本（可编辑）
  previewImageUrl?: string; // 预览图 URL
}

// ✅ 已更新：Character 接口新增字段
export interface Character {
  // ... 现有字段 ...

  // 【新增】病态微动作 - 反派专用
  // 结构：{ original: string, polished?: string, previewImageUrl?: string }
  microAction?: VisualDescriptionField;

  // 【新增】标志性姿态 - 所有主要角色
  // 结构：{ original: string, polished?: string, previewImageUrl?: string }
  signaturePose?: VisualDescriptionField;
}
```

### 2.3 UI 增强 ✅ 已完成

**文件**: `components/StageAssets/CharacterCard.tsx`, `components/StageAssets/VisualDescriptionModal.tsx`

**实现方案**：采用 Modal 模式，而非简单的文本框

| 字段名 | 按钮样式 | 提示文本 | 功能 |
|--------|---------|---------|------|
| 标志性姿态 | 主色调按钮，带 ★ 图标 | "靠在墙上，眼神不聚焦，仿佛无视一切" | AI润色 + 预览图生成 |
| 病态微动作 | 红色调按钮，带警告图标 | "说话前用舌头顶一下腮帮子，手指抽搐" | AI润色 + 预览图生成 |

**UI 交互流程**：
1. 点击按钮 → 打开 VisualDescriptionModal
2. 输入原文本
3. 点击「AI 润色」→ 调用 chatCompletion API 润色
4. 点击「查看预览」→ 生成预览图（使用角色原图作为参考）
5. 保存 → 数据存储为 `{ original, polished, previewImageUrl }` 结构

**关键实现细节**：
- 参考图转换：本地图片 `local:img_xxx` → IndexedDB 读取 → base64 → 传给图片生成 API
- AI 润色：通过 `chatCompletion` 调用，传入角色名称和字段类型
- 预览图生成：使用 `generateImage` API，传入 base64 格式的参考图

### 2.4 视觉提示词生成约束 ⏳ 待实施

**文件**: `services/ai/visualService.ts`

待实现：在 `generateVisualPrompt` 函数中增加约束指令：

```typescript
// 待实现：角色视觉提示词必须包含以下结构：
const characterVisualPrompt = `
...现有角色描述...

【标志性姿态约束】
角色必须展现其标志性姿态：${character.signaturePose?.polished || character.signaturePose?.original || '待补充'}

【微动作约束】
角色必须携带其微动作特征：${character.microAction?.polished || character.microAction?.original || '无特殊微动作'}

【视觉化描述约束】
禁止只写"美女/帅哥出场"，必须包含：
- 具体部位特写（眼睛、嘴唇、手指等）
- 动态描写（行走、转身、撩发等）
- S级剪影/线条感描述

输出格式：[特写] 部位+动作 [中景] 身体线条 [全景] 整体姿态
`;
```

### 2.5 实施清单

- [x] ✅ 扩展 `Character` 接口，添加 `VisualDescriptionField` 类型
- [x] ✅ 在 `CharacterCard.tsx` 中增加 Modal 触发按钮
- [x] ✅ 新建 `VisualDescriptionModal.tsx` 组件
- [x] ✅ 接入 AI 润色 API（`chatCompletion`）
- [x] ✅ 接入预览图生成 API（`generateImage`），支持 base64 参考图
- [ ] ⏳ 修改 `generateVisualPrompt` 函数，增加视觉化约束
- [ ] ⏳ 更新数据库迁移脚本（如果使用 Supabase）

---

## 3. 改进二：开篇钩子检测 ⏳ 待实施

### 3.1 问题分析

**当前问题**：
- 剧本解析没有检测开篇质量
- 用户可能以平淡寒暄开场，导致观众流失

**参考约束**：
> "三秒生死线"：每一集、每一场的前3秒（剧本的前三行），必须出现一个"钩子"。严禁以平淡的寒暄开场（如"你好""吃了没"）。

### 3.2 钩子检测规则

| 检测项 | 规则 | 评分影响 |
|--------|------|---------|
| 钩子关键词 | 前10行必须包含：！？、突然、猛地、响起、跪、倒、扑、冲、耳光、摔等 | 无则 -6分 |
| 平淡寒暄 | 检测开头是否为你好、您好、早上好、吃了没等 | 有则 -6分 |
| 强烈语气 | 检测是否有 ！？等标点 | 无则 -3分 |

### 3.3 新建质量检测服务

**待新建文件**: `services/ai/scriptQualityService.ts`

```typescript
/**
 * 剧本质量检测服务
 * 基于26条漫剧创作约束，对剧本进行量化评估
 */

interface QualityCheckResult {
  score: number;           // 总分 0-10
  issues: QualityIssue[];  // 问题列表
  suggestions: string[];   // 改进建议
}

interface QualityIssue {
  type: 'hook' | 'density' | 'rhythm' | 'visual' | 'dialogue';
  severity: 'error' | 'warning' | 'info';
  location: string;        // 问题位置
  description: string;     // 问题描述
  suggestion: string;      // 修改建议
}

/**
 * 开篇钩子检测
 */
export const detectOpeningHook = (scriptText: string): QualityCheckResult => {
  const lines = scriptText.split('\n').filter(l => l.trim());
  const firstLines = lines.slice(0, 10);

  const hookKeywords = [
    '！', '？', '"', '"',          // 强烈语气
    '突然', '猛地', '瞬间',        // 突发事件
    '响起', '传来', '爆发',        // 声音/冲突
    '跪', '倒', '扑', '冲',         // 强烈动作
    '耳光', '摔', '砸', '撕',        // 破坏性动作
  ];

  const hasHook = firstLines.some(line =>
    hookKeywords.some(k => line.includes(k))
  );

  const greetingPatterns = /^(你好|您好|早上好|晚安|吃了|在吗|嗨|嘿)[^a-zA-Z0-9]?/;
  const hasGreeting = greetingPatterns.test(scriptText);

  if (!hasHook || hasGreeting) {
    return {
      score: hasHook ? 8 : 4,
      issues: [{
        type: 'hook',
        severity: hasGreeting ? 'error' : 'warning',
        location: '开场前10行',
        description: hasGreeting
          ? '开场使用平淡寒暄，可能导致观众流失'
          : '开场缺乏冲突/悬念/危机元素',
        suggestion: '建议前三行内出现：质问、惊呼、命令、或巨大声响（如摔杯子、响亮的耳光声）'
      }],
      suggestions: [
        '第一句台词必须是质问、惊呼、命令',
        '或以巨大的声响/动作开场（如：响亮的耳光声）',
        '避免以"你好""吃了没"等平淡寒暄开始'
      ]
    };
  }

  return { score: 10, issues: [], suggestions: [] };
};
```

### 3.4 集成到剧本解析流程 ⏳ 待实施

**文件**: `services/ai/scriptService.ts`

```typescript
import { detectOpeningHook, detectMutedTest } from './scriptQualityService';

// 在 parseScriptToData 函数返回结果前
const qualityResult = detectOpeningHook(rawText);

if (qualityResult.score < 7) {
  logger.warn(LogCategory.AI, `⚠️ 剧本质量检测警告: ${qualityResult.issues.map(i => i.description).join(', ')}`);
}
```

### 3.5 UI 提示组件 ⏳ 待实施

**待新建文件**: `components/StageScript/QualityWarningBadge.tsx`

```tsx
interface QualityWarningBadgeProps {
  result: QualityCheckResult;
}

const QualityWarningBadge: React.FC<QualityWarningBadgeProps> = ({ result }) => {
  if (result.score >= 8) return null;

  return (
    <div className="bg-[var(--warning)]/10 border border-[var(--warning)] rounded-lg p-3">
      <div className="flex items-center gap-2 text-[var(--warning)] font-bold text-xs mb-2">
        <AlertCircle className="w-4 h-4" />
        剧本质量提醒 (评分: {result.score}/10)
      </div>
      <ul className="text-xs text-[var(--text-secondary)] space-y-1">
        {result.suggestions.map((s, i) => (
          <li key={i}>• {s}</li>
        ))}
      </ul>
    </div>
  );
};
```

### 3.6 实施清单

- [ ] ⏳ 新建 `services/ai/scriptQualityService.ts`
- [ ] ⏳ 实现 `detectOpeningHook` 函数
- [ ] ⏳ 在 `parseScriptToData` 中集成钩子检测
- [ ] ⏳ 新建 `QualityWarningBadge.tsx` 组件
- [ ] ⏳ 在 `StageScript` 界面中集成质量警告显示

---

## 4. 改进三：静音测试提示 ⏳ 待实施

### 4.1 问题分析

**参考约束**：
> "遮住台词，看动作能不能懂情绪？如果能，台词就是多余的，删掉。"

**当前问题**：
- 分镜动作描写可能过于简单
- 情绪可能通过台词直接说出而非动作传达

### 4.2 静音测试规则

| 检测项 | 规则 | 评分影响 |
|--------|------|---------|
| 纯对话镜头 | 动作描写 < 20字符 | -3分/个 |
| 情绪词汇冗余 | 台词包含"我很生气"等情绪描述 | -5分/个 |
| 视觉动词缺失 | 动作中没有"握紧"、"攥紧"、"颤抖"等 | -2分/个 |

### 4.3 静音测试检测函数 ⏳ 待实施

**文件**: `services/ai/scriptQualityService.ts` (追加)

```typescript
/**
 * 静音测试检测
 * 规则：如果遮住台词，仅看动作描写是否能理解情绪
 */
export const detectMutedTest = (shots: Shot[]): QualityCheckResult => {
  const issues: QualityIssue[] = [];

  const visualVerbs = [
    '握紧', '攥紧', '颤抖', '抽搐', '低头', '抬头',
    '挥拳', '重击', '撩发', '撕扯', '攥进', '抠进'
  ];

  const emotionalDialoguePatterns = [
    /我很[高兴-愤怒]/, /我[很-非常][生气-悲伤]/,
    /他[看起来-似乎]/, /气[氛-氛]/,
    /[悲-伤]痛/, /压[抑-郁]/
  ];

  shots.forEach((shot, index) => {
    // 检测是否是纯对话镜头
    const actionLength = shot.actionSummary?.length || 0;
    const hasVisualVerbs = visualVerbs.some(v =>
      shot.actionSummary?.includes(v)
    );

    const isDialogueOnly = actionLength < 20 || !hasVisualVerbs;

    // 检测冗余情绪台词
    const hasRedundantDialogue = shot.dialogue &&
      emotionalDialoguePatterns.some(p => p.test(shot.dialogue));

    if (isDialogueOnly && shot.dialogue) {
      issues.push({
        type: 'dialogue',
        severity: 'warning',
        location: `SHOT ${index + 1}`,
        description: '该镜头以对话为主，动作描写较少',
        suggestion: '建议增加角色动作（如：切牛排的手停顿、攥紧拳头等）'
      });
    }

    if (hasRedundantDialogue) {
      issues.push({
        type: 'dialogue',
        severity: 'error',
        location: `SHOT ${index + 1}`,
        description: '台词描述了情绪，而非通过动作传达',
        suggestion: '删除情绪词汇，让角色通过动作/表情传达情绪'
      });
    }
  });

  const avgScore = issues.length === 0 ? 10 : Math.max(5, 10 - issues.length * 1.5);

  return {
    score: avgScore,
    issues,
    suggestions: issues.length > 0
      ? ['每场戏确保有足够的动作描写', '情绪通过动作传达，而非直接说出']
      : []
  };
};
```

### 4.4 动作密度徽章 ⏳ 待实施

**文件**: `components/StageScript/ShotRow.tsx` (增强)

```tsx
const getActionDensityBadge = (actionSummary: string) => {
  const length = actionSummary?.length || 0;
  const hasVisualVerbs = /握紧|挥拳|重击|低头|撩发|攥紧|颤抖/.test(actionSummary);

  if (length < 20) {
    return (
      <span className="px-1.5 py-0.5 bg-[var(--error)]/20 text-[var(--error)] text-[8px] font-bold rounded">
        动作薄弱
      </span>
    );
  }

  if (hasVisualVerbs) {
    return (
      <span className="px-1.5 py-0.5 bg-[var(--success)]/20 text-[var(--success)] text-[8px] font-bold rounded">
        视觉化强
      </span>
    );
  }

  return null;
};
```

### 4.5 批量质量报告面板 ⏳ 待实施

**待新建文件**: `components/StageScript/ScriptQualityPanel.tsx`

```tsx
interface ScriptQualityPanelProps {
  shots: Shot[];
  scriptText: string;
}

const ScriptQualityPanel: React.FC<ScriptQualityPanelProps> = ({ shots, scriptText }) => {
  const hookResult = detectOpeningHook(scriptText);
  const mutedResult = detectMutedTest(shots);

  const totalScore = (hookResult.score + mutedResult.score) / 2;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[var(--text-primary)]">剧本质量报告</h3>
        <ScoreBadge score={totalScore} />
      </div>

      <QualitySection title="开篇钩子" result={hookResult} />
      <QualitySection title="动作密度（静音测试）" result={mutedResult} />

      <div className="mt-4 pt-4 border-t border-[var(--border-primary)]">
        <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">改进建议</h4>
        <ul className="space-y-1">
          {[...hookResult.suggestions, ...mutedResult.suggestions].map((s, i) => (
            <li key={i} className="text-xs text-[var(--text-secondary)]">• {s}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};
```

### 4.6 实施清单

- [ ] ⏳ 在 `scriptQualityService.ts` 中实现 `detectMutedTest` 函数
- [ ] ⏳ 在 `ShotRow.tsx` 中增加动作密度徽章显示
- [ ] ⏳ 新建 `ScriptQualityPanel.tsx` 批量质量报告组件
- [ ] ⏳ 在 `StageDirector` 界面中集成质量报告面板

---

## 5. 实施优先级与工作量

| 改进项 | 具体任务 | 工作量 | 难度 | 优先级 | 状态 |
|--------|---------|--------|------|--------|------|
| **2.角色类型扩展** | 扩展 Character 接口 | 小 | 低 | 🔴 必须 | ✅ 已完成 |
| | CharacterCard UI 增强 (Modal) | 中 | 中 | 🔴 必须 | ✅ 已完成 |
| | VisualDescriptionModal 组件 | 中 | 中 | 🔴 必须 | ✅ 已完成 |
| | AI 润色 API 接入 | 小 | 低 | 🔴 必须 | ✅ 已完成 |
| | 预览图生成 API (含 base64 参考图) | 中 | 中 | 🔴 必须 | ✅ 已完成 |
| | 视觉提示词生成约束 | 中 | 中 | 🔴 必须 | ⏳ 待实施 |
| **1.开篇钩子检测** | 新建 scriptQualityService.ts | 中 | 中 | 🔴 必须 | ⏳ 待实施 |
| | 集成到剧本解析流程 | 小 | 低 | 🔴 必须 | ⏳ 待实施 |
| | QualityWarningBadge 组件 | 小 | 低 | 🟡 建议 | ⏳ 待实施 |
| **3.静音测试** | detectMutedTest 函数 | 小 | 低 | 🔴 必须 | ⏳ 待实施 |
| | ShotRow 动作密度徽章 | 小 | 低 | 🟡 建议 | ⏳ 待实施 |
| | ScriptQualityPanel | 中 | 中 | 🟡 建议 | ⏳ 待实施 |

---

## 6. 文件清单

### 6.1 新建文件

| 文件路径 | 说明 | 状态 |
|---------|------|------|
| `components/StageAssets/VisualDescriptionModal.tsx` | 视觉描述编辑 Modal 组件 | ✅ 已完成 |
| `services/ai/scriptQualityService.ts` | 剧本质量检测服务 | ⏳ 待实施 |
| `components/StageScript/QualityWarningBadge.tsx` | 质量警告徽章组件 | ⏳ 待实施 |
| `components/StageScript/ScriptQualityPanel.tsx` | 批量质量报告面板 | ⏳ 待实施 |

### 6.2 修改文件

| 文件路径 | 修改内容 | 状态 |
|---------|---------|------|
| `types.ts` | 新增 `VisualDescriptionField` 接口，更新 `Character` 字段类型 | ✅ 已完成 |
| `components/StageAssets/CharacterCard.tsx` | 新增 Modal 触发按钮，更新 Props 类型 | ✅ 已完成 |
| `components/StageAssets/index.tsx` | 接入 AI 润色和预览图生成 API | ✅ 已完成 |
| `services/ai/visualService.ts` | 增加视觉化约束 | ⏳ 待实施 |
| `services/ai/scriptService.ts` | 集成质量检测 | ⏳ 待实施 |
| `components/StageScript/ShotRow.tsx` | 增加动作密度徽章 | ⏳ 待实施 |

---

## 7. 技术实现细节

### 7.1 VisualDescriptionModal 工作流程

```
用户点击按钮
    ↓
打开 Modal，显示已保存的数据（如有）
    ↓
用户输入 / 编辑原文本
    ↓
点击「AI 润色」
    ├→ 调用 handlePolishVisualDescription(text, fieldType, character)
    ├→ 通过 chatCompletion API 润色
    └→ 返回结果，显示在润色文本框
    ↓
点击「查看预览」
    ├→ 读取 character.imageUrl
    ├→ 如为 local: 格式，从 IndexedDB 读取并转为 base64
    ├→ 调用 generateImage(prompt, [base64参考图], ...)
    └→ 生成图片，显示在预览区
    ↓
点击「保存」
    └→ 返回 { original, polished, previewImageUrl } 结构
```

### 7.2 参考图处理逻辑

```typescript
// 本地图片转换为 base64 供 API 使用
if (character.imageUrl?.startsWith('local:')) {
  const localImageId = character.imageUrl.substring(6);
  const imageBlob = await imageStorageService.getImage(localImageId);
  const reader = new FileReader();
  reader.readAsDataURL(imageBlob);  // 转为 data:image/png;base64,...
  const base64Url = await base64Promise;
  referenceImages.push(base64Url);
}
```

### 7.3 AI 润色提示词模板

**标志性姿态**：
```
你是一个专业的漫画分镜视觉描述专家。请将用户输入的角色标志性姿态描述润色成专业的视觉指令。
要求：
1. 使用专业的视觉描述语言
2. 包含镜头角度、光影、构图等电影感描述
3. 保持角色特征一致性
4. 控制在100字以内
5. 只输出润色后的文本，不要其他解释
```

**病态微动作**：
```
你是一个专业的漫画分镜视觉描述专家。请将用户输入的角色病态微动作描述润色成专业的视觉指令。
要求：
1. 重点描述微动作的细节和表情变化
2. 使用特写或近景镜头语言
3. 强调情绪和心理状态
4. 控制在80字以内
5. 只输出润色后的文本，不要其他解释
```

---

## 8. 测试计划

### 8.1 单元测试

```typescript
// scriptQualityService.test.ts
describe('detectOpeningHook', () => {
  it('应检测到平淡寒暄开场', () => {
    const result = detectOpeningHook('你好，今天天气不错');
    expect(result.score).toBeLessThan(8);
    expect(result.issues[0].type).toBe('hook');
  });

  it('应检测到冲突开场', () => {
    const result = detectOpeningHook('"啪！"— 响亮的耳光声');
    expect(result.score).toBe(10);
  });
});

describe('detectMutedTest', () => {
  it('应检测到冗余情绪台词', () => {
    const shots: Shot[] = [{
      id: 'shot-1',
      actionSummary: '两人面对面站着',
      dialogue: '我很生气！',
      // ...
    }];
    const result = detectMutedTest(shots);
    expect(result.issues.some(i => i.severity === 'error')).toBe(true);
  });
});
```

### 8.2 集成测试

- [x] ✅ 创建包含标志性姿态的角色，验证 Modal 显示正常
- [x] ✅ AI 润色功能测试，验证返回专业描述
- [x] ✅ 预览图生成测试，验证 base64 参考图传递正确
- [ ] ⏳ 输入一段平淡寒暄的剧本，验证质量警告显示
- [ ] ⏳ 输入一段高密度动作的剧本，验证评分 >= 9
- [ ] ⏳ 创建包含微动作的角色，验证视觉提示词包含该描述

---

## 9. 后续规划

### 9.1 中优先级（两周内）

- [ ] 节奏标记系统（【加速区】/【减速区】）
- [ ] 动作四段式模板（起势 → 过程 → 落点 → 反应）
- [ ] 爆点统计（每场戏反转数量）

### 9.2 低优先级（长期）

- [ ] 剧本质量自动评分系统
- [ ] 道具关系标签系统
- [ ] 批量重写低质量剧本功能

---

## 10. 参考资料

- 顶级漫剧剧本创作绝对约束（26条）
- WL-AI-Director 项目规范文档 (SPEC.md)
- 剧本处理服务 (services/ai/scriptService.ts)
- 视觉资产生成服务 (services/ai/visualService.ts)
- 类型定义 (types.ts)
- 角色卡片组件 (components/StageAssets/CharacterCard.tsx)
- 视觉描述编辑 Modal (components/StageAssets/VisualDescriptionModal.tsx)

---

**文档作者**: AI 漫剧专家分析系统
**最后更新**: 2026-04-15
**版本历史**: v1.0 (2026-04-14) → v1.1 (2026-04-15) - 完成改进一：角色视觉化约束
