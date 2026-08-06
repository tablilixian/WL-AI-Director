# 「推演→视频」AI 提示词优化 — 验收指南

> 版本: v1.0  
> 日期: 2026-07-31  
> 覆盖范围: Phase 1 + Phase 2 + Phase 3（全量优化点）

---

## 一、改造范围概览

| 阶段 | 位置 | 功能 | 改造方式 |
|------|------|------|---------|
| **Phase 1** | Step 3 剧情推演 | 剧情方向提示词优化 | OptimizableTextarea（双栏：原始 + 优化结果） |
| **Phase 2** | Step 2 VLM 分析 | System Prompt 优化 | OptimizableTextarea（双栏） |
| **Phase 2** | Step 2 VLM 分析 | User Prompt 补充要求优化 | OptimizableTextarea（双栏） |
| **Phase 3** | Step 5 生成视频 | 每帧 visualPrompt 优化 | 行内按钮 + 撤销（单行紧凑模式） |
| **前置修复** | Step 1 | 确认源图（不再显示选择网格） | 直接预览已选图片 |
| **前置修复** | StepDeduction | 移除"起承转合"硬编码 | Prompt 改为灵活描述 |
| **前置修复** | 流程面板 | 步骤标签修正 | "选择图片"→"确认源图" |

---

## 二、验收步骤

### 准备条件

1. 已配置 API Key（智谱 BigModel / Drama Backend）
2. 创意画布中至少有一张已生成的图片
3. 浏览器开发者工具打开 Console 面板

---

### 场景 1：Step 3 剧情方向优化（Phase 1 核心）

| # | 操作 | 预期结果 |
|---|------|---------|
| 1.1 | 画布上右键一张图片 → 剧情推演 → 🎬 推演→视频 | 打开推演流程面板，Step 1 显示"确认源图"（图片直接展示在预览中） |
| 1.2 | 点击"确认并开始分析" | 进入 Step 2（VLM 分析） |
| 1.3 | 勾选分析维度，点击"AI 分析图片" | VLM 分析完成，显示分析结果 |
| 1.4 | 点击"确认，进入推演" | 进入 Step 3（剧情推演） |
| 1.5 | 在"剧情方向"输入框输入：`一队骑兵从山谷远处跑来` | 输入框正常响应 |
| 1.6 | 点击下方「✨ AI 优化」按钮 | 按钮变为"⏳ 优化中..."；约 10-60 秒后，下方出现绿色边框的"AI 优化结果"区域，内含优化后的导演笔记（叙事概要 + 分镜节奏 + 视觉语言建议） |
| 1.7 | 检查优化结果内容 | 优化结果包含：① 叙事概要（1-2 句）；② 分镜节奏建议（4 镜逻辑）；③ 视觉语言建议。4 镜逻辑与"骑兵"场景匹配（可能是固定机位推进） |
| 1.8 | 点击「↻ 重新生成」按钮 | 重新调用优化，生成新版本（可能与上一版不同） |
| 1.9 | 修改优化结果中的文字 | 优化结果 textarea 可编辑 |
| 1.10 | 修改原始输入框中的文字（如改为 `雨天街角，一个人撑着红伞走过`） | 优化结果自动清空 |
| 1.11 | 再次点击「✨ AI 优化」 | 新版本基于新输入生成 |
| 1.12 | 输入框为空时点击优化 | 按钮处于禁用状态 |
| 1.13 | 展开"意图范例" | 显示 4 种镜头类型的范例（固定机位/空间递进/氛围渐变/时间拉伸） |
| 1.14 | 填写好优化结果，点击"AI 推演 4 个分镜" | 分镜结果使用优化后的剧情方向生成（检查 Console 中 LLM 请求的 prompt 是否包含优化后的内容） |

---

### 场景 2：Step 2 System Prompt 优化（Phase 2）

| # | 操作 | 预期结果 |
|---|------|---------|
| 2.1 | 在推演流程中进入 Step 2，展开"自定义分析提示词" | 显示 System Prompt 和 User Prompt 两个 OptimizableTextarea |
| 2.2 | 修改 System Prompt 为简单描述，如：`帮我分析这张图` | 输入框正常响应 |
| 2.3 | 点击 System Prompt 下方的「✨ AI 优化」 | 优化完成，下方显示专业化后的 System Prompt |
| 2.4 | 优化结果应包含角色的"身份"定义（如"你是一个专业的影视镜头分析师"）和更精准的分析指令 | — |
| 2.5 | 点击"AI 分析图片" | 检查 Console，确认 API 调用使用了优化后的 System Prompt |
| 2.6 | VLM 分析完成后，检查 `handleConfirm` 保存的数据 | 确认保存的是有效的 System Prompt |

---

### 场景 3：Step 2 User Prompt 优化（Phase 2）

| # | 操作 | 预期结果 |
|---|------|---------|
| 3.1 | 在 User Prompt 中输入：`重点关注角色的表情和姿势` | 输入框正常响应 |
| 3.2 | 点击 User Prompt 下方的「✨ AI 优化」 | 优化完成，结果更专业（如"分析角色的微表情、眼神方向和身体姿态，描述其情绪状态"） |
| 3.3 | User Prompt 为空时点击优化 | 按钮可用，但会报错提示"请先输入补充要求再优化" |
| 3.4 | 提交分析后，检查"当前用户提示词预览" | 预览中包含优化后的补充要求 |

---

### 场景 4：Step 5 关键帧 Prompt 优化（Phase 3）

| # | 操作 | 预期结果 |
|---|------|---------|
| 4.1 | 完成 Step 2-4 所有步骤，进入 Step 5（生成视频） | 显示 4 帧关键帧卡片，每帧有 textarea + "✨ 优化此帧"按钮 |
| 4.2 | 点击第 1 帧的「✨ 优化此帧」 | 按钮变为 loading spinner；优化完成后 textarea 内容被替换为更具电影感的版本 |
| 4.3 | 优化完成后，"撤销"按钮出现 | 点击"撤销"，textarea 恢复为原始 prompt |
| 4.4 | 对帧 2 也进行优化 | 独立工作，不影响帧 1 |
| 4.5 | 有任何帧在优化中时，其他帧的优化按钮禁用 | 按钮灰色不可点击 |
| 4.6 | 所有帧的 prompt 编辑器仍可手动修改 | 修改后可以继续优化 |
| 4.7 | 在优化后的 prompt 基础上再次优化 | 重新调用 LLM 基于当前内容优化 |
| 4.8 | 优化完成，点击"AI 生成 N 秒视频" | 视频使用优化后的 prompt 生成 |

---

### 场景 5：边界情况

| # | 操作 | 预期结果 |
|---|------|---------|
| 5.1 | 在推演流程中重复切换步骤（前进/后退） | 流程状态保持，不会丢失已输入的数据 |
| 5.2 | 退出流程后从画布 Flow 卡片重新进入 | 所有数据（包括优化后的提示词）从持久化存储恢复 |
| 5.3 | 网络断开时点击优化按钮 | 报错提示"AI 优化失败：xxx"，可重试 |
| 5.4 | 超长文本输入（>500 字） | 正常处理，不崩溃 |
| 5.5 | 包含特殊字符的输入（如 `<>'"&`） | 正常处理 |
| 5.6 | VLM 分析未完成时进入 Step 3 | Step 3 的优化仍可工作（无 VLM 上下文时使用纯文本模式） |

---

### 场景 6：TypeScript 编译

| # | 操作 | 预期结果 |
|---|------|---------|
| 6.1 | 运行 `npx tsc --noEmit` | 所有 `src/` 下文件无编译错误（已存在的 test 文件错误不受影响） |
| 6.2 | 检查 `src/modules/canvas/` 下所有文件 | 无类型错误 |

---

## 三、文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/modules/canvas/services/promptOptimizer.ts` | **新建** | 4 个优化方法：StoryDirection / VLMSystemPrompt / VLMUserPrompt / VideoFramePrompt |
| `src/modules/canvas/components/shared/OptimizableTextarea.tsx` | **新建** | 通用 AI 优化输入组件（双栏模式） |
| `src/modules/canvas/components/steps/StepDeduction.tsx` | **修改** | 集成 OptimizableTextarea + 意图范例 + 移除"起承转合"约束 + 优化后的数据传回 LLM |
| `src/modules/canvas/components/steps/StepVLMAnalysis.tsx` | **修改** | System Prompt + User Prompt 均使用 OptimizableTextarea，effective prompt 机制 |
| `src/modules/canvas/components/steps/StepVideo.tsx` | **修改** | 每帧 visualPrompt 行内优化按钮 + 撤销机制 |
| `src/modules/canvas/components/steps/StepSelectImage.tsx` | **修改** | 预选图片时直接预览确认，不再显示选择网格 |
| `src/modules/canvas/components/StoryDeductionFlowPanel.tsx` | **修改** | 步骤标签修正 |

---

## 四、快速验证命令

```bash
# TypeScript 编译检查
cd WL-AI-Director
npx tsc --noEmit --pretty 2>&1 | grep "src/" | grep -v "tests/"

# 应输出：无结果（或仅显示已存在的 test 文件错误）
```

---

## 五、常见问题排查

1. **优化按钮一直转圈不返回**
   - 检查 Console：`[PromptOptimizer] 优化失败`
   - 确认 API Key 是否有效
   - 检查 Network 面板中 LLM 接口是否正常响应

2. **优化后推演结果没有使用优化内容**
   - 检查 Console：确认 `剧情方向` 字段使用 `effectiveDirection`
   - 确认 `onOptimizedChange` 回调已触发

3. **Step 5 每帧的优化按钮都禁用**
   - 检查是否有帧正在优化中（`optimizingFrame !== null`）
   - 等待上一帧优化完成
