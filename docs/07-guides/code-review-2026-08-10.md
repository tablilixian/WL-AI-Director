# WL AI Director（BigBanana）整体代码复审与优先级重排

> 复审日期：2026-08-10
> 评审依据：本次为**证据驱动**复审，所有结论来自实际 `grep` / 读码 / 配置核对（src 142 个 ts/tsx，约 35,973 行），不凭印象。
> 前序已落地项（本次复核仍有效）：logger 统一接口 + 调试开关 + `errorFrom` 定位；WebGL 上下文释放（A2）；blob URL 不写持久 layer（A3）；PanoramaPanel blob 释放（A4）；`no-explicit-any` / `no-non-null-assertion` / `no-console` 升 error（增量门禁）。

---

## 0. 总体健康度

| 维度                   | 评级    | 说明                              |
| ---------------------- | ------- | --------------------------------- |
| 持久化架构（画布）     | 🟢 良好 | Local-First 三级落地，最完整      |
| 日志系统               | 🟢 良好 | 统一出口 + 调试开关 + 错误定位    |
| 类型安全（新代码）     | 🟢 受控 | 门禁已升 error，增量消化          |
| 生产可靠性（崩溃兜底） | 🔴 风险 | 零 Error Boundary，渲染抛错即白屏 |
| 推演续作（核心承诺）   | 🔴 风险 | 过程态零持久化，中断丢进度（P0）  |
| 性能（大项目）         | 🟡 关注 | 零 React.memo，巨石文件           |
| 测试覆盖               | 🟡 未知 | 覆盖率工具未装，关键路径未覆盖    |

---

## 1. 做得好的地方（Strengths）

1. **Local-First 持久化稳健**：画布三级（1s 防抖 IndexedDB + beforeunload 同步 + 云端延迟同步），恢复有 sessionStorage 10min 兜底 + 本地优先冲突策略。
2. **日志系统专业**：`createLogger(category)` 统一出口、调试开关（`import.meta.env?.PROD`）、`errorFrom(err, msg?)` 自动带位置/原因/堆栈。
3. **渐进式 lint 门禁**：只升"真实 bug"类规则为 error，配合 lint-staged 增量，不阻塞存量，是 brownfield 的正确做法。
4. **安全面干净**：全 src **无硬编码密钥**（已 grep 验证：`sk-`/`AKIA`/`AIza`/`ghp_`/`xai-`/长串 api_key 均零命中）；auth 日志 token 截断到 20 字符；**零 `dangerouslySetInnerHTML`**（无 XSS 注入面）；源码**零 `console.*`**（`no-console` error 生效，仅 1 处注释掉的 `// console.log`）。
5. **测试基座存在**：~22 测试文件、242 用例通过（stores / lib / canvas-sync / hybridStorage / panorama / pb-auth）。

---

## 2. 问题清单（重排后优先级）

### 🔴 P0 — 违背"中断无缝续作"核心承诺 / 数据丢失

**P0-1 · R1 推演过程态零持久化**

- 证据：`StoryDeductionFlowPanel.tsx` 的 `flow` 是组件 `useState`（91 行）；`updateFlow`（141）只 `setFlow`；仅 `resetFlow`（130 行）才把 `JSON.stringify(resetFlow)` 写回 `flowLayer.generationPrompt`。
- 影响：5 阶段推演进行到第 N 步时中断/崩溃，重开只恢复到"上次 reset 的产物"，**中间进度全丢**。这是对"中断后无缝续作"承诺最直接的违背。
- 修复点明确：`updateFlow` / `goToPhase` 内同步 `updateLayer(flowLayerId, { generationPrompt: JSON.stringify(newFlow) })`（或独立 flow store）。
- 工作量：中等；价值：高。
- 旁证：`projects` / `projectStages` 两个 store 在 `dbConfig.ts` 定义但**全代码零引用**（已 grep 证实 `STORE_NAMES.PROJECTS`/`PROJECT_STAGES` 无任何使用），是空置遗留 store；项目恢复实际走 `EDITOR_STATES`（`editorStorage.listProjects` + `indexedDB`）。建议清理这两个死 store。

---

### 🟠 P1 — 生产可靠性 / 正确性（上线后会咬人）

**P1-1 · 零 React Error Boundary**

- 证据：全仓 `ErrorBoundary` / `componentDidCatch` / `getDerivedStateFromError` **零命中**，仅 4 处 `<img onError>` 处理器。
- 影响：任一组件渲染期抛错（图层解析异常、模型返回结构变化、第三方组件 bug）即**整页白屏、无兜底、无错误边界日志**。鉴于外部模型调用 + 复杂渲染，是真实生产风险。
- 修复：App 根 + 画布/面板粒度各加 ErrorBoundary（含 fallback UI + 上报）。低工作量，高价值。

**P1-2 · R5 云端冲突 ASK_USER 无真实 UI**

- 冲突策略标了 `ASK_USER`，但无弹窗/无提示，实际静默按本地优先 → 用户可能在不知情下覆盖云端版本。
- 修复：实现冲突解决对话框，或至少 toast 告知"检测到云端更新，已本地优先"。中等工作量。

**P1-3 · A1（已澄清）useAutoSave 死代码 + 双层保存潜在竞赛**

- 证据：`useAutoSave` 全 src **零调用方**（死代码，含 2 处 `any`）；运行时仅 `editorStore.ts:694` 模块级 `subscribe`（导入即建、永不清理，全局单例生命周期合理）。
- 修复：删 `useAutoSave.ts`（去死代码 + 2 `any`），保留模块级 subscribe。低风险小改。

**P1-4 · authStore 类型安全 / 错误处理**

- 证据：`user: any`（6 行）、5 处 `catch (error: any)`（87/134/151/171/186）、2 处 `result: any`（71/118）。
- 风险：PocketBase 错误确有 `.response.message`，但 `any` 绕过全部检查；且**非 PB 错误时 `error.response?.message` 为 undefined，会显示 "undefined" 文案**（UX bug）。token 日志已截断（安全良好）。
- 修复：`catch` 改 `unknown` + `errorFrom`；`user` 用 pb model 类型；定义 `SyncResult` 类型替换 `result: any`。中等工作量，提升安全/可调试性。

**P1-5（待审计）· R4 编辑器恢复入口**

- 视频编辑器从 `EDITOR_STATES` 恢复的入口是否完整接线，本轮未逐路径核实；建议专项审计恢复链路（打开/列项目/续作）。

---

### 🟡 P2 — 性能 / 可维护性 / 数据安全加固

**P2-1 · 零 React.memo（叶子组件未 memo）**

- 证据：`React.memo` / `memo(` **零命中**；仅 `useMemo`/`useCallback` 在 hook 层广泛使用（GenerateVideoPanel 23 / InfiniteCanvas 18 / CanvasLayer 13 / PanoramaViewer 12 等）。
- 影响：画布按图层渲染（`CanvasLayer` 904 行、每图层一个实例）、时间线 `Clip` 多实例，父重渲染会**级联所有子**。大项目下卡顿明显。
- 修复：对 `CanvasLayer` / `Clip` / `Playhead` / 面板叶子加 `React.memo`（props 稳定时跳过重渲染）。低–中工作量，大项目收益明显。

**P2-2 · R3 崩溃丢 ≤1s**

- 画布 1s 防抖自动存，崩溃窗口内编辑丢失。可接受，但重编辑场景可补 beforeunload 同步 flush（确认 sessionStorage 路径覆盖画布）。

**P2-3 · R7 图片孤儿 Blob / 孤儿资源**

- 预览/导入产生的 blob 未 revoke、图层删除未清理 IndexedDB 图片，长期积累孤儿资源占配额。需 GC 清理。

**P2-4 · R8 存储配额 / 保存失败无告警**

- IndexedDB/localStorage 配额超限或保存失败被静默吞掉，用户不知数据未存。需 try/catch + toast。

**P2-5 · 巨石文件（Phase 3 拆分剩余）**

- InfiniteCanvas 1452、canvasIntegrationService 1109、GenerateVideoPanel 1109、CanvasLayer 904、useCanvasState 882、canvasModelService 860、MkrVideoConfigBar 772、CanvasToolbar 767。难测难维护，继续 Phase 3 拆分。

**P2-6 · 存量类型债（any / !）**

- src 残留 `any` 类型位置分布在 ~50 文件（单文件 1–11 处，canvasModelService 11、authStore 8 最多）；非空断言 ~40 处（8 文件，GridSplitPanel 9、StoryDeductionFlowPanel 8 最多）。lint 已 error 但增量门禁未阻塞；按文件"改到哪清到哪"。

---

### 🟢 P3 — 卫生 / 技术债

- **P3-1 · R9** `tts.ts` `EdgeTTSService` 虚假实现（占位死代码）→ 标 `@deprecated` 或删。
- **P3-2 · N6** 死 store `projects`/`projectStages` 清理（见 P0-1 旁证）。
- **P3-3 · N7** 重复命名 `AssetLibrary`：`components/AssetLibrary/`（完整模块）与 `VideoEditor/Preview/AssetLibrary.tsx`（单文件）同名，易混淆 → 改名其一。
- **P3-4 · N8** 覆盖率工具：`test:coverage` 脚本存在但 `package.json` **无 `@vitest/coverage-v8`**，覆盖率未知。建议安装 + 为 P0 修复补测试（恰是推演流程持久化的测试缺口）。

---

## 3. 已证伪 / 移出清单

- **R2（视频编辑器静默丢数据）**：经核实 `editorStore` 几乎所有改 `tracks` 的 action 都带 `updatedAt`（192/227/244/253/293/315/327/360/397/418 等），仅 zoom/选中/播放进度等 UI 态不触发保存；故"静默不保存"基本不成立，**移出 P0**（已降级/移除）。

---

## 4. 建议执行顺序

1. **P0**：R1 推演过程态持久化（含死 store 清理）。
2. **P1**：加 ErrorBoundary → R5 冲突 UI → A1 删死代码 → authStore 类型收窄 →（审计 R4）。
3. **P2**：React.memo 叶子 → R8 保存失败告警 → R7 孤儿 GC → 巨石拆分 → 类型债增量清。
4. **P3**：R9 deprecated → AssetLibrary 改名 → 装覆盖率 + 补 P0 测试。

---

## 5. 量化证据（本次扫描原始数据）

| 指标                                  | 结果                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 源码规模                              | 142 文件 / 35,973 行                                                                           |
| `any` 类型位置                        | ~50 文件，单文件 1–11 处（canvasModelService 11、authStore 8 最多）；lint 已 error（增量门禁） |
| 非空断言 `!`                          | ~40 处（8 文件，GridSplitPanel 9、StoryDeductionFlowPanel 8 最多）；lint 已 error              |
| `console.*` 源码残留                  | 仅 1 处注释掉的 `// console.log`；`no-console` error 生效                                      |
| `React.memo`                          | **0**；`useMemo`/`useCallback` 广泛使用                                                        |
| Error Boundary                        | **0**（仅 4 处 img `onError`）                                                                 |
| 硬编码密钥                            | **0**（grep 验证）；auth 日志 token 截断 20 字符                                               |
| `dangerouslySetInnerHTML`             | **0**                                                                                          |
| 测试文件                              | ~22；通过 242（前序会话数据）；覆盖率工具未装                                                  |
| `useAutoSave` 调用方                  | **0**（死代码证实）                                                                            |
| `projects`/`projectStages` store 引用 | **0**（死 store 证实）                                                                         |
| 巨石文件（>700 行）                   | 8 个（见 P2-5）                                                                                |

---

## 6. 勘误（2026-08-10 晚）：P0 推演过程态持久化实为既成实现

落地 R4/R8 时实际读码复核，发现 **原 P0 判定为误判**，予以纠正：

- `StoryDeductionFlowPanel.tsx` 当前已在做持久化：
  - 第 91–101 行 `useState` 初始化时从 `flowLayer.generationPrompt` 反序列化恢复；
  - 第 116–120 行 `useEffect` 在**每次 `flow` 变更时**通过 `updateLayer` 写回 `generationPrompt`。
- `serializeLayerForSave`（`canvasIntegrationService.ts:447`）返回 `{ ...layer, imageId }`，**保留全部字段含 `generationPrompt`**；导入恢复亦 `return { ...layer }`。
- 因此推演流**可跨刷新恢复**，原先"只存内存、中断丢进度"的前提不成立（当时漏看了第 116–120 行的落盘 effect）。

**结论**：P0 已从待办移除。本轮实际交付的是 **R4 启动只读完整性校验 + R8 保存失败告警**（见 `docs/07-guides/reference-hell-grind-skill.md` 第 6 点落地）：

- 新增 `services/canvasIntegrity.ts`（纯函数、确定性、0 网络）：重复 ID / 断链来源引用 / 损坏推演流 JSON / 非法 blob: 持久 src。
- `_restoreCanvasState` 加载后跑校验，结果写入 store `integrityIssues`。
- 两个保存方法失败写 `lastSaveError`（成功清除）。
- 新增 `CanvasIntegrityBanner` 挂在 `InfiniteCanvas` 根，红/琥珀告警条展示保存失败与完整性问题。
- 顺手收紧本次改动文件中的存量 `any`（InfiniteCanvas 223/384、useCanvasState 826）。
- 验收：tsc 0 / eslint 0 / vitest 242+9 全绿。
