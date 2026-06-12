---
title: LLM Provider 配置说明
category: api-reference
status: active
audience: developer
created: 2026-01-01
updated: 2026-06-01
---

# 大模型厂商配置总览

## 概述

项目目前有 **3 个内置大模型厂商**（LLM Provider）和 **1 个自建图片服务**：

| # | 厂商 ID | 名称 | 类型 | 默认 |
|---|---------|------|------|------|
| 1 | `antsk` | BigBanana API (api.antsk.cn) | 综合 LLM 厂商（默认） | ✅ 默认 |
| 2 | `bigmodel` | BigModel API (open.bigmodel.cn) / 智谱 | 综合 LLM 厂商 | ❌ |
| 3 | `newapi` | NewAPI (本地部署) | 对话模型厂商 | ❌ |
| 4 | `wldrama` | WLDrama (自建服务) | 图片/视频自建服务（非 LLM） | — |

> 注：`wldrama` 是自建的 Drama Backend 图片生成/处理服务，不属于"大模型厂商"，但配置结构与前三者一致。如需删除，方法相同。

---

## 1. 厂商定义位置

所有内置厂商在 `types/model.ts:589-618` 的 `BUILTIN_PROVIDERS` 数组中定义：

```typescript
export const BUILTIN_PROVIDERS: ModelProvider[] = [
  {
    id: 'antsk',
    name: 'BigBanana API (api.antsk.cn)',
    baseUrl: 'https://api.antsk.cn',
    isBuiltIn: true,
    isDefault: true,
  },
  {
    id: 'bigmodel',
    name: 'BigModel API (open.bigmodel.cn)',
    baseUrl: 'https://open.bigmodel.cn',
    isBuiltIn: true,
    isDefault: false,
  },
  {
    id: 'newapi',
    name: 'NewAPI (本地部署)',
    baseUrl: 'http://localhost:3000',
    isBuiltIn: true,
    isDefault: false,
  },
  {
    id: 'wldrama',
    name: 'WLDrama (自建服务)',
    baseUrl: 'http://117.50.108.73:8082',
    isBuiltIn: true,
    isDefault: false,
  },
];
```

---

## 2. 模型定义

### 2.1 各厂商模型清单

模型定义在 `types/model.ts` 的三个数组中：

- `BUILTIN_CHAT_MODELS`（对话模型，`types/model.ts:277-392`）
- `BUILTIN_IMAGE_MODELS`（图片模型，`types/model.ts:397-472`）
- `BUILTIN_VIDEO_MODELS`（视频模型，`types/model.ts:477-584`）

所有模型汇总在 `ALL_BUILTIN_MODELS`（`types/model.ts:623-627`）。

#### antsk (BigBanana API)

| 模型 ID | 类型 | apiModel | endpoint |
|---------|------|----------|----------|
| `gpt-5.1` | chat | — | — |
| `gpt-5.2` | chat | — | — |
| `gpt-41` | chat | — | — |
| `claude-sonnet-4-5-20250929` | chat | — | — |
| `gemini-3-pro-image-preview` | image | — | `/v1beta/models/gemini-3-pro-image-preview:generateContent` |
| `veo` | video | — | `/v1/chat/completions` |
| `veo_3_1-fast` | video | — | `/v1/videos` |
| `sora-2` | video | — | `/v1/videos` |

> antsk 模型未设置 `apiModel`，请求时使用 `model.id` 作为 API 模型名。

#### bigmodel (智谱)

| 模型 ID | 类型 | apiModel | endpoint |
|---------|------|----------|----------|
| `glm-4-plus` | chat | `glm-4-plus` | `/api/paas/v4/chat/completions` |
| `glm-4-air` | chat | `glm-4-air` | `/api/paas/v4/chat/completions` |
| `glm-4-flash` | chat | `glm-4-flash` | `/api/paas/v4/chat/completions` |
| `glm-4` | chat | `glm-4` | `/api/paas/v4/chat/completions` |
| `cogview-3-flash` | image | `cogview-3-flash` | `/api/paas/v4/images/generations` |
| `cogview-4` | image | `cogview-4` | `/api/paas/v4/images/generations` |
| `cogview-3-plus` | image | `cogview-3-plus` | `/api/paas/v4/images/generations` |
| `cogview-3` | image | `cogview-3` | `/api/paas/v4/images/generations` |
| `vidu2` | video | `vidu2-image` | `/api/paas/v4/videos/generations` |
| `viduq1` | video | `viduq1-image` | `/api/paas/v4/videos/generations` |
| `cogvideox-flash` | video | `cogvideox-flash` | `/api/paas/v4/videos/generations` |
| `cogvideox-3` | video | `cogvideox-3` | `/api/paas/v4/videos/generations` |

#### newapi (本地部署)

| 模型 ID | 类型 | apiModel | endpoint |
|---------|------|----------|----------|
| `newapi-laguna-xs` | chat | `poolside/laguna-xs.2:free` | `/v1/chat/completions` |
| `newapi-laguna-m` | chat | `poolside/laguna-m.1:free` | `/v1/chat/completions` |

#### wldrama (自建 Drama Backend)

| 模型 ID | 类型 | endpoint |
|---------|------|----------|
| `dramabackend` | image | `/api/v1/generate/txt2image` |

### 2.2 模型参数默认值

所有对话模型共享 `DEFAULT_CHAT_PARAMS`（`types/model.ts:223-226`）：

```typescript
{ temperature: 0.7, maxTokens: undefined }
```

每种图片/视频模型有各自的参数（`types/model.ts:232-268`）。

### 2.3 默认激活模型（`types/model.ts:632-636`）

```typescript
{ chat: 'gpt-5.1', image: 'dramabackend', video: 'sora-2' }
```

---

## 3. API Key 管理

### 3.1 三级优先级体系

实现在 `services/modelRegistry.ts:481-498` 的 `getApiKeyForModel()` 函数：

```
1. 模型专属 API Key  (model.apiKey)        ← 最高优先级
2. 厂商 API Key      (provider.apiKey)       ← 中等优先级
3. 全局 API Key      (globalApiKey)          ← 最低优先级
```

### 3.2 各厂商 API Key 存储方式

| 厂商 | 默认 Key 来源 | 存储位置 |
|------|-------------|----------|
| **antsk** | 全局 Key (`globalApiKey`) | `localStorage['antsk_api_key']` + `process.env.ANTSK_API_KEY`（Vite 注入） |
| **bigmodel** | 厂商 Key (`provider.apiKey`) | `localStorage['bigbanana_model_registry']` 中的 providers 列表 |
| **newapi** | 厂商 Key (`provider.apiKey`) | `localStorage['bigbanana_model_registry']` 中的 providers 列表 |
| **wldrama** | 无 | 不依赖 API Key，直接请求 |

### 3.3 环境变量注入

`.env` 文件：

```
ANTSK_API_KEY=your_api_key_here
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

`vite.config.ts:41-43` 将 `ANTSK_API_KEY` 注入到 `process.env.API_KEY` 和 `process.env.ANTSK_API_KEY`。

> 注意：全局 API Key 的读取顺序是：`registry.globalApiKey` → `localStorage['antsk_api_key']` → `process.env.API_KEY`。

---

## 4. API 调用配置

### 4.1 URL 构建逻辑

核心函数：
- `modelRegistry.ts:503-510` → `getApiBaseUrlForModel()` — 获取 base URL
- `apiCore.ts:41-49` → `getDevApiBaseUrl()` — 开发环境特殊处理
- `chatAdapter.ts:66-72` → `getDevApiBaseUrl()` — chat 适配器特化版本
- `videoAdapter.ts:30-35` → `getDevApiBaseUrl()` — video 适配器特化版本

### 4.2 各厂商请求路由

| 厂商 | 开发环境 URL | 生产环境 URL | 请求端点构建 |
|------|-------------|-------------|-------------|
| **antsk** | `https://api.antsk.cn` | `https://api.antsk.cn` | `baseUrl + model.endpoint`（若无 endpoint，默认 `/v1/chat/completions`） |
| **bigmodel** | `/bigmodel`（Vite 代理） | `https://open.bigmodel.cn` | `baseUrl + model.endpoint` |
| **newapi** | `http://localhost:3000` | `http://localhost:3000` | `baseUrl + model.endpoint` |
| **wldrama** | `/drama-api`（Vite 代理） | `http://117.50.108.73:8082` | `baseUrl + model.endpoint` |

### 4.3 Vite 代理配置（`vite.config.ts:12-37`）

```typescript
proxy: {
  '/drama-api':         → http://117.50.108.73:8082   (WLDrama)
  '/bigmodel-files':    → https://aigc-files.bigmodel.cn  (BigModel 文件下载)
  '/bigmodel':          → https://open.bigmodel.cn    (BigModel API)
  '/video-proxy':       → https://...ufileos.com      (UCloud 视频代理)
}
```

### 4.4 厂商识别逻辑

各适配器中通过模型 ID 前缀来识别厂商：

| 厂商 | 识别方式 | 代码位置 |
|------|---------|---------|
| **antsk** | 默认（非其他厂商即为 antsk） | — |
| **bigmodel** | `modelId.startsWith('glm-')` / `cogview` / `vidu` / `cogvideo` 或 `providerId === 'bigmodel'` | `chatAdapter.ts:52-54`、`imageAdapter.ts:57-60`、`videoAdapter.ts:23-25`、`apiCore.ts:26-28` |
| **newapi** | `modelId.startsWith('newapi-')` | `chatAdapter.ts:59-61` |
| **wldrama** | `providerId === 'wldrama'` 或 `model.providerId === 'wldrama'` | `imageAdapter.ts:65-68` |

### 4.5 请求 Header 差异

| 厂商 | Authorization | Content-Type | 特殊处理 |
|------|--------------|-------------|---------|
| **antsk** | `Bearer {apiKey}` | `application/json` | — |
| **bigmodel** | `Bearer {apiKey}` | `application/json` | 视频请求 body 为 JSON，非 FormData |
| **newapi** | `Bearer {apiKey}` | `application/json` | — |
| **wldrama** | 无 | `application/json` | 图片上传用 `FormData`；部分端点无 Authorization |

---

## 5. 适配器调用链

```
modelService.ts            ← 统一入口
  ├── chatAdapter.ts       ← 对话模型（所有厂商使用相同的 OpenAI 兼容接口）
  ├── imageAdapter.ts      ← 图片模型（按厂商分发：Gemini / CogView / DramaBackend）
  └── videoAdapter.ts      ← 视频模型（按 mode 分发：sync=Veo / async=Sora）
```

### 5.1 图片模型分发逻辑（`imageAdapter.ts:1113-1142`）

```
callImageApi()
  ├── wldrama       → callDramaBackendApi()        — 文生图/图生图
  │                  callDramaBackendCharacterApi() — 角色立绘图
  │                  callDramaBackendStoryboardApi()— 分镜生成
  ├── bigmodel      → callCogViewApi()              — CogView 文生图
  └── 其他（antsk）  → callGeminiApi()               — Gemini Image
```

### 5.2 视频模型分发逻辑（`videoAdapter.ts:568-572`）

```
callVideoApi()
  ├── mode === 'async'  → callSoraApi()   — Sora-2 / Veo 3.1 Fast / BigModel 视频
  └── mode === 'sync'   → callVeoApi()    — Veo 3.1 首尾帧
```

---

## 6. 状态持久化

所有运行时配置存储在 `localStorage['bigbanana_model_registry']` 中，数据结构为 `ModelRegistryState`（`types/model.ts:150-155`）：

```typescript
interface ModelRegistryState {
  providers: ModelProvider[];    // 厂商列表（含内置+自定义）
  models: ModelDefinition[];     // 模型列表（含内置+自定义）
  activeModels: ActiveModels;    // 当前激活的模型
  globalApiKey?: string;         // 全局 API Key
}
```

全局 API Key 额外存储在 `localStorage['antsk_api_key']`。

---

## 7. 如何删除某个厂商（操作指南）

### 7.1 安全删除步骤

要完整删除一个厂商（例如 `newapi`），需修改以下文件：

#### 步骤 1：删除厂商定义

**文件：`types/model.ts`**
- 从 `BUILTIN_PROVIDERS`（第 589-618 行）中移除该厂商对象

#### 步骤 2：删除关联模型

**文件：`types/model.ts`**
- 从 `BUILTIN_CHAT_MODELS` 中移除 `providerId` 匹配的模型
- 从 `BUILTIN_IMAGE_MODELS` 中移除 `providerId` 匹配的模型
- 从 `BUILTIN_VIDEO_MODELS` 中移除 `providerId` 匹配的模型

#### 步骤 3：检查默认激活模型

**文件：`types/model.ts`**
- `DEFAULT_ACTIVE_MODELS`（第 632-636 行）— 如果默认激活的模型属于该厂商，需要改成其他厂商的模型

#### 步骤 4：清理适配器中的厂商识别逻辑

**文件：`services/adapters/chatAdapter.ts`**
- `isNewapiModel()` 函数（第 59-61 行）— 如果删除 newapi，移除该函数及其调用
- `verifyApiKey()` 中对应的 URL/模型分支（第 210-225 行）

**文件：`services/adapters/imageAdapter.ts`**
- `isDramaBackendProvider()`（第 65-68 行）— 如果删除 wldrama，移除相关分发逻辑
- `isBigModelProvider()`（第 57-60 行）— 如果删除 bigmodel，移除相关分发逻辑

**文件：`services/adapters/videoAdapter.ts`**
- `isBigModelVideoModel()`（第 23-25 行）— 如果删除 bigmodel，移除该函数

**文件：`services/ai/apiCore.ts`**
- `isBigModelModel()`（第 26-28 行）
- `isBigModelVideoModel()`（第 33-35 行）
- `getDevApiBaseUrl()` 中的相关分支（第 41-49 行）

#### 步骤 5：清理 Vite 代理（如适用）

**文件：`vite.config.ts`**
- 如果删除 bigmodel，移除 `/bigmodel` 和 `/bigmodel-files` 代理
- 如果删除 wldrama，移除 `/drama-api` 代理

#### 步骤 6：清理 UI 组件中的特殊引用

**文件：`components/ModelConfig/GlobalSettings.tsx`**
- `handleVerifyAndSave()` 中的分支（第 72-81 行）
- `getProviderLabel()` / `getProviderPlaceholder()` 中的分支（第 123-147 行）
- 配置说明文字（第 296-303 行）

**文件：`components/ModelConfig/ModelList.tsx`**
- 无厂商特定代码（已通用化）

#### 步骤 7：清理业务服务中的引用

搜索整个项目中是否还有对厂商 ID 的字符串引用：

```bash
rg "newapi" --type ts
rg "bigmodel" --type ts
rg "antsk" --type ts
rg "wldrama" --type ts
rg "dramabackend" --type ts
```

> 重点检查：`services/ai/`、`services/adapters/`、`components/ModelConfig/`、`components/Onboarding/` 等目录。

---

## 8. 各厂商关联文件清单

### antsk（默认厂商）

| 文件 | 内容 |
|------|------|
| `types/model.ts:590-596` | Provider 定义 |
| `types/model.ts:277-307` | Chat 模型（gpt-5.1, gpt-5.2, gpt-41, claude-sonnet） |
| `types/model.ts:399-408` | Image 模型（gemini-3-pro-image-preview） |
| `types/model.ts:478-510` | Video 模型（veo, veo_3_1-fast, sora-2） |
| `.env` | `ANTSK_API_KEY` 环境变量 |
| `vite.config.ts:41-43` | Vite 注入 `process.env.ANTSK_API_KEY` |
| `services/modelRegistry.ts:25` | `API_KEY_STORAGE_KEY = 'antsk_api_key'` |
| `services/modelRegistry.ts:44` | 默认从 `localStorage['antsk_api_key']` 加载 |
| `services/ai/apiCore.ts:99` | `DEFAULT_API_BASE = 'https://api.antsk.cn'` |
| `components/ModelConfig/GlobalSettings.tsx:163` | UI 推荐文案 |

### bigmodel（智谱）

| 文件 | 内容 |
|------|------|
| `types/model.ts:597-603` | Provider 定义 |
| `types/model.ts:344-391` | Chat 模型（glm-4-plus, glm-4-air, glm-4-flash, glm-4） |
| `types/model.ts:410-457` | Image 模型（cogview-3-flash, cogview-4, cogview-3-plus, cogview-3） |
| `types/model.ts:512-583` | Video 模型（vidu2, viduq1, cogvideox-flash, cogvideox-3） |
| `vite.config.ts:20-30` | Vite 代理 `/bigmodel` → `open.bigmodel.cn` |
| `services/adapters/chatAdapter.ts:52-54` | `isBigModelModel()` 识别函数 |
| `services/adapters/imageAdapter.ts:57-60` | `isBigModelProvider()` 识别函数 |
| `services/adapters/imageAdapter.ts:89-178` | `callCogViewApi()` 实现 |
| `services/adapters/videoAdapter.ts:23-25` | `isBigModelVideoModel()` 识别函数 |
| `services/adapters/videoAdapter.ts:410-412` | 异步结果查询端点的 BigModel 分支 |
| `services/ai/apiCore.ts:26-28` | `isBigModelModel()` 识别函数 |
| `services/ai/apiCore.ts:33-35` | `isBigModelVideoModel()` 识别函数 |
| `services/ai/apiCore.ts:537-541` | BigModel 文件代理 URL 替换 |

### newapi（本地部署）

| 文件 | 内容 |
|------|------|
| `types/model.ts:604-610` | Provider 定义 |
| `types/model.ts:319-342` | Chat 模型（newapi-laguna-xs, newapi-laguna-m） |
| `services/adapters/chatAdapter.ts:59-61` | `isNewapiModel()` 识别函数 |
| `services/adapters/chatAdapter.ts:215-217` | `verifyApiKey()` 中 newapi 分支 |
| `services/adapters/chatAdapter.ts:223-224` | 验证时使用 `poolside/laguna-xs.2:free` 为测试模型 |

### wldrama（自建 Drama Backend）

| 文件 | 内容 |
|------|------|
| `types/model.ts:611-618` | Provider 定义 |
| `types/model.ts:459-472` | Image 模型（dramabackend） |
| `vite.config.ts:14-18` | Vite 代理 `/drama-api` → `117.50.108.73:8082` |
| `services/adapters/imageAdapter.ts:65-68` | `isDramaBackendProvider()` 识别函数 |
| `services/adapters/imageAdapter.ts:183-297` | `callDramaBackendApi()` 实现 |
| `services/adapters/imageAdapter.ts:631-805` | 角色立绘图、分镜、分割网格、修复、VL 等专用端点 |

---

## 9. 调用时序总结

```
用户操作 → modelService.ts (chat/generateImage/generateVideo)
  → 适配器分发（按 model.providerId）
    → 获取 API Key       (modelRegistry.getApiKeyForModel)
    → 获取 base URL      (modelRegistry.getApiBaseUrlForModel)
    → 构建 endpoint      (model.endpoint || 默认路径)
    → 发起 fetch 请求     (baseUrl + endpoint)
    → 返回结果
```
