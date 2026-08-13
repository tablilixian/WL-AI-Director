# 项目中「提示词」相关升级梳理

> 整理时间：2026-08-11
> 范围：AI 导演项目所有与 LLM 提示词构造、解析、调优相关的升级
> 结论：提示词体系已从「一坨大字符串」演进为「结构化分层 + 史实/美术知识注入 + 一致性闭环 + 健壮解析」的工程化系统。

---

## 一、七层结构化 PromptBuilder（最核心的架构升级）

**位置**：`services/ai/promptBuilder.ts` + `services/ai/promptLayers/`（intent/asset/spatial/action/photography/constraint/continuity 七层）

**做了什么**：把提示词按「变更频率」分成 7 层，system 与 user 分离：

- System 侧（项目/镜头级不变）：L1 意图、L5 美术指导(摄影)、L6 约束、L7 连续性
- User 侧（每次生成变化）：L2 资产(角色/场景)、L3 空间、L4 动作

**怎么感觉出来**：

- 切换风格、改美术指导时，注入的是稳定的 system 约束，不会每次都把整段背景重写一遍 → 更省 token、更可控、更容易排查"为什么这次画风变了"。
- 生成内容（资产/空间/动作）独立成 user 层，调试某张图时只看 user 层即可。

---

## 二、视觉风格常量库 + 负面提示词 + 质量标签自动补

**位置**：`services/ai/promptConstants.ts`

**做了什么**：

- 7 种风格（真人实拍/动漫/2D/3D/赛博朋克/油画/水墨）的英文 prompt + 中文描述
- 每种风格的角色「负面提示词」+ 场景专用「负面提示词」（额外排除人物）
- `enhanceWithQualityTags`：若 prompt 未含质量词，自动补 `cinematic, 8K, professional lighting…`

**怎么感觉出来**：

- 在生成面板切风格，画面质感明显不同（动漫≠油画≠水墨）。
- 角色/场景出图自动"避雷"（少畸变、少文字水印、少多余人物）。
- 同一段描述生成结果更精致（自动补质量标签）。

---

## 三、时代背景知识库（eraContext，三阶段优化新增）

**位置**：`services/ai/eraContext.ts`

**做了什么**：内置抗日战争/解放战争/古代中国/现代都市/奇幻科幻 的史实军服、装备、视觉注意事项；按 genre+标题+角色名自动检测时代，注入 `HISTORICAL/ERA CONTEXT (MANDATORY)` 强制块，要求把史实融进 colorPalette / characterDesignRules / consistencyAnchors。

**怎么感觉出来**：

- 做军旅/历史题材时，角色服装、装备符合史实（如八路军灰绿粗布绑腿、日军昭五式、不同朝代服饰差异），不再出现"穿越式"服装。
- 这是之前没有的"硬知识"注入，历史剧质感提升最直观。

---

## 四、全局美术指导文档（ArtDirection）

**位置**：`services/ai/visualService.ts` → `generateArtDirection`；消费于 `scriptService.ts:447`

**做了什么**：由剧本角色+场景自动生成全局美术指导：colorPalette（主/辅/点缀色、色温、饱和度）、lightingStyle、textureStyle、moodKeywords、characterDesignRules（比例/线宽/细节）、consistencyAnchors。以 `GLOBAL ART DIRECTION (MANDATORY)` 注入所有 visualPrompt 生成（角色/场景/分镜）。

**怎么感觉出来**：

- 整部片子的色调、光影、角色比例统一，不再"每张图各画各的"。
- 角色卡/场景卡里能看到统一的美术基调。

---

## 五、剧本解析 Skill（scriptParserSkill，三阶段优化核心）

**位置**：`services/ai/scriptParserSkill.ts`

**做了什么**：

- 格式自适应检测：`professional` / `freeform` / `minimal`（正则识别场景标记、对白密度、行均长度）
- 正则提取场景边界（支持中文数字"第三场"、INT/EXT、内外景）
- **B01 场景映射后处理**：storyParagraph 的 sceneRefId 无效时自动修正到最近场景
- **B10 衣橱系统**：分析角色跨场景的变装/状态变化（"换军装""满身血迹"），生成变体 visualPrompt

**怎么感觉出来**：

- 随便贴一段剧本（专业格式或自由文本）都能正确拆成 场景 + 角色 + 段落。
- 角色卡出现"军装/血迹"等变体，可分别出图 —— 这是以前没有的跨场景服装变化识别。

---

## 六、一致性检查 + 一键修复（consistencyService）

**位置**：`services/ai/consistencyService.ts`

**做了什么**：

- 检查同一角色跨分镜的 服装/发型/配饰/体貌/场景色调 是否矛盾
- **关键升级**：区分「剧情合理变化」（场景切换、打斗破损、落水换装、时间跳跃、台词提及换装）vs「真实冲突」，isPlotDriven 的不报 error
- 输出 consistencyScore 0-10 + conflicts（severity / shotIds / suggestion）
- `fixKeyframeConsistency`：一键修复冲突的关键帧视觉描述

**怎么感觉出来**：

- 成片角色不再"穿帮"（同一场景无故换衣/换发型被标出，并可一键修）。
- 剧情需要的换装不会被误报成错误 —— 智能度明显提升。

---

## 七、角色/场景视觉提示词生成（带负面词）

**位置**：`services/ai/visualService.ts` → `generateCharacterVisualPrompt` / `generateSceneVisualPrompt` / `generateVisualPrompt`

**做了什么**：自动产出 `{ visualPrompt, negativePrompt }` 对，接入 PromptBuilder + 风格常量 + ArtDirection。

**怎么感觉出来**：

- 角色卡/场景卡自动带「可编辑的视觉提示词 + 负面提示词」，用户能在 UI 直接看、直接改。

---

## 八、解析健壮性 + max_tokens 调优（解决"分镜 JSON 报错"的根因）

**位置**：`services/ai/apiCore.ts`（`parseLlmJson` / `MAX_TOKENS_LONG=8192` / `MAX_TOKENS_SHORT=4096`）

**做了什么**：

- `parseLlmJson` 三级兜底：直接 parse → cleanJsonString → repairBrokenJson，覆盖四类 LLM 畸形（数组缺逗号 / 漏转义引号 / 截断 / 嵌套）
- 长输出给 MAX_TOKENS_LONG=8192，镜头级给 MAX_TOKENS_SHORT=4096，消除 1024/2048/3072 等危险值

**怎么感觉出来**：

- 之前分镜生成报 `Expected ',' or ']' after array element`（就是本轮对话开头的那个报错）——现在基本不再崩。
- 长剧本 / 大量分镜不再被截断。

---

## 九、自定义提示词 UI 入口（用户可配置）

**位置**：提交 `d9ae92c fix: AI分析默认展开自定义提示词设置`；相关 `services/userPreferencesService.ts`

**怎么感觉出来**：

- AI 分析面板默认展开「自定义提示词设置」，用户可以直接写/改 system 级提示词，把上面的自动化能力"接上自己的手"。

---

## 十、视频生成调度 orchestrator（与提示词拼接相关）

**位置**：`services/ai/orchestrator.ts` + `visualService.ts` 的 mkr 系列

**做了什么**：统一 basic/msr/mkr/mkr-grid 四种视频模式；MKR 多关键帧自动包含 首尾帧(0%/100%) + 中间帧，prompt 拼接更稳（对应提交 `4d4a137`/`a684fff` 修复首尾帧缺失）。

**怎么感觉出来**：

- 图生视频/多关键帧视频运动更连贯，不再因缺首尾帧而"跳变"。

---

## 一句话总览

| 升级                         | 代码                               | 你能在项目里感觉到的变化                      |
| ---------------------------- | ---------------------------------- | --------------------------------------------- |
| 七层结构化提示词             | promptBuilder + promptLayers       | 风格/美术切换稳定可控，调试更轻松             |
| 风格常量 + 负面词 + 质量标签 | promptConstants                    | 切风格画质明显不同，出图更干净精致            |
| 时代背景知识库               | eraContext                         | 历史/军旅题材服装装备符合史实                 |
| 全局美术指导                 | visualService.generateArtDirection | 整片色调/光影/比例统一                        |
| 剧本解析 Skill               | scriptParserSkill                  | 粘贴剧本自动拆场景/角色；角色跨场景变装被识别 |
| 一致性检查+修复              | consistencyService                 | 角色不穿帮，剧情换装不误报，可一键修          |
| 视觉提示词生成               | visualService                      | 角色/场景卡带可编辑提示词+负面词              |
| 解析健壮+token调优           | apiCore                            | 分镜不再 JSON 报错、不再被截断                |
| 自定义提示词面板             | userPreferencesService             | 可直接写/改 system 提示词                     |
| 视频调度+首尾帧              | orchestrator + visualService       | 图生视频运动连贯                              |
