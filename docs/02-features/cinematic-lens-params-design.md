---
title: 电影级镜头参数系统设计文档
category: features
status: draft
audience: pm, developer
created: 2026-07-28
updated: 2026-07-28
related:
  - docs/03-api-reference/FILM_SYSTEM.md
  - docs/02-features/提示词功能全览.md
  - components/StageDirector/cameraMovementGuides.ts
  - components/StageDirector/constants.ts
  - components/StageDirector/CameraChoreographyModal.tsx
  - types.ts
---

# 电影级镜头参数系统设计文档

> **来源**：参考公众号「大麦AI漫剧」文章《电影级镜头全套 prompt！新手必看！》
> **核心借鉴点**：把「景深」从抽象的类型化选项（浅景深/深焦），升级为**可量化的光圈数值（f/#）+ 可视化对比预览**，让新手也能拍出电影感画面。
> **本文档目标**：把上轮分析的 6 个需求（R-A1 ~ R-A6）拆解为可落地的子任务，标注每一步要改哪个文件、加什么常量、注入到哪个提示词段落。

---

## 1. 背景与动机

### 1.1 文章核心要点

文章只讲一件事：**景深由光圈值（f/#）控制**，并提供三档预设：

| 光圈值 | 视觉效果 | 适用场景 |
|--------|----------|----------|
| `f/11` | 轻微虚化，画面清晰度高 | 需要保留背景细节 |
| `f/5.6` | 中等虚化，平衡主体与背景 | **最常用电影感光圈** |
| `f/2.8` | 强烈虚化，背景高度模糊 | 突出主体、营造梦幻感 |

文章配图用同一古风人物展示三档差异 —— 这本身就是一个产品形态：**参数对比可视化**。

### 1.2 与项目现状的差距

| 维度 | 文章做法 | 项目现状 | 差距 |
|------|----------|----------|------|
| 景深表达 | 数值化光圈 f/# | 类型化枚举（浅景深/深焦） | ❌ 没有数值 |
| Prompt 注入 | 直接写 `f/2.8, shallow DOF` | LLM 自由发挥 `[焦点策略，1句]` | ❌ 不稳定 |
| 可视化对比 | 三档同图对比 | 无 | ❌ 缺失 |
| 摄影参数维度 | 单维（光圈） | 单维（focusType） | ⚠️ 可扩展为五维 |
| 美学/胶片系统 | — | Film System 仅文档未实现 | ⚠️ 待落地 |

---

## 2. 项目现状精确定位

### 2.1 已有能力（不要重复造轮子）

| 能力 | 文件位置 | 说明 |
|------|----------|------|
| 视觉风格 6 种 | [services/ai/promptConstants.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/ai/promptConstants.ts) | `live-action` 已含 `shallow depth of field` |
| 运镜类型 30+ | [components/StageDirector/cameraMovementGuides.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/cameraMovementGuides.ts) | 含首尾帧构图指导 |
| 运镜编排弹窗 | [components/StageDirector/CameraChoreographyModal.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/CameraChoreographyModal.tsx) | 已有「焦点」下拉 |
| 摄影常量 | [components/StageDirector/constants.ts#L114-L122](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/constants.ts#L114-L122) | `CAMERA_SHOT_SIZES / ANGLES / SUBJECT_POSITIONS / FOCUS_TYPES / MOVEMENT_SPEEDS` |
| 结构化运镜类型 | [types.ts#L226-L247](file:///Users/wl/Desktop/job/learn/WL-AI-Director/types.ts#L226-L247) | `CameraChoreography` 接口（含 `startFocus`） |
| 运镜渲染函数 | [types.ts#L424-L449](file:///Users/wl/Desktop/job/learn/WL-AI-Director/types.ts#L424-L449) | `renderCameraChoreographyPrompt` |
| 关键帧提示词构建 | [components/StageDirector/utils.ts#L124-L216](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/utils.ts#L124-L216) | `buildKeyframePrompt` |
| AI 增强关键帧 | [services/ai/shotService.ts#L599](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/ai/shotService.ts#L599) | `enhanceKeyframePrompt`，含【摄影技术】段落 |
| 九宫格图片生成 | [services/ai/shotService.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/ai/shotService.ts) | `generateNineGridImage`（可复用为对比预览） |
| Film System 设计 | [docs/03-api-reference/FILM_SYSTEM.md](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/03-api-reference/FILM_SYSTEM.md) | 30+ 胶片预设 + 四层叠加（仅文档） |

### 2.2 关键缺口

1. **`CameraChoreography` 接口不对称**：`startFocus` 存在，但**没有 `endFocus`**（结束帧焦点丢失）。
2. **`FocusType` 是中文枚举**，没有对应的英文 prompt snippet 映射。
3. **`enhanceKeyframePrompt` 的【摄影技术】段落让 LLM 自由生成景深描述**，用户选择的光圈值没有硬注入。
4. **`buildKeyframePrompt`（基础版）完全没有【摄影技术】段落**。
5. **没有光圈-效果对比预览功能**（文章配图形态）。
6. **Film System 仅有设计文档，未代码实现**。

---

## 3. 需求总览与优先级矩阵

| ID | 需求名称 | 优先级 | 工作量 | 价值 | 依赖 |
|----|----------|--------|--------|------|------|
| **R-A1** | 光圈值数值化景深控制 | **P0** | 小 | ⭐⭐⭐⭐⭐ | 无 |
| **R-A2** | 光圈-效果对比预览 | **P0** | 中 | ⭐⭐⭐⭐⭐ | R-A1 |
| R-A3 | 五维镜头参数提示词分层系统 | P1 | 中 | ⭐⭐⭐⭐ | R-A1 |
| R-A4 | Film System 胶片系统落地 | P1 | 大 | ⭐⭐⭐⭐ | 无（已有设计文档） |
| R-A5 | 电影感预设档快捷栏 | P2 | 小 | ⭐⭐⭐ | R-A1、R-A3 |
| R-A6 | 摄影知识库内嵌 | P2 | 中 | ⭐⭐⭐ | R-A1 |

**MVP 范围**：R-A1 + R-A2 即可形成「文章核心思路的产品化闭环」。

---

## 4. 详细设计：R-A1 光圈值数值化景深控制

### 4.1 目标

把 `FocusType` 从 5 个中文枚举升级为 **8 档光圈数值 + 1 档自定义**，每档绑定英文 prompt snippet，自动注入到关键帧提示词的【摄影技术】段落。

### 4.2 数据结构改动

#### 4.2.1 新增光圈预设常量

**新增文件**：`components/StageDirector/lensPresets.ts`

```typescript
// 光圈值档位定义
export interface AperturePreset {
  /** 唯一 ID，如 'f1.4' */
  id: string;
  /** 显示名称，如 'f/1.4' */
  label: string;
  /** 光圈数值，1.4 / 2.8 / 5.6 / 8 / 11 / 16 */
  value: number;
  /** 中文描述 */
  descriptionCn: string;
  /** 适用场景 */
  useCaseCn: string;
  /** 英文 prompt snippet（注入到关键帧提示词） */
  promptSnippetEn: string;
  /** 对应的旧 FocusType（兼容老数据） */
  legacyFocusType?: FocusType;
}

export const APERTURE_PRESETS: AperturePreset[] = [
  {
    id: 'f1.4',
    label: 'f/1.4',
    value: 1.4,
    descriptionCn: '极浅景深',
    useCaseCn: '人像特写、情绪镜头',
    promptSnippetEn: 'shot at f/1.4, extremely shallow depth of field, razor-thin focus plane, dreamy bokeh, strong subject isolation, creamy background blur',
    legacyFocusType: '浅景深',
  },
  {
    id: 'f2.8',
    label: 'f/2.8',
    value: 2.8,
    descriptionCn: '强烈虚化',
    useCaseCn: '主体突出、梦幻感',
    promptSnippetEn: 'shot at f/2.8, shallow depth of field, creamy bokeh, subject isolation, cinematic dreamlike quality',
    legacyFocusType: '浅景深',
  },
  {
    id: 'f5.6',
    label: 'f/5.6',
    value: 5.6,
    descriptionCn: '中等虚化',
    useCaseCn: '最常用电影感光圈',
    promptSnippetEn: 'shot at f/5.6, balanced depth of field, mild background separation, classic cinematic look',
    legacyFocusType: '柔焦',
  },
  {
    id: 'f8',
    label: 'f/8',
    value: 8,
    descriptionCn: '轻微虚化',
    useCaseCn: '环境交代',
    promptSnippetEn: 'shot at f/8, moderate depth of field, slight background detail, environmental context preserved',
  },
  {
    id: 'f11',
    label: 'f/11',
    value: 11,
    descriptionCn: '全景清晰',
    useCaseCn: '需要保留背景细节',
    promptSnippetEn: 'shot at f/11, deep depth of field, sharp foreground to background, environmental storytelling',
    legacyFocusType: '全景清晰',
  },
  {
    id: 'f16',
    label: 'f/16',
    value: 16,
    descriptionCn: '深焦',
    useCaseCn: '大远景、风光',
    promptSnippetEn: 'shot at f/16, deep focus, everything in sharp focus, expansive cinematic landscape',
    legacyFocusType: '深焦',
  },
  {
    id: 'tilt-shift',
    label: '移轴',
    value: 0,
    descriptionCn: '移轴效果',
    useCaseCn: '微型化、俯拍城市',
    promptSnippetEn: 'tilt-shift lens effect, miniature faking, selective focus band, toy-town aesthetic',
    legacyFocusType: '移轴',
  },
  {
    id: 'custom',
    label: '自定义',
    value: 0,
    descriptionCn: '手动输入光圈值',
    useCaseCn: '高级用户',
    promptSnippetEn: '',  // 由用户输入框动态生成
  },
];

/** 旧 FocusType → 新 ApertureId 的迁移映射（用于 R-A1.5 数据迁移） */
export const LEGACY_FOCUS_TO_APERTURE: Record<FocusType, string> = {
  '浅景深': 'f2.8',
  '深焦': 'f16',
  '全景清晰': 'f11',
  '柔焦': 'f5.6',
  '移轴': 'tilt-shift',
};

/** 根据 apertureId 获取 prompt snippet */
export const getAperturePromptSnippet = (apertureId: string): string => {
  const preset = APERTURE_PRESETS.find(p => p.id === apertureId);
  return preset?.promptSnippetEn || '';
};
```

#### 4.2.2 扩展 `CameraChoreography` 接口

**修改文件**：[types.ts#L226-L247](file:///Users/wl/Desktop/job/learn/WL-AI-Director/types.ts#L226-L247)

```typescript
// 保留 FocusType 类型作为向后兼容（迁移期使用）
export type FocusType = '浅景深' | '深焦' | '全景清晰' | '柔焦' | '移轴';

// 新增：光圈 ID 类型
export type ApertureId = 'f1.4' | 'f2.8' | 'f5.6' | 'f8' | 'f11' | 'f16' | 'tilt-shift' | 'custom';

export interface CameraChoreography {
  // ... 现有字段保持不变 ...
  startShotSize: ShotSizeLabel;
  startAngle: CameraAngleLabel;
  startSubject: SubjectPosition;
  startFocus: FocusType;            // ⚠️ 保留，迁移期不删
  startAperture?: ApertureId;     // ✨ 新增：起始帧光圈值
  endAperture?: ApertureId;        // ✨ 新增：结束帧光圈值（填补 endFocus 缺失的对称性问题）
  movementType: string;
  // ... 其余字段不变 ...
}
```

### 4.3 子任务拆解（每步可独立验收）

#### 子任务 R-A1.1：创建光圈预设常量文件

- **操作**：新建 `components/StageDirector/lensPresets.ts`，内容如 §4.2.1 所示。
- **验收**：文件存在，`APERTURE_PRESETS` 导出 8 项，`getAperturePromptSnippet('f2.8')` 返回非空字符串。

#### 子任务 R-A1.2：扩展 `CameraChoreography` 接口

- **操作**：编辑 [types.ts#L232-L247](file:///Users/wl/Desktop/job/learn/WL-AI-Director/types.ts#L232-L247)，在 `startFocus` 后追加 `startAperture?` 和 `endAperture?` 两个可选字段。
- **为何可选**：保证老数据序列化/反序列化不报错（参考 [旧字段访问报错分析.md](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/05-troubleshooting/旧字段访问报错分析.md) 的教训）。
- **验收**：`tsc --noEmit` 通过，旧项目 JSON 加载不报错。

#### 子任务 R-A1.3：在 `CameraChoreographyModal` 增加光圈选择 UI

- **修改文件**：[components/StageDirector/CameraChoreographyModal.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/CameraChoreographyModal.tsx)
- **具体步骤**：
  1. 在文件顶部 import `APERTURE_PRESETS, ApertureId` from `./lensPresets`。
  2. 在 `startFocus` 选择框**下方**新增一个 `SelectField`：
     ```tsx
     <SelectField
       label="光圈"
       value={startAperture || 'f5.6'}
       options={APERTURE_PRESETS.map(p => ({ value: p.id, label: `${p.label} · ${p.descriptionCn}` }))}
       onChange={setStartAperture}
     />
     <p className="text-xs text-gray-500 mt-1">{APERTURE_PRESETS.find(p => p.id === startAperture)?.useCaseCn}</p>
     ```
  3. 在结束帧区块（参考第 231 行附近的 `endSubject`）追加对应的 `endAperture` 选择框。
  4. 提交时把 `startAperture` / `endAperture` 写入 `CameraChoreography` 对象。
- **验收**：弹窗中可选 8 档光圈；选择后保存，重新打开弹窗能回显。

#### 子任务 R-A1.4：注入光圈 prompt snippet 到 `renderCameraChoreographyPrompt`

- **修改文件**：[types.ts#L424-L449](file:///Users/wl/Desktop/job/learn/WL-AI-Director/types.ts#L424-L449) 的 `renderCameraChoreographyPrompt` 函数。
- **具体步骤**：
  1. 在文件顶部 import `getAperturePromptSnippet`。
  2. 修改函数体，在起始/结束行的中文标签后追加英文 snippet：
     ```typescript
     const startApertureSnippet = cc.startAperture ? getAperturePromptSnippet(cc.startAperture) : '';
     const endApertureSnippet = cc.endAperture ? getAperturePromptSnippet(cc.endAperture) : '';

     return `【运镜编排】
     0-${tStartEnd}s [起始:${cc.startShotSize}/${cc.startAngle}/主体${cc.startSubject}/${cc.startFocus}] ${actionSummary} — 镜头稳定构图，为运动预留空间
     ${startApertureSnippet ? `[Aperture] ${startApertureSnippet}` : ''}
     ${tStartEnd}-${tMoveEnd}s [${cc.movementType}] ${cc.movementPath} | 速度:${cc.movementSpeed}(${speedMap[cc.movementSpeed]}) 强度:${cc.movementIntensity}/10
     ${tMoveEnd}-${tEndEnd}s [结束:${cc.endShotSize}/${cc.endAngle}/主体${cc.endSubject}] 镜头到位，定格最终画面
     ${endApertureSnippet ? `[Aperture] ${endApertureSnippet}` : ''}`;
     ```
- **验收**：单元测试（新增 `tests/aperture-render.test.ts`）验证含 `f/2.8` 的 cc 输出包含 `shallow depth of field` 字符串。

#### 子任务 R-A1.5：注入光圈 prompt snippet 到 `enhanceKeyframePrompt`

- **修改文件**：[services/ai/shotService.ts#L599](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/ai/shotService.ts#L599) 的 `enhanceKeyframePrompt` 函数。
- **具体步骤**：
  1. 函数签名新增可选参数 `apertureId?: string`。
  2. 在【摄影技术】Cinematography 段落（约第 656 行）改造为：
     ```
     【摄影技术】Cinematography
     • 分辨率: 4K (3840×2160)
     • 光源: [主光/辅光/背光配置，1-2句]
     • 色彩: [色温/色调，1句]
     • 景深: ${apertureId ? `[已指定] ${getAperturePromptSnippet(apertureId)}` : '[焦点策略，1句]'}
     ```
     即：**用户选了光圈值就硬注入，没选就让 LLM 自由生成**（向后兼容）。
- **验收**：传入 `apertureId='f2.8'` 时，LLM 输出的【摄影技术】段落必然包含 `f/2.8` 或 `shallow` 字样。

#### 子任务 R-A1.6：注入光圈 prompt snippet 到 `buildKeyframePrompt`（基础版）

- **修改文件**：[components/StageDirector/utils.ts#L124-L216](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/utils.ts#L124-L216) 的 `buildKeyframePrompt` 函数。
- **具体步骤**：
  1. 函数签名新增可选参数 `apertureId?: string`。
  2. 在返回模板的【构图】段落之后、`characterConsistencyGuide` 之前，追加：
     ```typescript
     const apertureBlock = apertureId
       ? `\n\n【摄影技术】Cinematography\n${getAperturePromptSnippet(apertureId)}`
       : '';
     ```
  3. 同步修改 `buildKeyframePromptWithAI` 透传 `apertureId`。
  4. 同步修改 `buildPromptFromNineGridPanel`（九宫格单格用作首帧时也注入）。
- **验收**：调用 `buildKeyframePrompt(..., 'f2.8')` 返回值含 `shot at f/2.8`。

#### 子任务 R-A1.7：调用方透传光圈值

- **修改文件**：
  - [components/StageDirector/index.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/index.tsx)（关键帧生成入口）
  - [components/StageDirector/ShotWorkbench.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/ShotWorkbench.tsx)
  - [components/StageDirector/KeyframeEditor.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/KeyframeEditor.tsx)
- **具体步骤**：从 `shot.cameraChoreography.startAperture` 取值，透传给 `buildKeyframePrompt` / `buildKeyframePromptWithAI` / `enhanceKeyframePrompt`。
- **验收**：在弹窗中选择 `f/2.8` → 生成关键帧 → 在 [StagePrompts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StagePrompts/) 页查看提示词，应包含 `shot at f/2.8`。

#### 子任务 R-A1.8：旧数据迁移

- **修改文件**：[utils/dataMigration.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/utils/dataMigration.ts)
- **具体步骤**：新增迁移函数 `migrateFocusTypeToAperture`：
  ```typescript
  export const migrateFocusTypeToAperture = (shot: Shot): Shot => {
    if (shot.cameraChoreography?.startAperture) return shot;  // 已迁移
    if (shot.cameraChoreography?.startFocus) {
      shot.cameraChoreography.startAperture = LEGACY_FOCUS_TO_APERTURE[shot.cameraChoreography.startFocus];
    }
    return shot;
  };
  ```
- **验收**：加载旧项目 JSON，所有镜头的 `startAperture` 被自动填充；控制台无报错。

### 4.4 R-A1 整体验收标准

| # | 验收点 | 期望结果 |
|---|--------|----------|
| 1 | 弹窗可选 8 档光圈 | UI 正常 |
| 2 | 选择光圈后保存 | `startAperture` 字段持久化 |
| 3 | 重新打开弹窗 | 光圈值回显 |
| 4 | 生成关键帧 | 提示词含 `shot at f/X` |
| 5 | 加载旧项目 | 自动迁移，无报错 |
| 6 | TypeScript 编译 | `tsc --noEmit` 通过 |
| 7 | 单元测试 | `tests/aperture-render.test.ts` 通过 |

---

## 5. 详细设计：R-A2 光圈-效果对比预览

### 5.1 目标

借鉴文章配图形态：用户在 `CameraChoreographyModal` 选光圈时，**对同一首帧/参考图并排渲染 3 档（f/2.8 / f/5.6 / f/11）**，让用户直观选型。

### 5.2 复用现有能力

直接复用 [generateNineGridImage](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/ai/shotService.ts) 的「同一画面多角度生成」能力，改造为「同一画面 3 档光圈对比」。九宫格 3×3 网格中**只用第一行的 3 格**，其余留白或重复。

### 5.3 子任务拆解

#### 子任务 R-A2.1：新增 `ApertureComparisonModal` 组件

- **新增文件**：`components/StageDirector/ApertureComparisonModal.tsx`
- **职责**：
  1. 接收 `basePrompt`、`visualStyle`、`referenceImage`（首帧或参考图）作为 props。
  2. 调用 3 次图像生成 API，分别使用 `f/2.8`、`f/5.6`、`f/11` 的 prompt snippet。
  3. 横向并排展示 3 张图，下方标注光圈值和适用场景。
  4. 用户点击某张图后，把对应 `apertureId` 回填到 `CameraChoreographyModal`。
- **关键代码骨架**：
  ```tsx
  const APERTURE_COMPARISON = ['f2.8', 'f5.6', 'f11'];

  export const ApertureComparisonModal = ({ basePrompt, visualStyle, referenceImage, onSelect }) => {
    const [images, setImages] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});

    const generateOne = async (apertureId: string) => {
      setLoading(s => ({ ...s, [apertureId]: true }));
      const snippet = getAperturePromptSnippet(apertureId);
      const fullPrompt = `${basePrompt}\n\n【摄影技术】Cinematography\n${snippet}`;
      const img = await generateImage({ prompt: fullPrompt, referenceImage, visualStyle });
      setImages(s => ({ ...s, [apertureId]: img }));
      setLoading(s => ({ ...s, [apertureId]: false }));
    };

    useEffect(() => { APERTURE_COMPARISON.forEach(generateOne); }, []);

    return (
      <div className="grid grid-cols-3 gap-4">
        {APERTURE_COMPARISON.map(id => (
          <ApertureCard key={id} apertureId={id} image={images[id]} loading={loading[id]} onClick={() => onSelect(id)} />
        ))}
      </div>
    );
  };
  ```
- **验收**：弹窗打开后并行生成 3 张图，全部加载完成后可点击选择。

#### 子任务 R-A2.2：在 `CameraChoreographyModal` 添加「对比预览」入口

- **修改文件**：[components/StageDirector/CameraChoreographyModal.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/CameraChoreographyModal.tsx)
- **具体步骤**：
  1. 在光圈选择框右侧增加一个 `🎬 对比预览` 按钮。
  2. 点击后打开 `ApertureComparisonModal`，传入当前首帧图（如有）+ 视觉风格。
  3. `onSelect` 回调写入 `startAperture`。
- **验收**：点击按钮 → 弹出对比弹窗 → 3 张图生成 → 点击某张 → 主弹窗的光圈选择同步更新。

#### 子任务 R-A2.3：并发控制与加载体验

- **修改文件**：`ApertureComparisonModal.tsx`
- **具体步骤**：
  1. 3 张图并行生成，但走 [concurrencyLimiter.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/ai/concurrencyLimiter.ts) 限制并发。
  2. 每张图独立 loading 状态，独立失败重试（最多 1 次）。
  3. 全部完成后顶部显示「3/3 已就绪，点击选型」。
- **验收**：网络异常时单张图失败不影响其他两张；重试按钮可恢复。

#### 子任务 R-A2.4：对比结果可保存到资产库

- **修改文件**：`ApertureComparisonModal.tsx`
- **具体步骤**：每张对比图右下角加「保存到资产库」按钮，调用 [assetLibraryService.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/assetLibraryService.ts) 的 `saveAsset`。
- **验收**：保存后可在 [AssetLibraryPage](file:///Users/wl/Desktop/job/learn/WL-AI-Director/src/components/AssetLibrary/AssetLibraryPage.tsx) 看到该图。

### 5.4 R-A2 整体验收标准

| # | 验收点 | 期望结果 |
|---|--------|----------|
| 1 | 点击「对比预览」 | 3 张图并行生成 |
| 2 | 单张失败 | 其他两张不受影响 |
| 3 | 点击某张图 | 光圈值回填到主弹窗 |
| 4 | 保存到资产库 | 资产库可见 |
| 5 | 关闭弹窗再打开 | 不残留旧状态 |

---

## 6. 详细设计：R-A3 五维镜头参数提示词分层系统

### 6.1 目标

把当前的「焦点」单维参数扩展为**五维摄影参数**，每维绑定 prompt snippet，组合后注入关键帧提示词。

### 6.2 五维参数定义

| 维度 | 常量名 | 档位示例 | 来源 |
|------|--------|----------|------|
| 光圈 f/# | `APERTURE_PRESETS` | f/1.4 ~ f/16 | R-A1（文章直接借鉴） |
| 焦段 mm | `FOCAL_LENGTH_PRESETS` | 14/24/35/50/85/135mm | 系列扩展 |
| 快门 | `SHUTTER_PRESETS` | 1/24s / 1/50s / 1/120s | 系列扩展 |
| 滤镜 | `FILTER_PRESETS` | ND/CPL/柔光/Mist | 系列扩展 |
| 布光 | `LIGHTING_PRESETS` | 三点光/Rembrandt/蝴蝶光/逆光 | shotService.ts 已提及 |

### 6.3 子任务拆解

#### 子任务 R-A3.1：扩展 `lensPresets.ts` 增加焦段/快门/滤镜/布光常量

- **修改文件**：`components/StageDirector/lensPresets.ts`（R-A1.1 已创建）
- **新增内容**：参照 `APERTURE_PRESETS` 的结构，为每个维度定义 4-6 个预设档位 + prompt snippet。
- **示例**：
  ```typescript
  export const FOCAL_LENGTH_PRESETS = [
    { id: '14mm', label: '14mm 超广角', promptSnippetEn: '14mm ultra-wide angle lens, expansive field of view, strong perspective distortion', useCaseCn: '大远景、建筑' },
    { id: '24mm', label: '24mm 广角', promptSnippetEn: '24mm wide angle lens, broad environmental context', useCaseCn: '环境交代' },
    { id: '35mm', label: '35mm 环境', promptSnippetEn: '35mm lens, environmental portrait, natural perspective', useCaseCn: '环境人像' },
    { id: '50mm', label: '50mm 标准', promptSnippetEn: '50mm standard lens, natural human-eye perspective', useCaseCn: '标准人像' },
    { id: '85mm', label: '85mm 人像', promptSnippetEn: '85mm portrait lens, flattering compression, mild background separation', useCaseCn: '人像特写' },
    { id: '135mm', label: '135mm 长焦', promptSnippetEn: '135mm telephoto lens, strong background compression, isolated subject', useCaseCn: '压缩感、远距离特写' },
  ];

  export const LIGHTING_PRESETS = [
    { id: 'three-point', label: '三点光', promptSnippetEn: 'three-point lighting setup (key, fill, back)', useCaseCn: '标准访谈' },
    { id: 'rembrandt', label: '伦勃朗光', promptSnippetEn: 'Rembrandt lighting, characteristic triangle on cheek', useCaseCn: '戏剧感、人物肖像' },
    { id: 'butterfly', label: '蝴蝶光', promptSnippetEn: 'butterfly lighting, symmetrical shadow under nose', useCaseCn: '正面肖像、时尚' },
    { id: 'backlight', label: '逆光', promptSnippetEn: 'backlit, strong rim light, silhouette potential', useCaseCn: '剪影、轮廓' },
    { id: 'chiaroscuro', label: '明暗对比', promptSnippetEn: 'chiaroscuro lighting, strong contrast, Caravaggio-esque', useCaseCn: '高反差、油画感' },
  ];
  // SHUTTER_PRESETS / FILTER_PRESETS 同理
  ```

#### 子任务 R-A3.2：扩展 `CameraChoreography` 接口

- **修改文件**：[types.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/types.ts)
- **新增字段**（全部可选，向后兼容）：
  ```typescript
  export interface CameraChoreography {
    // ... 现有字段 ...
    startAperture?: ApertureId;
    endAperture?: ApertureId;
    startFocalLength?: string;   // ✨ 新增
    startShutter?: string;        // ✨ 新增
    startFilter?: string;         // ✨ 新增
    startLighting?: string;       // ✨ 新增
    endFocalLength?: string;
    endShutter?: string;
    endFilter?: string;
    endLighting?: string;
  }
  ```

#### 子任务 R-A3.3：构建 `buildCinematographyBlock` 统一拼接函数

- **新增文件**：`components/StageDirector/cinematographyBuilder.ts`
- **职责**：接收 `CameraChoreography`，输出完整的【摄影技术】段落字符串。
  ```typescript
  export const buildCinematographyBlock = (cc: CameraChoreography, frameType: 'start' | 'end'): string => {
    const prefix = frameType === 'start' ? 'start' : 'end';
    const aperture = cc[`${prefix}Aperture` as keyof CameraChoreography] as string;
    const focal = cc[`${prefix}FocalLength` as keyof CameraChoreography] as string;
    // ...
    const snippets = [
      aperture && getAperturePromptSnippet(aperture),
      focal && getFocalLengthPromptSnippet(focal),
      // ...
    ].filter(Boolean);
    return snippets.length > 0
      ? `【摄影技术】Cinematography\n${snippets.join('\n')}`
      : '';
  };
  ```
- **价值**：把分散在 `buildKeyframePrompt` / `enhanceKeyframePrompt` / `renderCameraChoreographyPrompt` 三处的「摄影技术」拼接逻辑收敛到一处。

#### 子任务 R-A3.4：在三个注入点替换为 `buildCinematographyBlock`

- **修改文件**：
  - [types.ts#L424](file:///Users/wl/Desktop/job/learn/WL-AI-Director/types.ts#L424) `renderCameraChoreographyPrompt`
  - [components/StageDirector/utils.ts#L124](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/utils.ts#L124) `buildKeyframePrompt`
  - [services/ai/shotService.ts#L599](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/ai/shotService.ts#L599) `enhanceKeyframePrompt`
- **操作**：把 R-A1.4 / R-A1.5 / R-A1.6 的零散注入替换为 `buildCinematographyBlock(cc, frameType)` 调用。

#### 子任务 R-A3.5：UI 扩展（折叠面板）

- **修改文件**：[CameraChoreographyModal.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/CameraChoreographyModal.tsx)
- **操作**：在「光圈」选择框下方新增一个可折叠的「高级摄影参数」面板，包含焦段/快门/滤镜/布光 4 个 SelectField。
- **验收**：默认折叠，展开后可选；不选时不影响提示词。

### 6.4 R-A3 整体验收标准

| # | 验收点 | 期望结果 |
|---|--------|----------|
| 1 | 选齐 5 维参数 | 提示词【摄影技术】段落含 5 行 snippet |
| 2 | 只选光圈 | 仅光圈 snippet 注入，其余维度不报错 |
| 3 | 不选任何参数 | 退化为原行为（LLM 自由生成） |
| 4 | 单元测试 | `tests/cinematography-builder.test.ts` 通过 |

---

## 7. 详细设计：R-A4 Film System 胶片系统落地

### 7.1 目标

把 [FILM_SYSTEM.md](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/03-api-reference/FILM_SYSTEM.md) 设计文档落地为代码实现：30+ 胶片预设 + 四层叠加（胶片/相机/镜头/灯光美学）+ 3 滑块环境参数。

### 7.2 子任务拆解

#### 子任务 R-A4.1：创建 `filmData.ts` 数据文件

- **新增文件**：`src/modules/film/data/filmData.ts`
- **内容**：按 [FILM_SYSTEM.md §2](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/03-api-reference/FILM_SYSTEM.md) 定义的 `FilmPreset` / `PresetOption` 接口，填入 30+ 胶片预设、相机预设、镜头预设、灯光预设、美学修饰预设。
- **数据来源**：参考 Kodak Portra 400 / Fuji Velvia 50 / CineStill 800T / Ilford HP5 等公开胶片参数。
- **验收**：导出 `FILM_PRESETS` 30+ 项、`CAMERA_PRESETS` 5+ 项、`LENS_PRESETS` 10+ 项、`LIGHTING_PRESETS` 11+ 项、`AESTHETIC_PRESETS` 12+ 项。

#### 子任务 R-A4.2：创建 `FilmStylePanel` 组件

- **新增文件**：`src/modules/film/components/FilmStylePanel.tsx`
- **职责**：四层叠加选择 UI（胶片 → 相机 → 镜头 → 灯光/美学），每层一个 SelectField。
- **验收**：四层独立可选，组合后生成完整 prompt snippet。

#### 子任务 R-A4.3：创建 `AtmosphereControls` 三滑块组件

- **新增文件**：`src/modules/film/components/AtmosphereControls.tsx`
- **职责**：大气透视 / 空气透视 / 雾气湿度三个 0-100 滑块。
- **联动**：选择胶片后自动调用 [atmosphereRecommender](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/03-api-reference/FILM_SYSTEM.md) 推荐值。
- **验收**：滑块值变化时实时更新 prompt snippet。

#### 子任务 R-A4.4：创建 `customFilmStore` 自定义胶片存储

- **新增文件**：`src/modules/film/services/customFilmStore.ts`
- **职责**：基于 [indexedDB.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/src/services/indexedDB.ts) 存储用户自定义胶片。
- **验收**：CRUD 完整，刷新页面后自定义胶片不丢失。

#### 子任务 R-A4.5：集成到 `buildKeyframePrompt`

- **修改文件**：[components/StageDirector/utils.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/utils.ts)
- **操作**：在 `buildKeyframePrompt` 签名新增 `filmStyle?: FilmStyleConfig` 参数，把 filmStyle 拼接的 snippet 注入到【视觉风格】段落之后。
- **验收**：选择 Kodak Portra 400 后，提示词含 `Kodak Portra 400 film, warm skin tones, fine grain`。

#### 子任务 R-A4.6：在 `StageDirector` 入口添加 Film System 面板

- **修改文件**：[components/StageDirector/index.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/index.tsx)
- **操作**：在工具栏新增「胶片系统」按钮，点击打开 `FilmStylePanel` 弹窗。
- **验收**：UI 可用，选择后影响后续关键帧生成。

### 7.3 R-A4 整体验收标准

| # | 验收点 | 期望结果 |
|---|--------|----------|
| 1 | 30+ 胶片可选 | 数据完整 |
| 2 | 四层叠加 | 组合 prompt 正确拼接 |
| 3 | 三滑块 | 实时更新 prompt |
| 4 | 自定义胶片 CRUD | 持久化 |
| 5 | 注入关键帧 | 提示词含胶片 snippet |

---

## 8. 详细设计：R-A5 电影感预设档快捷栏

### 8.1 目标

提供 6 个开箱即用的预设组合，新手一键应用即可获得电影感画面。

### 8.2 预设档定义

| 预设档 | 光圈 | 焦段 | 布光 | 视觉风格 | 适用场景 |
|--------|------|------|------|----------|----------|
| 人像特写档 | f/1.4 | 85mm | 蝴蝶光 | live-action | 情绪镜头、面部特写 |
| 采访档 | f/2.8 | 50mm | 三点光 | live-action | 访谈、对话 |
| 风光远景档 | f/16 | 14mm | 自然光 | live-action | 大远景、风光 |
| 动作戏档 | f/5.6 | 35mm | 逆光 | live-action | 动作、追车 |
| 梦幻回忆档 | f/2.8 | 50mm | 柔光 | oil-painting | 回忆、梦境 |
| 黑色电影档 | f/5.6 | 50mm | 明暗对比 | live-action | 黑色电影、悬疑 |

### 8.3 子任务拆解

#### 子任务 R-A5.1：创建 `cinematicPresets.ts` 预设档数据

- **新增文件**：`components/StageDirector/cinematicPresets.ts`
- **内容**：6 个预设档定义，每档包含 5 维参数 + 视觉风格 + 适用场景说明。

#### 子任务 R-A5.2：在 `StageDirector` 工具栏添加快捷栏

- **修改文件**：[components/StageDirector/index.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/index.tsx)
- **操作**：工具栏左侧横向排列 6 个按钮（图标 + 标签），点击后一键应用所有参数。
- **验收**：点击「人像特写档」→ 弹窗中光圈/焦段/布光/视觉风格同步更新。

#### 子任务 R-A5.3：支持自定义预设档保存

- **修改文件**：`cinematicPresets.ts`
- **操作**：基于 [userPreferencesService.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/userPreferencesService.ts) 持久化用户自定义预设档。
- **验收**：保存后刷新页面预设档仍在。

### 8.4 R-A5 整体验收标准

| # | 验收点 | 期望结果 |
|---|--------|----------|
| 1 | 6 个预设档可见 | 工具栏渲染正常 |
| 2 | 一键应用 | 所有参数同步 |
| 3 | 自定义保存 | 持久化 |

---

## 9. 详细设计：R-A6 摄影知识库内嵌

### 9.1 目标

把文章本身做成产品内文档，新手在创作过程中可随时学习。

### 9.2 子任务拆解

#### 子任务 R-A6.1：创建 `LensKnowledgeBase` 组件

- **新增文件**：`components/Onboarding/LensKnowledgeBase.tsx`
- **内容**：分章节教学，每章包含：
  - 概念说明（光圈是什么、景深怎么控制）
  - 图文示例（参考文章配图）
  - 一键套用按钮（跳转到 `StageDirector` 并应用对应参数）

#### 子任务 R-A6.2：在 `Onboarding` 流程增加「镜头小课堂」步骤

- **修改文件**：[components/Onboarding/index.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/Onboarding/index.tsx)
- **操作**：在 `WorkflowPage` 之后新增 `LensKnowledgePage`，引导新手学习第一课「光圈与景深」。
- **验收**：新手引导流程包含镜头小课堂。

#### 子任务 R-A6.3：在 `StageDirector` 工具栏添加「📚」帮助按钮

- **修改文件**：[components/StageDirector/index.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/index.tsx)
- **操作**：工具栏右侧添加「📚 镜头小课堂」按钮，点击打开 `LensKnowledgeBase` 弹窗。
- **验收**：随时可查看教学，关闭后回到原工作流。

### 9.3 R-A6 整体验收标准

| # | 验收点 | 期望结果 |
|---|--------|----------|
| 1 | Onboarding 含镜头小课堂 | 新手引导完整 |
| 2 | StageDirector 可随时打开 | 不打断工作流 |
| 3 | 一键套用 | 跳转并应用参数 |

---

## 10. 技术方案：提示词注入流程图

```
用户在 CameraChoreographyModal 选参数
        │
        ├─ startAperture    ─┐
        ├─ startFocalLength  ─┤
        ├─ startShutter      ─┤ → buildCinematographyBlock(cc, 'start')
        ├─ startFilter       ─┤       │
        └─ startLighting    ─┘       ▼
                                  【摄影技术】Cinematography
                                  shot at f/2.8, shallow DOF
                                  85mm portrait lens
                                  butterfly lighting
                                       │
                                       ▼
        ┌──────────────────────────────┴──────────────────────────────┐
        │                                                              │
        ▼                                                              ▼
buildKeyframePrompt（基础版）                          enhanceKeyframePrompt（AI 增强版）
  追加到【构图】之后                                    替换【摄影技术】占位符
        │                                                              │
        └──────────────────────┬───────────────────────────────────────┘
                               ▼
                       最终关键帧提示词
                               │
                               ▼
                       generateImage → 关键帧图片
```

---

## 11. 里程碑与排期

| 里程碑 | 范围 | 子任务数 | 优先级 |
|--------|------|----------|--------|
| **M1：光圈数值化 MVP** | R-A1.1 ~ R-A1.8 | 8 | P0 |
| **M2：对比预览** | R-A2.1 ~ R-A2.4 | 4 | P0 |
| M3：五维参数扩展 | R-A3.1 ~ R-A3.5 | 5 | P1 |
| M4：Film System 落地 | R-A4.1 ~ R-A4.6 | 6 | P1 |
| M5：预设档快捷栏 | R-A5.1 ~ R-A5.3 | 3 | P2 |
| M6：知识库内嵌 | R-A6.1 ~ R-A6.3 | 3 | P2 |

**MVP 上线标准**：完成 M1 + M2 即可形成「文章核心思路的产品化闭环」。

---

## 12. 风险与回滚策略

| 风险 | 影响 | 缓解措施 | 回滚方案 |
|------|------|----------|----------|
| `CameraChoreography` 接口扩展导致旧数据加载失败 | 高 | 所有新增字段设为可选；新增迁移函数 | 还原 types.ts，删除可选字段 |
| `enhanceKeyframePrompt` 注入光圈后 LLM 输出不稳定 | 中 | 用 `${snippet}` 模板字符串硬注入，不依赖 LLM 重新生成 | 关闭 `apertureId` 参数透传 |
| 对比预览功能消耗过多图像生成 API 配额 | 中 | 走 concurrencyLimiter 限并发；用户可选「仅生成 1 档」 | 隐藏「对比预览」按钮 |
| Film System 数据量过大影响首屏加载 | 低 | filmData.ts 拆分为多个文件按需加载 | 全量延迟加载 |
| 自定义预设档与团队共享冲突 | 低 | 仅存本地 IndexedDB，不参与云同步 | 加 `localOnly: true` 标记 |

---

## 13. 测试计划

### 13.1 单元测试

| 测试文件 | 覆盖范围 |
|----------|----------|
| `tests/aperture-render.test.ts` | R-A1.4：`renderCameraChoreographyPrompt` 输出含光圈 snippet |
| `tests/cinematography-builder.test.ts` | R-A3.3：`buildCinematographyBlock` 五维组合 |
| `tests/data-migration.test.ts` | R-A1.8：旧 `FocusType` → `ApertureId` 迁移 |
| `tests/film-data.test.ts` | R-A4.1：30+ 胶片数据完整性 |

### 13.2 集成测试

| 测试场景 | 验证点 |
|----------|--------|
| 在弹窗选 f/2.8 → 生成关键帧 | 提示词含 `shot at f/2.8` |
| 加载旧项目 | `startAperture` 自动填充 |
| 对比预览 3 张图 | 全部加载完成可点击 |
| 一键应用预设档 | 5 维参数同步更新 |

### 13.3 回归测试

- 现有 `tests/canvas-integration.test.ts` 必须全绿
- 现有 `tests/scriptParserSkill.test.ts` 不受影响
- 现有 `tests/project-flow.test.tsx` 项目流程不中断

---

## 14. 附录：参考与索引

### 14.1 参考文章

- **来源**：公众号「大麦AI漫剧」《电影级镜头全套 prompt！新手必看！》
- **链接**：https://mp.weixin.qq.com/s/tGTqciMUd-3BqXcqIY6xjQ
- **核心借鉴**：景深由光圈值（f/#）控制，三档预设（f/11 / f/5.6 / f/2.8）对应明确视觉效果。

### 14.2 项目内相关文档

- [REQUIREMENTS.md](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/00-project/REQUIREMENTS.md) — 需求总文档（实现后追加 R-17 ~ R-XX）
- [FILM_SYSTEM.md](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/03-api-reference/FILM_SYSTEM.md) — 胶片系统设计文档
- [提示词功能全览.md](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/02-features/提示词功能全览.md) — 提示词系统全览
- [canvas-feature-integration-plan.md](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/02-features/canvas-feature-integration-plan.md) — 画布功能集成计划（参考文档风格）

### 14.3 关键代码位置索引

| 模块 | 文件 | 行号 | 用途 |
|------|------|------|------|
| 摄影常量 | [components/StageDirector/constants.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/constants.ts) | L114-L122 | `CAMERA_FOCUS_TYPES` 等 |
| 运镜指导 | [components/StageDirector/cameraMovementGuides.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/cameraMovementGuides.ts) | L11-L120 | 30+ 运镜类型 |
| 运镜编排弹窗 | [components/StageDirector/CameraChoreographyModal.tsx](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/CameraChoreographyModal.tsx) | L185-L231 | 焦点下拉位置 |
| 类型定义 | [types.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/types.ts) | L226-L247, L424-L449 | `CameraChoreography` + 渲染函数 |
| 关键帧提示词 | [components/StageDirector/utils.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/components/StageDirector/utils.ts) | L124-L216 | `buildKeyframePrompt` |
| AI 增强提示词 | [services/ai/shotService.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/services/ai/shotService.ts) | L599+ | `enhanceKeyframePrompt` |
| 数据迁移 | [utils/dataMigration.ts](file:///Users/wl/Desktop/job/learn/WL-AI-Director/utils/dataMigration.ts) | — | 旧字段迁移 |

---

## 15. 后续行动

1. **评审**：本设计文档评审通过后，将 R-A1 / R-A2 追加到 [REQUIREMENTS.md](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/00-project/REQUIREMENTS.md) 的「待规划需求」段，编号 R-20 / R-21。
2. **拆 issue**：按 §11 里程碑把 29 个子任务拆为 GitHub Issue，挂到对应里程碑。
3. **M1 启动**：先做 R-A1.1（创建 `lensPresets.ts`）和 R-A1.2（扩展接口），这两个子任务无任何依赖，可并行启动。
4. **持续更新**：实现每个子任务后，在本文档对应小节标题后追加 `✅ 已完成` 标记。

---

*本设计文档基于 2026-07-28 项目状态撰写，如代码结构发生重大变化需同步更新。*
