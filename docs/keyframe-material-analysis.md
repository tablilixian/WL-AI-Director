# 关键帧（首尾帧）生成：素材未出现在结果中的根因分析

> 现象：导演工作台生成首尾帧图片时，用了「1 个场景概念图 + 2 个角色」作为素材，但最终生成的首帧里只看到场景（和/或其中一个角色），**另一个角色没有出现在画面中**。

## 一、完整链路（UI → API）

```
KeyframeSection 点击「生成首帧/尾帧」
  └─ handleGenerateKeyframe(shot, type)            components/StageDirector/index.tsx:262
        ├─ basePrompt = 镜头 actionSummary（或已锁定的提示词）
        ├─ characterDescriptions = 角色外观文字（作为参考图的文字回退）
        ├─ buildKeyframePromptWithAI(...)          拼提示词（含【角色外观】【角色一致性要求】）
        ├─ refResult = getRefImagesForShot(...)    components/StageDirector/utils.ts:66
        │     → images = [场景图, 角色1图, 角色2图, ...]（场景优先级最高，排第一）
        └─ generateImage(prompt, refResult.images, 比例, false, hasTurnaround, 'keyframe', shotId, negative)
              └─ callImageApi → imageAdapter.ts:2153 generateImage
                    └─ callDramaBackendApi (image2image)   imageAdapter.ts:214
                          └─ POST /api/v1/generate/image2image
                                body: { prompt, image1:场景, image2:角色1, image3:角色2 }
```

> 注意：`getRefImagesForShot` 没有任何「上限」逻辑，但 `callDramaBackendApi` 上传时 `for (i<len && i<3)`（`imageAdapter.ts:276`），**最多只取前 3 张**作为 `image1/image2/image3`。本例 1 场景 + 2 角色恰好 = 3 张，全部进入请求体。

## 二、根因（对照 api.md）

api.md 对 `POST /api/v1/generate/image2image`（`docs/03-api-reference/api.md:130`）的定义：

- `image1` 描述：**「参考图像1（文件名）」**，请求示例是 `"image1": "image1.png"` + prompt `"Transform this landscape to autumn style"`。
- 这是一个**单图变换（image-to-image transformation）**端点：`image1` 是**源/底图**，模型在它基础上按 prompt 重绘。

结合代码映射（场景排第一 → `image1`），实际发生的是：

1. **场景概念图成了 `image1`（主导底图）**。扩散模型的 `image2image` 会强烈重建 `image1` 的内容/构图，所以生成结果≈「场景环境」。
2. **角色图成了 `image2`/`image3`，语义弱且未定义**。api.md 对 `image2/image3` 只说是「参考图像2/3」，没有定义它们在 `image2image` 下的多主体合成语义。对 Drama Backend 这类扩散后端，它们只是**弱身份/风格线索**，并不会被「放置」进场景。
3. **越靠后的参考图信号越弱**：`image3`（角色2）是 3 张里最弱的一路 → **第二个角色最容易被丢**。这正好对应「另外一个角色没出现」的现象。
4. **提示词层面没有空间位置约束**。`buildKeyframePrompt`（`utils.ts:149`）的【角色一致性要求】只说「外观须遵循参考图」，没有告诉模型「角色A 在左、角色B 在右、两人都要入镜」之类的构图指令，模型没有动机去安排第二个角色。

结论：**不是素材没传，而是 `image2image` 端点 + 「场景=image1」的映射方式，本身不具备「把多个角色合成进同一场景」的能力**。素材确实送到了后端，但后端把它当成「以场景为底图重绘」，角色只是软参考，第二个角色自然就不保证出现。

## 三、一个被忽略的变量：当前激活的图片模型

`callImageApi`（`imageAdapter.ts:2153`）按激活模型分流：

- **Drama Backend（WLDrama）** → `image2image`，如上所述，`image1` 主导，多角色弱。问题集中在这里。
- **Gemini** → `callGeminiApi`（`imageAdapter.ts:457`）：把**所有**参考图作为 `inlineData` 注入同一条多模态 prompt（515-526 行），Gemini 能「看到」全部参考图。多角色关键帧在 Gemini 下明显比 Drama Backend 可靠，但仍**不保证空间排布**。
- **BigModel（CogView）** → `callCogViewApi`，注释明确写「**不支持参考图**」（`imageAdapter.ts:2263`）——选它时素材直接被忽略。

所以「第二角色消失」的严重程度取决于当前图片模型；Drama Backend 最严重，Gemini 次之但仍非 100%。

## 四、可优化的点（按性价比排序）

### 1. 提示词注入「多角色构图指令」（易，收益高，纯前端）

在 `buildKeyframePrompt`（`utils.ts:149`）的【角色一致性要求】基础上，增加**空间构图段**：根据 `characterDescriptions` 数量，生成如「本镜头必须同时出现 N 名角色：{A} 位于画面左前景、{B} 位于右后侧……缺一不可」。给模型明确的「都要入镜 + 各在何处」，能显著减少丢角色。

### 2. 关键帧生成优先走 Gemini（中，配置/路由）

在 `image2image` 多角色场景下，把关键帧生成的默认图片模型软指向 Gemini（或在该场景提示用户切换），利用 inlineData 多图上下文。可加一条路由：当 `referenceImages.length >= 2 且 包含角色` 时，建议/自动用 Gemini。

### 3. 调整参考图排序或拆分（中）

- 现状：场景=image1（底图）导致环境主导。可考虑把**首个角色**作为 image1（身份锚点）、场景降为风格参考；但这会牺牲场景布局一致性，需评估。
- 或在 `getRefImagesForShot` 中，对关键帧场景**限制只传角色**、场景改用文字/风格约束，让 `image2image` 以角色为底图、prompt 描述场景。

### 4. 两阶段合成（稳，工程量大）

最可靠方案：先用场景参考生成「空场景」关键帧，再对**每个缺失角色**用 `image2inpaint`（api.md:514，Inpainting）在指定蒙版区域逐个补绘。能保证两个角色都出现，但需新增蒙版/位置交互与多步编排。

### 5. 用 `image2ipastyletransfer` 做多参考融合（结构性）

api.md:308 的 `image2ipastyletransfer` 明确写「**支持多个参考图像的融合**」「更精细的风格和姿态控制」。可评估把它作为「场景+多角色」关键帧合成的专用端点（传 image1=场景、image2/3=角色、ref_image=风格），替代通用 `image2image`。

### 6. 修复 3 张上限的静默丢弃（易，防御性）

`callDramaBackendApi` 只取前 3 张（`imageAdapter.ts:276`）。若场景 + 2 角色 + 九宫格造型图 / 道具 > 3，后面的会被静默丢弃且无日志警告。建议：超出时记 warning，并按「场景 + 角色优先、道具/九宫格降级」的优先级裁剪，避免关键角色被挤掉。

## 五、建议的落地顺序

1. 先做 **#1（提示词加多角色构图指令）** + **#6（3 张上限告警/优先级裁剪）**——纯前端、低风险、立刻见效。
2. 再评估 **#2（关键帧场景切 Gemini）** 作为质量兜底。
3. 若要「100% 保证双角色入镜」，再上 **#4（inpaint 补绘）** 或 **#5（IPA 多参考融合）**。

> 附：所有素材确实已上传（日志 `[I2I] 参考图数量: 3` + 三张 `image1/2/3 上传成功`），所以不是"没传素材"，而是"传了但 `image2image` 不会把多角色合成进场景"。
