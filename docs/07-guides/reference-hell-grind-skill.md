# 开源参考分析：Hell-Grind-AIGC-Skill 对 WL-AI-Director 的可借鉴点

> 仓库：https://github.com/renmu2017/Hell-Grind-AIGC-Skill
> 分析日期：2026-08-10
> 定位：这是一个 **Agent 用的 AIGC 视频生产管理 Skill**（Codex Skill），不是运行时 Web App。
> 价值不在代码本身，而在 **提示词方法论 + 结构化数据模型 + 本地校验/审计范式**。

---

## 一、它到底是什么（先校准预期）

| 维度     | Hell-Grind-AIGC-Skill                                | WL-AI-Director                                               |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| 形态     | Markdown + CSV 模板 + Python 脚本，供 LLM Agent 加载 | React19 + TS(strict) + Zustand + IndexedDB/PocketBase 运行时 |
| 数据载体 | 磁盘 CSV/Markdown（人类可读、可 diff）               | IndexedDB（local-first）+ 云端                               |
| 核心产物 | 七层提示词、镜头契约、失败诊断                       | 画布、图层、三视图、推演流、生成                             |
| 调用方   | Codex/LLM 读取 references 路由                       | 用户在浏览器里直接操作                                       |

**最大前提差异**：它是给"AI 助手"当知识库用的；我们是给用户直接用的编辑器。所以 `SKILL.md` 的 frontmatter 路由、references 按需加载机制，**只有当你也想做"AI 导演 Agent"时才直接有用**；否则只借鉴其中的"知识组织方式"。

---

## 二、高价值可借鉴点（按对你的优先级排）

### ★ 1. 七层提示词架构 → 直接升级你的"导演提示词生成"

源文件：`references/prompt-architecture.md`

```
L1 意图与验收 → L2 资产/状态/引用 → L3 空间/数量 → L4 表演/物理
→ L5 摄影机/剪辑 → L6 光色/材质/声音 → L7 连续性/风险/交付
```

每一层都有：**回答什么 / 输入来源 / 写作公式 / 常见失败 / 自检清单**。

- **可直接迁移**：你现在的提示词生成偏"一次性文本"。可把"七层"作为 Director 出提示词的结构骨架，保证不漏维度。
- **冲突优先级**（L1>L2>L3...>装饰词）是极好的设计原则：高优先级冲突时**列出冲突让用户选**，绝不静默牺牲。这正好治你之前担心的"AI 自作主张"。
- **richness 三档**（精简/标准/导演版）对应不同复杂度——你的 UI 可加一个"丰富度"开关。

### ★ 2. 视频镜头契约 12 段 → 你"镜头/分镜"数据结构的标杆

源文件：`references/video-prompt-contract.md`

12 段里最值钱的是这几段，正好对应你缺的结构化字段：

- `open_state / beat_timeline / close_state`：动作按时间因果执行，且尾帧状态能直接喂下一镜。
- `camera_start / camera_path / camera_end`：一个主运动 + 起点 + 路径 + 终点，而非只给"推进"一个词。
- `continuity_in / continuity_out` + 三栏约束（must_hold / changes_here / must_not_appear）。
- **动作时长预算表**（读清初始 0.3–0.8s、完整身体动作 1–3s…）——纯规则就能发现"超载"，不靠模型猜。

→ 建议你把"镜头(layer/shot)"的 schema 往这个方向补：现在只存图片/视频 URL，缺 open/close state、beat、camera 契约、continuity。

### ★ 3. 失败诊断 + 稳定错误码 → 你的"迭代/复测"循环该长这样

源文件：`references/failure-diagnosis.md`

- 六大责任层（资产 / 镜头契约 / 提示词 / 平台适配 / 生成随机性 / 后期），**先定位责任层再做最小修复，不默认堆否定词**。
- 稳定错误码：`F-ID-DRIFT`(身份漂移)、`F-CONTINUITY`(接不上)、`F-CAMERA-CONFLICT`(多主运镜)… 每个都带 症状/先检查/最小修复。
- **复测铁律**：每次只改一个责任层；写 `changed_variables / hypothesis / next_action`；**连续两批无改善就停同一路径**（防无脑抽卡）。
- 诊断决策树（资产事实→镜头契约→提示词→适配→随机性→后期）是清晰的 if/else。

→ 你之前复审发现"生成迭代记录"是空白。这套错误码 + 迭代日志格式可直接作为你生成历史/诊断面板的字段定义。

### ★ 4. 主提示词 vs 平台适配层分离 → 你多模型 Director 的正确架构

源文件：`prompt-architecture.md` §主提示词与平台适配层、`video-prompt-contract.md` §12

- **主提示词只写可观察的创作结果和连续性契约**（模型无关）。
- **平台适配层只放**：模型版本、seed、采样、运动强度、首尾帧槽位、API 参数；未知写 `unspecified`，**绝不猜参数**。
- 适配层**不得删改主提示词的硬约束**，也**不得把模型能力限制伪装成用户选择**。

→ 这是你"多模型导演"的核心架构原则。现在你大概率把 provider 参数混在主提示词里。分离后：换模型只换 adapter，创意意图零改动。

### ★ 5. schema v2 十四张表 + 状态机 → 你 P0 推演持久化的参考答案

源文件：`references/project-schemas.md`、`validate_project.py`

- ID 规范：`PRJ-*`、`SC###`、`SC###-SH###`、`AST-CHAR-001@v003`——**ID 一经引用不重命名，变化用版本/状态表达**。
- 14 张表覆盖：brief / story / assets(含状态矩阵、参考范围) / scenes(含空间图) / shots(含 beat/audio) / prompts / generations / iterations / review(选片/连续性/豁免) / edit / delivery。
- **状态机硬门禁**：`contract_ready` 必须有可执行首尾态；`prompt_ready` 必须引用 checked prompt；`locked` 不允许未处理 error（除非有效 waiver）；`selected_generation_id` 必须与 selection log 一致。
- **生成/发布授权必须分开**（`generation_authorized` / `publication_authorized`）。

→ **直接命中你之前复审的 P0（推演过程态零持久化）**：`StoryDeductionFlowPanel` 的 `flow` 是组件 `useState`，只存内存，中断全丢。正确做法是对照这套——把"推演流"建成**带 ID/版本/状态机的持久实体**（phase、steps、decisions、continuity_in/out），而不是可变内存。你已有 `flowLayer.generationPrompt` 落盘点，按这个 schema 补完即可。

### ★ 6. 本地确定性校验器/审计器（0 网络、0 DB）→ 你的"数据安全 + 无缝续作"保障

源文件：`scripts/validate_project.py`、`scripts/audit_prompt.py`

- `validate_project.py`：只读、确定性，检查 **ID 合法性 / 引用完整性 / 时间线越界 / 状态机合规 / 选片一致性 / 未豁免 error**。输出结构化 JSON（`valid / issues / counts / network_requests:0`）。
- `audit_prompt.py`：**纯正则**的结构审计（不调 LLM），检测缺主体、缺时长、缺收镜、静止+运动冲突、多主运镜、时间线越界、否定词重复、平台参数混入主提示词、对白未声明"仅声音"等，给 0–100 结构分。

→ 这两件事正是你"工作中断后能无缝续作 + 数据安全"诉求的**工程实现样板**：

- 在 WL-AI-Director **启动时跑一次只读完整性校验**（引用断链、orphan blob、状态机违规），有问题弹告警而非静默。
- 在 **生成前跑提示词结构审计**（复用正则思路，轻量、零成本），拦掉"无主体/无收镜/多主运镜"这类低级失败。
- 这直接补你复审里的 **R4（编辑器恢复入口审计）和 R8（保存失败无告警）**。

### 7. 工程卫生（可顺手学）

- `tests/` 四个测试文件（`test_skill_contract`/`test_project_tools`/`test_prompt_audit`/`test_behavior_contract`）——它用纯 pytest 验证 schema/脚本契约，零 mock 外部服务。
- MIT + `NOTICE.md` 明确"只授权自创内容，不授予第三方原始材料权利"；v1/v2 兼容模式（不自动改写旧项目，迁移需显式）。

---

## 三、不能直接抄 / 需注意的差异

1. **CSV 落盘 ≠ IndexedDB**：它的数据模型是为人类可读、可 git diff 设计的；你是 App 运行时数据。→ **只抄 schema 设计与字段语义，存储仍走 IndexedDB，把同样列映射成 store/表**。
2. **Skill 路由机制**：`SKILL.md` + references 按需加载是给 LLM 省 context 的；你对用户是 GUI，不需要这套。但"知识分层按需加载"的思路可借鉴到你的"提示词生成参考库"组织。
3. **它是方法论，不是算法**：七层/契约/错误码都是"人/AI 必须遵守的规则"，没有帮你自动生成好提示词的模型。落地时你需要把这些规则变成你 Director 的**提示词模板 + 校验函数**。
4. **范围不同**：它是 95 分钟长片全生产流程（含交付/权利/归档）；你若是短视频/单镜，可只取 L1–L7 提示词 + 镜头契约 + 失败诊断三段，不必照搬 14 表全量。

---

## 四、给你的落地建议顺序（结合近期复审）

| 优先级 | 借鉴项                   | 对应你的问题                  | 落地动作                                        |
| ------ | ------------------------ | ----------------------------- | ----------------------------------------------- |
| P0     | 见 §5 schema + §6 校验器 | 推演过程态零持久化(P0)、R4/R8 | 把推演流建成持久实体 + 启动只读完整性校验       |
| P1     | 见 §4 主/适配分离        | 多模型 Director 架构          | 拆主提示词与 provider adapter                   |
| P1     | 见 §6 审计器             | 提示词质量门                  | 生成前跑结构审计（正则级，零成本）              |
| P2     | 见 §1/§2 七层+镜头契约   | 提示词生成偏散                | Director 出提示词用七层骨架 + 镜头契约字段      |
| P2     | 见 §3 失败诊断           | 迭代记录空白                  | 生成历史加错误码 + changed_variables/hypothesis |

**一句话总结**：这个仓库最该"拿"的三样——（1）**七层提示词 + 镜头契约**作为你 Director 出词的骨架；（2）**主提示词/平台适配分离**作为多模型架构原则；（3）**schema 状态机 + 只读校验器**作为你 P0 推演持久化和"数据安全/无缝续作"的工程实现样板。CSV 形态不抄，原理照用。
