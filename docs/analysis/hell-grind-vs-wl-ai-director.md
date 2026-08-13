# Hell-Grind-AIGC-Skill vs WL-AI-Director 对比分析报告

## 一、两个项目概述

### Hell-Grind-AIGC-Skill (HGAS)

- **定位**：模型无关的 AIGC 视频生产管理工作流（Codex Skill 形式）
- **来源**：从 Higgsfield 的 95 分钟 AI 故事片《Hell Grind》生产流程中提取
- **核心**：一套方法论 + 数据 schema + 本地工具，不包含代码应用
- **技术形态**：Python 脚本（init/validate/audit）+ Markdown 方法论文档（22 个 reference 模块）
- **安全原则**：默认不调用生成模型、不扣费、不上传、0 网络/0 DB

### WL-AI-Director (当前项目)

- **定位**：AI 一站式短剧/漫剧生成平台（Web 应用）
- **核心**：Script-to-Asset-to-Keyframe 工业化工作流
- **技术形态**：React 19 + TypeScript + Zustand + IndexedDB + PocketBase
- **AI 能力**：剧本解析 → 视觉提示词 → 图片生成 → 关键帧驱动视频生成 → 视频编辑
- **多模型支持**：智谱 AI、自建 WLDrama、OpenAI 兼容、Veo、Sora-2

---

## 二、可借鉴的功能与设计方式（按优先级排序）

### 1. 七层提示词架构（强烈推荐，影响全局）

**HGAS 做法**：将提示词分解为七个层级，每层解决不同问题：

| 层              | 解决的问题                             |
| --------------- | -------------------------------------- |
| L1 意图与验收   | 本镜为什么存在，观众要读到什么         |
| L2 资产与引用   | 谁出现、哪个批准版本、参考继承什么     |
| L3 空间与数量   | 人数、前中后景、屏幕方向、唯一物体     |
| L4 表演与物理   | 触发、重心、接触、反作用和落定         |
| L5 摄影与剪辑   | 起始构图、一个主运动、结束构图和切点   |
| L6 视听质感     | 光源、曝光、颜色、材质、对白和环境声   |
| L7 连续性与风险 | 必须保持、本镜变化、禁止出现、交付规格 |

**当前项目现状**：`visualService.ts` 直接生成一个扁平的 prompt 字符串，没有结构分层。`promptConstants.ts` 只是风格词库，不是分层架构。

**借鉴理由**：

- 当前项目的核心痛点之一是**角色一致性**和**镜头连贯性**不足。七层架构从方法论上解决了"提示词为什么不管用"的问题——因为信息没有分层组织。
- 七层架构可以作为 AI 提示词生成的**结构化模板**，让 LLM 按层输出，而不是自由发挥。
- 当某一层出问题时，可以**精准定位**（是资产层的问题还是摄影层的问题），而不是盲目重写整个提示词。

**落地建议**：

- 在 `types.ts` 新增 `StructuredPrompt` 类型，按七层组织字段。
- 在 `services/ai/visualService.ts` 和 `shotService.ts` 中，让 AI 按层输出 JSON，再组装成最终 prompt。
- 三种信息预算（精简版/标准版/导演版）可作为 UI 切换选项。

---

### 2. 失败诊断系统与错误码（强烈推荐，直接提升质量）

**HGAS 做法**：定义了 6 大类 ~30 个错误码，覆盖：

- **资产与身份**：F-ID-DRIFT（脸/体型漂移）、F-STATE-DRIFT（服装/伤势回退）、F-REF-SCOPE（参考构图带入）
- **空间与连续性**：F-COUNT（人数错误）、F-SCREEN-DIR（左右翻转）、F-AXIS（越轴）
- **动作与表演**：F-ACTION-OVERLOAD（动作超载）、F-PHYSICS（物理失真）、F-UNSCRIPTED-MOVE（静止角色自动动）
- **摄影与剪辑**：F-CAMERA-CONFLICT（多主运镜冲突）、F-CAMERA-PATH（路径错误）、F-JITTER（手持变故障抖动）
- **对白与声音**：F-DIALOGUE-TEXT（加词漏词）、F-LIPSYNC（口型错）、F-AUDIO-POLLUTION（自动音乐）
- **光色与材质**：F-LIGHT-DIR（光源换边）、F-MATERIAL（塑料化）、F-WEATHER（天气贴层）

诊断决策树：资产事实 → 镜头契约 → 提示词表达 → 平台适配 → 生成随机性 → 后期。

**当前项目现状**：`consistencyService.ts` 仅检查服装/发型/配饰/体貌一致性，检查维度单一。生成失败后没有错误码体系，用户只能"重新生成"。

**借鉴理由**：

- 当前项目已有 `renderLogService.ts` 记录渲染日志，但没有**结构化的失败分类**。用户遇到"角色脸变了"、"镜头方向反了"等问题时，无法系统化诊断和修复。
- 错误码可以直接集成到 AI 一致性检查的 prompt 中，让 AI 按错误码分类输出诊断结果。
- "诊断 → 定位责任层 → 最小修复 → 只改变一个变量复测"的方法论可以大幅减少盲目重试。

**落地建议**：

- 新建 `services/ai/failureDiagnosisService.ts`，定义错误码枚举和诊断 prompt。
- 在 `renderLogService.ts` 扩展，增加 `failureCodes` 和 `responsibilityLayer` 字段。
- 在 StageDirector 的 VideoGenerator 失败后，弹出诊断面板而非简单的"重新生成"按钮。

---

### 3. 迭代追踪系统（推荐，解决"盲目抽卡"问题）

**HGAS 做法**：将生产过程拆为 5 个可追溯对象：

```
prompt version → batch → generation → selection → iteration
```

- **batch**：同一提示词和参数的一组抽样
- **iteration**：记录 changed_variables、hypothesis（可证伪假设）、expected_improvement、decision、next_action
- **停止条件**：连续两个批次同一错误无改善 → 回到上层重写或拆镜，而非继续抽卡

**当前项目现状**：图片/视频生成后直接保存，没有批次概念，没有假设/变量隔离机制。用户反复点击"生成"但不知道每次改变了什么。

**借鉴理由**：

- 当前项目的 Canvas 模块已有图片变体功能（VariantPanel），但没有**批次/迭代记录**。用户不知道"这次生成的和上次相比改了什么"。
- 三类批次（探索/控制/修复）的分类可以指导用户何时该继续抽样、何时该改提示词、何时该拆镜。
- 对话和视频生成都消耗 API 费用，迭代追踪能帮助用户**控制成本**。

**落地建议**：

- 在 IndexedDB 新增 `generationLogs` 和 `iterationLogs` 表。
- 在 `orchestrator.ts` 中，每次生成前记录 batch_id，生成后记录结果和失败码。
- 在 UI 中增加"迭代历史"面板，展示每次生成的假设、变量变更和结果对比。

---

### 4. 三栏约束模型（推荐，直接增强镜头编辑器）

**HGAS 做法**：每个复杂镜头使用三栏约束表：

| 栏           | 内容                                           |
| ------------ | ---------------------------------------------- |
| **必须保持** | 身份、数量、批准状态、轴线、唯一物体、逐字台词 |
| **本镜变化** | 本镜唯一允许改变的表情、动作、伤势、位置       |
| **禁止出现** | 由本镜高风险推导的额外人物、重复道具、错误口型 |

**当前项目现状**：Shot 类型有 `actionSummary`、`dialogue`、`cameraMovement`、`shotSize` 等字段，但没有"约束"概念。`negativePrompt` 是全局的，不是按镜头定制。

**借鉴理由**：

- 三栏约束直接解决了"生成出来的视频为什么不对"的问题——因为模型不知道什么不能变、什么可以变。
- 这种结构化约束可以**直接注入 AI prompt**，比在 prompt 末尾加一堆 "no xxx" 有效得多。
- 与七层提示词架构的 L7 层完美对应。

**落地建议**：

- 在 `types.ts` 的 `Shot` 接口新增 `constraints` 字段：
  ```typescript
  constraints?: {
    mustHold: string[];    // 必须保持
    changesHere: string[]; // 本镜变化
    mustNotAppear: string[]; // 禁止出现
  }
  ```
- 在 StageDirector 的 ShotCard 中增加三栏编辑 UI。
- 在 `visualService.ts` 和 `videoService.ts` 中将约束注入 prompt。

---

### 5. 主提示词与平台适配层分离（推荐，架构改进）

**HGAS 做法**：

- **主提示词**：只写可观察创作结果和连续性契约，模型无关。
- **平台适配层**：只在提供方明确时写模型版本、时长字段、参考权重、seed、采样、运动强度等。未知时写 `provider: unspecified`。

**当前项目现状**：`visualService.ts` 和 `videoService.ts` 中的 prompt 常常将模型特定参数（如 CogView 的参数）与创意描述混在一起。`promptConstants.ts` 中的风格词没有区分"平台无关"和"平台特定"。

**借鉴理由**：

- 当前项目支持多模型（智谱 AI、WLDrama、OpenAI 兼容、Veo、Sora-2），但提示词没有按模型分离适配层。换模型时需要重新调整整个 prompt。
- 分离后，切换模型只需调整适配层，创意内容保持不变——这对多模型平台至关重要。
- 适配层可以记录在 `promptConstants.ts` 或新的 `services/ai/platformAdapters/` 目录下。

**落地建议**：

- 重构 `visualService.ts`，将 prompt 组装分为两步：先组装模型无关主提示词，再根据当前模型选择适配层。
- 新建 `services/ai/platformAdapters/` 目录，为每个模型族创建适配器。

---

### 6. 质量门体系（推荐，从代码门禁扩展到生产门禁）

**HGAS 做法**：十阶段各有进入条件、退出门和返工去向：

- Brief 门 → Story 门 → Asset 门 → Scene/Spatial 门 → Shot Contract 门 → Prompt 门 → 生成前门 → 生成记录门 → 选片门 → Edit 门 → Delivery 门
- 严重级别：error（阻断）、warning（确认后继续）、info（建议）
- "平均分不能抵消 hard gate"

**当前项目现状**：已有完善的**代码质量门禁**（ESLint + Prettier + Husky + CI），但没有**生产流程质量门禁**。例如：

- 资产未生成图片就可以进入导演工作台
- 镜头没有关键帧就可以尝试生成视频
- 生成失败后没有"返工到哪一步"的指引

**借鉴理由**：

- 当前项目的五个阶段（Script → Assets → Director → Prompts → Export）之间缺少**门禁约束**。用户可以跳过必要步骤，导致后续步骤频繁失败。
- 质量门可以在 UI 中体现为"阶段锁定/解锁"机制，引导用户按流程操作。
- `projectStages` 表已有阶段隔离的基础，可以扩展为质量门状态。

**落地建议**：

- 在 `projectStages` 中增加每个阶段的 `gates` 状态（passed/warning/failed）。
- 在 UI 中增加阶段间的门禁检查（如：所有角色必须有 imageUrl 才能解锁 Director 阶段）。
- 实现可降级（warning 可跳过，error 不可跳过）。

---

### 7. 空间调度图（推荐，增强多角色场景）

**HGAS 做法**：`spatial-map.csv` 记录每个场次的：

- 区域划分（zone_id, zone_name）
- 屏幕关系（screen_relation：左/中/右）
- 深度层（depth_layer：前/中/后景）
- 出入口和固定锚点（entry_exit, anchor_objects）
- 允许资产和光源

**当前项目现状**：`Scene` 类型只有 `location`、`time`、`atmosphere` 三个文字字段，没有空间结构化数据。多角色场景中常出现人数错误、位置混乱、左右翻转。

**借鉴理由**：

- 当前项目在多角色分镜中经常遇到"角色位置不对"、"人数错误"的问题，根源是缺少空间调度。
- 空间调度图可以作为 AI 生成 prompt 的上下文，让 AI 知道"谁在前谁在后、面向哪边"。
- 与七层架构的 L3 层直接对应。

**落地建议**：

- 在 `Scene` 类型新增 `spatialMap` 字段，记录区域、深度层、锚点。
- 在 StageAssets 或 StageDirector 中增加空间编辑器 UI（简单的俯视图）。
- 在 `shotService.ts` 中将空间信息注入 prompt。

---

### 8. 资产状态版本矩阵（推荐，解决角色状态管理）

**HGAS 做法**：`asset-state-matrix.csv` 记录：

- `asset_version_id`：资产状态版本 ID（如 AST-CHAR-001@v003）
- `identity_invariants`：稳定身份特征（不变）
- `state_variables`：当前状态（服装/伤势/湿度/携带物）
- `costume_or_surface`、`damage_or_weathering`、`carried_props`

**当前项目现状**：`Character` 有 `variations: CharacterVariation[]` 字段，但没有版本管理概念。`enhancedVisualDescription` 有细节描述但没有状态矩阵。角色在不同镜头中"受伤后"、"换装后"的状态无法精确追踪。

**借鉴理由**：

- 当前项目已有 `WardrobeModal`（衣橱系统）和 `TurnaroundModal`（九宫格造型），但缺少**跨镜头的状态版本追踪**。
- 资产状态矩阵可以让 AI 在生成不同镜头时引用精确的状态版本，而不是靠自然语言描述。
- 与七层架构的 L2 层直接对应。

**落地建议**：

- 在 `Character` 类型新增 `stateVersions` 字段，每个版本记录 invariants + variables。
- 在 StageAssets 中增加"状态管理"面板，允许用户定义角色的不同状态版本。
- 在镜头编辑中引用特定状态版本而非整个角色描述。

---

### 9. 本地确定性提示词审计器（可选，锦上添花）

**HGAS 做法**：`audit_prompt.py` 是一个纯本地 Python 脚本，0 网络/0 DB，检测：

- 缺失模块（如视频提示词缺少 camera_end）
- 静止/运动冲突
- 多主运镜
- 时间线越界
- 引用范围缺失
- 重复负向约束
- 平台参数混入主提示词

**当前项目现状**：无本地审计器。提示词质量完全依赖 AI 自检或用户肉眼。

**借鉴理由**：

- 本地审计器可以在**不消耗 API 费用**的情况下检查提示词结构问题，对成本敏感的项目特别有价值。
- 可以用 TypeScript 实现类似的规则引擎，作为 pre-generation 校验步骤。
- 与质量门体系的 Prompt 门对应。

**落地建议**：

- 新建 `services/ai/promptAuditor.ts`，用 TypeScript 实现规则检查。
- 在生成图片/视频前自动运行审计，给出结构化评分和具体改进建议。
- 在 UI 中显示审计结果（类似 ESLint 的 linter 输出）。

---

### 10. 冲突优先级体系（可选，高级方法论）

**HGAS 做法**：7 级冲突优先级：

1. 安全/法律/权利
2. 用户硬约束/精确数量/逐字对白/时长
3. 已批准资产与连续性事实
4. 镜头叙事目标和时长可执行性
5. 动作/摄影机/剪辑/声音契约
6. 光色/材质/风格偏好
7. 装饰性质量词和平台默认值

"低层不能静默覆盖高层；高层冲突时列出并请求选择。"

**当前项目现状**：无冲突优先级概念。当 prompt 中的不同指令冲突时（如"保持静止"同时要求"持续奔跑"），AI 无法自行判断谁优先。

**借鉴理由**：

- 这不是代码层面的改进，而是**方法论层面**的指导原则。
- 可以集成到 AI prompt 的 system 指令中，让 AI 在遇到冲突时知道优先级。
- 对于复杂场景（多角色+动作+对白+运镜）特别有价值。

**落地建议**：

- 在 `promptConstants.ts` 中增加冲突优先级常量。
- 在 AI prompt 的 system 部分注入优先级规则。

---

## 三、不建议直接借鉴的部分

| HGAS 特性                                          | 不借鉴理由                                         |
| -------------------------------------------------- | -------------------------------------------------- |
| CSV 文件存储                                       | 当前项目用 IndexedDB + PocketBase，更适合 Web 应用 |
| Codex Skill 形态                                   | 当前项目是完整 Web 应用，不需要 Skill 封装         |
| Python 脚本工具                                    | 当前项目用 TypeScript，应原生实现而非引入 Python   |
| 十阶段目录结构                                     | 当前项目的五阶段已足够，无需过度拆分               |
| schema v2 的 14 张表                               | 对 Web 应用过于重，可选择性地引入 2-3 张关键表概念 |
| `generation_authorized` / `publication_authorized` | 当前项目是个人创作工具，暂不需要生产授权管理       |

---

## 四、优先级总结

| 序号 | 借鉴项                 | 影响面         | 实现难度 | 推荐优先级 |
| ---- | ---------------------- | -------------- | -------- | ---------- |
| 1    | 七层提示词架构         | 全局 AI 提示词 | 中       | P0         |
| 2    | 失败诊断系统 + 错误码  | 生成质量       | 中       | P0         |
| 3    | 迭代追踪系统           | 生成成本控制   | 中高     | P1         |
| 4    | 三栏约束模型           | 镜头编辑器     | 低       | P1         |
| 5    | 主提示词与平台适配分离 | AI 服务层重构  | 中高     | P1         |
| 6    | 质量门体系             | 全流程 UX      | 中       | P2         |
| 7    | 空间调度图             | 多角色场景     | 中       | P2         |
| 8    | 资产状态版本矩阵       | 角色一致性     | 中       | P2         |
| 9    | 本地提示词审计器       | 成本优化       | 低       | P3         |
| 10   | 冲突优先级体系         | 方法论         | 低       | P3         |

---

## 五、结论

Hell-Grind-AIGC-Skill 的核心价值不在代码（它是方法论 + 脚本），而在于**系统化的 AIGC 生产方法论**：

1. **七层架构**解决了"提示词该写什么、写在哪"的问题
2. **错误码体系**解决了"生成结果不对该怎么诊断"的问题
3. **迭代追踪**解决了"反复生成但不知道改了什么"的问题
4. **质量门**解决了"流程跳步导致后续失败"的问题

当前项目 WL-AI-Director 在**应用层面**已经做得很完善（Web 应用、Canvas 画布、视频编辑器、多模型支持），但在**方法论层面**缺少系统化的生产管理思维。将 HGAS 的方法论融入当前项目的代码架构中，可以显著提升生成质量和用户体验。
