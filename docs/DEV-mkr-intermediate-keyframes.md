# MKR 中间关键帧功能 — 待开发

## 背景

MKR（`image2videomkr`）模式支持在视频时间轴任意位置插入多张关键帧，实现精确的画面节奏控制。

当前 `AdvancedVideoPanel` 的"关键帧时间轴"区域**只有滑块调整位置**，没有添加/删除/上传关键帧的交互。

## 需要的能力

用户在 MKR 模式「在指定时间位置插入关键帧，精确控制画面节奏」面板中，需要两种方式生成中间帧：

### 方式 A：上传关键帧
- 用户上传图片作为中间关键帧
- 上传后自动关联到 `shot.keyframes` 或直接作为 `timedKeyframes` 的条目
- 图片上传流程：先 `POST /api/v1/generate/uploadimage` 上传 → 拿到 filename → 传给 `image2videomkr`

### 方式 B：推演后续关键帧（AI 生成）
- 用户点击「推演下一关键帧」，基于现有首帧/上一帧 + prompt，调用后端生成新关键帧
- 生成完成后自动追加到 `timedKeyframes` 列表

## 涉及文件

- `components/StageDirector/AdvancedVideoPanel.tsx` — 主 UI，需要添加按钮+选择/上传逻辑
- `components/StageDirector/VideoGenerator.tsx` — `buildTimedKeyframes` 已就位
- `components/StageDirector/index.tsx` — API 调用侧已稳定（`images` 数组格式）
- `services/adapters/imageAdapter.ts` — 适配器已还原为 `images` 数组格式
- `types.ts` — `TimedKeyframe`, `Keyframe`, `VideoInterval` 类型定义

## 当前数据流（已实现）

```
buildTimedKeyframes(shot)
  ├─ shot.interval?.startKeyframeId → positionPercent: 0
  ├─ shot.interval?.endKeyframeId   → positionPercent: 100
  └─ shot.interval?.timedKeyframes  → 已存的中间帧（去重）

→ AdvancedVideoPanel 展示列表
→ 用户调整位置（拖拽滑块）
→ handleAdvancedGenerateVideo → 遍历 timedKeyframes
  └─ 通过 unifiedImageService.resolveForApi 转 base64
→ orchestrator → visualService → adapter
  └─ uploadImageToDramaBackend → requestBody.images = [{image, frame_index}]
→ POST /api/v1/generate/image2videomkr
```

## 待实现

- [ ] 添加按钮「+ 添加中间帧」
- [ ] 方式 A：文件选择器上传图片 → 存入 keyframes 并追加到 timedKeyframes
- [ ] 方式 B：调用推演 API 生成下一关键帧 → 追加到 timedKeyframes
- [ ] 删除按钮移除中间帧
- [ ] 保存/恢复中间帧到 `shot.interval?.timedKeyframes`
