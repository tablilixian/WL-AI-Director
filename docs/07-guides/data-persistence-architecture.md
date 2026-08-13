# WL AI Director 数据落地方案全景与「中断续作 / 数据安全」评估

> 整理时间：2026-08-10
> 范围：本仓库（WL AI Director / 大香蕉 AI 漫剧工场）前端全部持久化路径
> 目的：回答两个问题——（1）工作被中断后，下次打开能否**无缝衔接**继续未完成的工作？（2）当前数据落地方案是否**安全**？

---

## 一、存储分层总览

项目采用 **Local-First（本地优先）** 架构，数据落在 4 类介质上，按「容量 / 用途 / 生命周期」分层：

| 介质                       | 用途                                                                                              | 容量上限                     | 是否会话级         | 备注                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------ | -------------------------------------------- |
| **IndexedDB（WLDB, v11）** | 所有大对象：画布图层、图片 Blob、视频 Blob、编辑器时间轴、媒体文件                                | 磁盘空闲空间的 ~50%（GB 级） | 永久（除非显式删） | 主力落地层，分 8 个 object store             |
| **localStorage**           | 微型配置：编辑器偏好、云端同步开关、i18n、PocketBase 会话 token、模板/视频模板列表、snap 吸附配置 | 约 5 MB（全站共享）          | 永久               | 仅放 JSON 小数据                             |
| **sessionStorage**         | 画布数据的**同步兜底备份**（beforeunload 时写入）                                                 | 约 5 MB（全站共享）          | 标签页关闭即清空   | 仅防「IndexedDB 写入被浏览器终止」的极端场景 |
| **PocketBase（云端）**     | 可选跨设备同步：画布数据、模板、用户账号、assets                                                  | 服务端磁盘                   | 永久（账号级）     | 登录后才启用，失败不影响本地                 |

### IndexedDB（WLDB v11）的 8 个 object store

| store 名        | 内容                                                                    | 当前是否真正被读写      | 说明                            |
| --------------- | ----------------------------------------------------------------------- | ----------------------- | ------------------------------- |
| `images`        | 本地图片 Blob（local:img_xxx 引用）                                     | ✅ 大量                 | 画布图层/推演产物的图片像素落点 |
| `videos`        | 本地视频 Blob（video:vid_xxx 引用）                                     | ✅                      | 视频生成产物的像素落点          |
| `canvasData`    | 画布图层数组 + offset/scale + version + syncStatus（按 projectId 关联） | ✅                      | **创意画布的完整可恢复状态**    |
| `editorStates`  | 视频编辑器时间轴 tracks/zoom（按 projectId 关联）                       | ✅（仅模块级订阅触发）  | 视频编辑器的可恢复状态          |
| `mediaFiles`    | 导入的媒体 File（projectId 关联）                                       | ✅                      | 视频编辑器导入素材              |
| `assetLibrary`  | 资产库                                                                  | ⚠️ 定义但读写路径需复核 | —                               |
| `projects`      | 项目元数据                                                              | ❌ **预留但无任何读写** | 见下文「关键缺口」              |
| `projectStages` | 5 阶段推演过程数据                                                      | ❌ **预留但无任何读写** | 见下文「关键缺口」              |

---

## 二、各数据域的落地路径

### 2.1 创意画布（Canvas）—— ★ 落地最完整

**内存态**：`useCanvasStore`（Zustand，无 persist 中间件，纯内存）
**持久化编排**：`CanvasIntegrationService`（单例），生命周期 `enter(projectId)` / `exit()`

**保存链路**（Local-First 三级）：

```
用户操作 → useCanvasStore 变化
  → CanvasIntegrationService.setupAutoSave 订阅到变化
  → scheduleSave（1s 防抖）
  → saveCanvasState()
  → CanvasSyncService.save()
      ├─ 立即：saveCanvasDataToLocal（IndexedDB canvasData store，500ms 防抖二次）
      └─ 延迟：scheduleCloudSync（停手 10s 后，最小间隔 30s）→ uploadToCloud（PocketBase）
```

**恢复链路**（`enter(projectId)` 时）：

```
1. 先查 sessionStorage 同步备份（beforeunload 兜底，10 分钟内有效）
   → 有则直接 importCanvasData 恢复，跳过后续
2. 否则 _restoreCanvasState()
   → CanvasSyncService.load()
      ├─ 本地有 → 取本地
      ├─ 登录且云端有 → 按版本/时间戳冲突策略决定用本地还是云端
      └─ 优先保护本地非空数据（防云端空数据覆盖）
```

**图片/视频像素落点**：图层 `src` 只存 `local:img_xxx` / `video:vid_xxx` 引用；真实 Blob 落在 `images` / `videos` store。渲染时由 `unifiedImageService.resolveForDisplay()` 临时转成 `blob:` URL。这一设计保证了「持久 state 存引用、会话级才存 blob」。

**关键节点强制保存**：切换项目、退出、beforeunload 都会走 `forceSync()`，把待保存数据落 IndexedDB，并 flush 云端。

### 2.2 视频编辑器（Video Editor）—— ★ 落地较弱

**内存态**：`editorStore`（Zustand 兼容层，含 `subscribeWithSelector`）
**持久化触发**：`editorStore.ts:694` 模块级 `useEditorStore.subscribe(selector=updatedAt, ...)` —— 监听 updatedAt 变化，30s 防抖后调 `state.save()` → `editorStorage.save()` → IndexedDB `editorStates` store。

**⚠️ 重要事实**：

- `useAutoSave.ts` 中那个 `setInterval(save, 30s)` 的 Hook **是死代码**（全仓零调用方）。
- `editorStorage.ts` 导出的 `saveEditorState` helper **也无调用方**（仅模块内 `editorStorage.save` 被用）。
- 因此视频编辑器的**唯一生效保存路径 = 模块级 subscribe**。它监听 `updatedAt`——只有明确调 `set({updatedAt})` 的操作才触发保存。

**恢复链路**：`editorStore.load(projectId)` → `editorStorage.load()` → IndexedDB `editorStates`。是否在所有入口都被调用需复核（见风险项 R4）。

### 2.3 5 阶段推演（Story Deduction / Step Flow）

**关键结论**：推演是「过程」，其**产物最终都落到画布图层**。

- 剧情推演（`DeductionPanel`）、分镜导入（`importShotsToCanvas`）生成的图片会作为 `image` 图层加入 `useCanvasStore`。
- 这些图层随画布数据（2.1）一起持久化。所以「推演做到一半的成品图」是能恢复的。
- 但**推演的中间状态**（当前在第几阶段、已填的 prompt、未完成的步骤树）**没有独立持久化**——`projectStages` store 预留但未使用。

### 2.4 微型配置（localStorage）

| key                           | 内容                        | 是否自动恢复  |
| ----------------------------- | --------------------------- | ------------- |
| `video-editor-preferences`    | 主题/吸附开关/阈值          | ✅ 启动即读   |
| `wl-canvas-cloud-sync-config` | 云端同步开关                | ✅            |
| `video-editor-snap-config`    | 吸附配置（zustand persist） | ✅            |
| `wl-canvas-state`（旧）       | 已迁移，构造时清理          | ✅ 一次性迁移 |
| `video_templates` / 用户模板  | 模板列表                    | ✅            |
| PocketBase `authStore`        | 登录会话 token              | ✅ 自动续登   |

---

## 三、「中断续作」能力评估

按中断场景逐条判断：

| 中断场景                                 | 画布能否续作                 | 视频编辑器能否续作                       | 说明                                                           |
| ---------------------------------------- | ---------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| 浏览器正常关闭再打开                     | ✅ 能                        | ✅ 能                                    | IndexedDB 永久保存 + enter 时恢复                              |
| 页面刷新（F5）                           | ✅ 能                        | ✅ 能                                    | 同上                                                           |
| 浏览器崩溃 / 断电（未触发 beforeunload） | ✅ 大概率能                  | ⚠️ 依赖最后 30s 内是否触发过保存         | 画布有 1s 防抖 + IndexedDB；但崩溃瞬间未 flush 的编辑可能丢≤1s |
| 标签页误关（同会话 sessionStorage 还在） | ✅ 能                        | ✅ 能                                    | 画布有 sessionStorage 10 分钟兜底                              |
| 切换项目再切回                           | ✅ 能                        | ✅ 能                                    | enter/exit 会先 save 再 load                                   |
| 跨设备（换电脑登录）                     | ✅ 能（需登录+云端同步成功） | ⚠️ 仅画布走云端，`editorStates` 未接云端 | 视频编辑器时间轴不跨设备                                       |

**结论**：创意画布的中断续作能力**接近无缝**（Local-First + 三重兜底：防抖自动存 + beforeunload 同步备份 + 云端同步）。视频编辑器较弱，且 5 阶段推演的「过程状态」完全不持久化。

---

## 四、数据安全风险（按严重度排序）

### 🔴 R1 · 5 阶段推演过程状态不随画布自动持久化（高）

> 修正（2026-08-10 复核）：`projects`/`projectStages` store 虽零读写，但**项目级恢复链路是完整的**——`editorStorage.listProjects` → `indexedDBService.listStateProjects` 用 `EDITOR_STATES` store 枚举 key 恢复，不受那俩空 store 影响。真正缺口是**推演过程态**：
>
> - `StoryDeductionFlowPanel` 的 `flow`（`FlowState`：phase / vlmAnalysis / deduction / storyboard / video）是**组件本地 `useState`**（第 91 行），`updateFlow`（141 行）只更新内存、不落盘。
> - 项目已预留落盘点：`flowLayer.generationPrompt` 字段（`resetFlow` 时 `updateLayer(flowLayerId, { generationPrompt: JSON.stringify(resetFlow) })`，第 130 行），但**各步骤的 `onSave` 只调 `updateFlow`，没有把完整 flow 同步写回 layer 的 `generationPrompt`**。
> - 后果：推演中途刷新，只能看到已生成的图层图片，回不到「做到第几步、prompt 填了什么」。**这是当前唯一真·P0 的「中断续作」缺口**，且修复范围可控（在 `updateFlow`/`goToPhase` 内同步 `updateLayer(flowLayerId, { generationPrompt: JSON.stringify(next) })` 即可）。

### 🟡 R2 · 视频编辑器保存依赖隐式 `updatedAt`（已降级，非 P0）

> 修正（2026-08-10 复核）：editorStore 几乎所有改 tracks/clips 的 action 都带了 `updatedAt: Date.now()`（192/227/244/253/293/315/327/360/397/418 行），仅 `setZoom`/`setPlaybackRate`/`setDuration`/`deselectAll` 等 UI 态不触发——这些本就不算工作成果。**实际静默丢数据风险极低**，从 P0 降级为可观察项（仅建议审计裸 `set` 的少数几处，确认无核心编辑遗漏）。

### 🟠 R3 · 崩溃瞬间 ≤1s 编辑可能丢失（中）

画布自动保存有 1s 防抖；浏览器崩溃/断电不会触发 beforeunload，最后一次flush 之后的编辑会丢。对「断电」场景几乎无解，但可把防抖降到 300ms 或增加周期性保存降低风险窗口。

### 🟠 R4 · 视频编辑器恢复入口需复核（中）

`editorStore.load()` 是否在**所有**进入编辑器的路径都被调用？若有入口漏调，用户会看到空时间轴。需逐一确认路由/页面挂载点。

### 🟠 R5 · 云端同步冲突策略「本地优先」的副作用（中）

`determineSyncDirection` 在多数情况（含版本差 >10）选择 `ASK_USER`，但 `ASK_USER` 分支当前**仍用本地数据**并标 `conflict`，并未真正弹出选择 UI。多设备同时编辑时，云端可能被本地静默覆盖（数据丢失风险）。

### 🟡 R6 · sessionStorage 备份无上限保护（低）

画布 sessionStorage 备份存整份 CanvasData（含图层 JSON，不含图片 Blob）。若图层极多（数千），可能超 5MB 配额，代码已 `try/catch` 静默放弃——此时仅依赖 IndexedDB，可接受。

### 🟡 R7 · 图片/视频 Blob 与图层引用可能孤儿化（低）

图层被删时，`local:img_xxx` 对应的 `images` store 记录**未同步删除**（无级联清理）。长期产生孤儿 Blob，浪费 IndexedDB 空间。已有 `cleanOldImages(7天)` 定时清理兜底。

### 🟡 R8 · localStorage 配额异常无处理（低）

全代码无 `QuotaExceededError` 处理。`editorStorage` 的 catch 仅 `logger.error` 不重试；IndexedDB 容量通常很大（数百 MB），实际触发概率低，但「保存失败不可见」值得在 UI 给提示（如存储满时 toast 警告）。

### ⚪ R9 · `tts.ts` 的 `EdgeTTSService` 为虚假实现（债，非 bug）

`src/services/tts.ts:90` `'Authorization': 'Bearer your_api_key_here'` 是死代码占位符——假设有外部网关注入真实 key，客户端这行永远占位符。非安全风险（不泄露真实密钥），但属于「看起来能用实际不通」的误导实现，建议标注 `@deprecated` 或移除。

---

## 五、修复建议（优先级）

| 优先级 | 项  | 建议                                                                                                                                                                                                            | 工作量 |
| ------ | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P0     | R1  | 在 `StoryDeductionFlowPanel.updateFlow`/`goToPhase` 内同步 `updateLayer(flowLayerId, { generationPrompt: JSON.stringify(next) })`，让推演过程态随画布一起持久化；恢复时从 `generationPrompt` 回填 `flow` 初始值 | 小     |
| P1     | R5  | 实现真正的 `ASK_USER` 冲突解决 UI，或降级为「冲突时两份都保留（本地另存副本）」                                                                                                                                 | 中     |
| P1     | R4  | 审计所有编辑器进入路径，确保 `editorStore.load(projectId)` 必调                                                                                                                                                 | 小     |
| P2     | R3  | 画布防抖 1s → 300ms，或增加 5s 周期保底保存                                                                                                                                                                     | 小     |
| P2     | R7  | 图层删除时级联清理 images/videos 引用                                                                                                                                                                           | 小     |
| P2     | R8  | localStorage/IndexedDB 写失败时 UI 提示（存储满告警）                                                                                                                                                           | 小     |
| 债     | R9  | `tts.ts` EdgeTTSService 标注 `@deprecated` 或移除，避免误导                                                                                                                                                     | 小     |

---

## 六、一句话总结

> **创意画布**：本地优先 + 自动保存 + 同步兜底 + 云端同步，中断续作能力接近无缝，数据安全度较高。
> **视频编辑器**：仅模块级订阅 + 隐式 updatedAt 触发，存在静默丢数据风险，且未接入云端跨设备。
> **5 阶段推演过程**：产物（图层图片）可恢复，但推演「步骤/进度」本身不持久化，属于当前最大可用性缺口。
> **整体数据安全**：本地层（IndexedDB）可靠；最大隐患是「视频编辑器静默不保存」与「推演过程状态零落地」。
