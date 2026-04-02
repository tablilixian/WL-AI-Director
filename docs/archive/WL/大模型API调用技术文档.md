# 大模型 API 调用技术文档

## 📋 概述

本文档详细说明了 WL-AI-Director 项目中所有大模型 API 的调用方式、请求格式、响应处理和调试方法。

**目标受众**: 开发人员、API 调试人员
**文档版本**: v1.0
**最后更新**: 2026-03-16

---

## 🏗️ 架构概览

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (UI)                           │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              服务层 (Services)                          │
│  - scriptService.ts (剧本解析)                           │
│  - shotService.ts (分镜生成)                             │
│  - visualService.ts (视觉生成)                           │
│  - videoService.ts (视频生成)                            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│            适配器层 (Adapters)                          │
│  - chatAdapter.ts (对话模型)                            │
│  - imageAdapter.ts (图片模型)                           │
│  - videoAdapter.ts (视频模型)                           │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│            核心层 (Core)                                │
│  - apiCore.ts (API 基础设施)                            │
│  - modelRegistry.ts (模型注册中心)                      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              外部 API (LLM Providers)                  │
│  - AntSK (api.antsk.cn)                                 │
│  - BigModel (open.bigmodel.cn)                          │
│  - Google (generativelanguage.googleapis.com)           │
└─────────────────────────────────────────────────────────┘
```

---

## 🔑 API Key 管理策略

### 优先级顺序

```
1. 模型专属 API Key (model.apiKey)
   ↓
2. 提供商 API Key (provider.apiKey)
   ↓
3. 全局 API Key (globalApiKey)
```

### API Key 获取流程

**文件位置**: `services/ai/apiCore.ts`

```typescript
export const checkApiKey = (type: 'chat' | 'image' | 'video' = 'chat', modelId?: string): string => {
  const resolvedModel = resolveModel(type, modelId);
  
  if (resolvedModel) {
    // 1. 优先使用模型专属 API Key
    const modelApiKey = getApiKeyForModel(resolvedModel.id);
    if (modelApiKey) return modelApiKey;
    
    // 2. 其次使用提供商的 API Key
    const provider = getProviderById(resolvedModel.providerId);
    if (provider?.apiKey) return provider.apiKey;
  }
  
  // 3. 最后使用全局 API Key
  return getGlobalApiKey();
};
```

### API Key 验证

**文件位置**: `services/ai/apiCore.ts`

```typescript
export const verifyApiKey = async (key: string): Promise<{ success: boolean; message: string }> => {
  try {
    const apiBase = getApiBase('chat');
    const resolvedModel = getDefaultChatModelId();
    const requestModel = resolveRequestModel('chat', resolvedModel);
    
    const response = await fetch(`${apiBase}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: requestModel,
        messages: [{ role: 'user', content: '仅返回1' }],
        temperature: 0.1,
        max_tokens: 5
      })
    });

    if (!response.ok) {
      let errorMessage = `验证失败: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // ignore
      }
      return { success: false, message: errorMessage };
    }

    const data = await response.json();
    if (data.choices?.[0]?.message?.content !== undefined) {
      return { success: true, message: 'API Key 验证成功' };
    } else {
      return { success: false, message: '返回格式异常' };
    }
  } catch (error: any) {
    return { success: false, message: error.message || '网络错误' };
  }
};
```

---

## 💬 对话模型 API (Chat Completions)

### 基本信息

| 属性 | 值 |
|------|-----|
| **端点** | `/v1/chat/completions` |
| **方法** | POST |
| **Content-Type** | `application/json` |
| **认证** | `Authorization: Bearer {api_key}` |

### 支持的模型

**文件位置**: `types/model.ts`

| 模型 ID | 模型名称 | 提供商 | 描述 |
|---------|---------|--------|------|
| `gpt-5.1` | GPT-5.1 | AntSK | 剧本切分首选，结构化输出稳定 |
| `gpt-5.2` | GPT-5.2 | AntSK | 创意增强型切分 |
| `gpt-41` | GPT-4.1 | AntSK | 严谨切分，适合复杂叙事 |
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 | AntSK | 长文友好，适合长篇剧本 |
| `glm-4-plus` | GLM-4 Plus | BigModel | 高性能对话模型 |
| `glm-4-air` | GLM-4 Air | BigModel | 高性价比，价格仅为 50% |
| `glm-4-flash` | GLM-4 Flash | BigModel | 免费快速响应 |
| `glm-4` | GLM-4 | BigModel | 稳定可靠 |

### 请求格式

#### 基础请求

```json
{
  "model": "gpt-5.1",
  "messages": [
    {
      "role": "system",
      "content": "你是一个专业的剧本分析师"
    },
    {
      "role": "user",
      "content": "分析以下剧本..."
    }
  ],
  "temperature": 0.7,
  "max_tokens": 8192,
  "top_p": 0.9,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0
}
```

#### JSON 格式响应

```json
{
  "model": "gpt-5.1",
  "messages": [
    {
      "role": "user",
      "content": "请以 JSON 格式返回..."
    }
  ],
  "response_format": {
    "type": "json_object"
  },
  "temperature": 0.7
}
```

### 响应格式

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-5.1",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "AI 生成的回复内容"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

### 流式响应 (SSE)

**文件位置**: `services/ai/apiCore.ts`

```typescript
export const chatCompletionStream = async (
  prompt: string,
  model?: string,
  temperature: number = 0.7,
  responseFormat: 'json_object' | undefined = undefined,
  timeout: number = 600000,
  onDelta?: (delta: string) => void
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  const apiKey = checkApiKey('chat', resolvedModel);
  const requestModel = resolveRequestModel('chat', resolvedModel);
  const requestBody: any = {
    model: requestModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: temperature,
    stream: true
  };

  if (responseFormat === 'json_object') {
    requestBody.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const apiBase = getApiBase('chat', model);
    const resolved = resolveModel('chat', model);
    const endpoint = resolved?.endpoint || '/v1/chat/completions';
    const response = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      throw await parseHttpError(response);
    }

    if (!response.body) {
      throw new Error('响应流为空，无法进行流式处理');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex !== -1) {
        const chunk = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);

        if (chunk) {
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const dataStr = line.replace(/^data:\s*/, '');
            if (dataStr === '[DONE]') {
              clearTimeout(timeoutId);
              return fullText;
            }
            try {
              const payload = JSON.parse(dataStr);
              const delta = payload?.choices?.[0]?.delta?.content || payload?.choices?.[0]?.message?.content || '';
              if (delta) {
                fullText += delta;
                onDelta?.(delta);
              }
            } catch (e) {
              // 忽略解析失败的行
            }
          }
        }

        boundaryIndex = buffer.indexOf('\n\n');
      }
    }

    clearTimeout(timeoutId);
    return fullText;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeout}ms）`);
    }
    throw error;
  }
};
```

### SSE 流式响应格式

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"gpt-5.1","choices":[{"index":0,"delta":{"content":"AI"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"gpt-5.1","choices":[{"index":0,"delta":{"content":" 生成的"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"gpt-5.1","choices":[{"index":0,"delta":{"content":" 回复"},"finish_reason":null}]}

data: [DONE]
```

### 错误处理

**文件位置**: `services/ai/apiCore.ts`

```typescript
export const parseHttpError = async (response: Response): Promise<Error> => {
  const httpStatus = response.status;
  let errorMessage = `HTTP错误: ${httpStatus}`;
  try {
    const errorData = await response.json();
    errorMessage = errorData.error?.message || errorMessage;
  } catch (e) {
    try {
      const errorText = await response.text();
      if (errorText) errorMessage = errorText;
    } catch {
      // ignore
    }
  }
  const err: any = new Error(errorMessage);
  err.status = httpStatus;
  return err;
};
```

### 重试机制

**文件位置**: `services/ai/apiCore.ts`

```typescript
export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (e: any) {
      lastError = e;
      const isRetryableError =
        e.status === 429 ||
        e.code === 429 ||
        e.status === 504 ||
        e.message?.includes('429') ||
        e.message?.includes('quota') ||
        e.message?.includes('RESOURCE_EXHAUSTED') ||
        e.message?.includes('超时') ||
        e.message?.includes('timeout') ||
        e.message?.includes('Gateway Timeout') ||
        e.message?.includes('504') ||
        e.message?.includes('ECONNRESET') ||
        e.message?.includes('ETIMEDOUT') ||
        e.message?.includes('network') ||
        e.message?.includes('openai_error') ||
        e.status >= 500;

      if (isRetryableError && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        logger.warn(LogCategory.AI, `请求失败，正在重试... (第 ${i + 1}/${maxRetries} 次，${delay}ms后重试) ${e.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
};
```

### 调试示例

#### 使用 curl 测试

```bash
# 基础请求
curl -X POST https://api.antsk.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 0.7
  }'

# JSON 格式响应
curl -X POST https://api.antsk.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "Return JSON"}],
    "response_format": {"type": "json_object"},
    "temperature": 0.7
  }'

# BigModel API
curl -X POST https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BIGMODEL_API_KEY" \
  -d '{
    "model": "glm-4-flash",
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 0.7
  }'
```

---

## 🖼️ 图片生成 API

### BigModel CogView API

#### 基本信息

| 属性 | 值 |
|------|-----|
| **端点** | `/api/paas/v4/images/generations` |
| **方法** | POST |
| **Content-Type** | `application/json` |
| **认证** | `Authorization: Bearer {api_key}` |

#### 支持的模型

| 模型 ID | 模型名称 | 描述 |
|---------|---------|------|
| `cogview-3-flash` | CogView-3 Flash | 免费快速生成 |
| `cogview-4` | CogView-4 | 支持多种风格和尺寸 |
| `cogview-3-plus` | CogView-3 Plus | 高质量图像生成 |
| `cogview-3` | CogView-3 | 标准图像生成 |

#### 请求格式

```json
{
  "model": "cogview-4",
  "prompt": "一个美丽的日落海滩场景，电影级光照",
  "size": "1280x720"
}
```

**文件位置**: `services/adapters/imageAdapter.ts`

```typescript
const callCogViewApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiKey: string,
  apiBase: string
): Promise<string> => {
  const apiModel = model.apiModel || model.id;
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  
  // BigModel 尺寸映射
  const sizeMap: Record<AspectRatio, string> = {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '1024x1024',
  };
  const size = sizeMap[aspectRatio] || '1024x1024';
  
  const requestBody: any = {
    model: apiModel,
    prompt: options.prompt,
    size,
  };
  
  const response = await retryOperation(async () => {
    const res = await fetch(`${apiBase}${model.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      let errorMessage = `HTTP 错误: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error?.message || errorData.msg || errorMessage;
      } catch (e) {
        const errorText = await res.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    return await res.json();
  });

  // BigModel 返回图片 URL，需要下载并上传到 Supabase Storage
  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error('图片生成失败：未能从响应中提取图片 URL');
  }

  // 开发环境使用代理下载图片以避免 CORS 问题
  const downloadUrl = import.meta.env.DEV 
    ? `/proxy-image/${encodeURIComponent(imageUrl)}`
    : imageUrl;

  const imageResponse = await fetch(downloadUrl);
  if (!imageResponse.ok) {
    throw new Error(`图片下载失败: ${imageResponse.status}`);
  }

  const imageBlob = await imageResponse.blob();
  
  // 保存到本地 IndexedDB
  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);
  
  console.log(`[ImageAdapter] 图片已保存到本地: ${localImageId}`);
  
  // 返回本地图片 ID，格式为 local:{id}
  return `local:${localImageId}`;
};
```

#### 响应格式

```json
{
  "created": 1234567890,
  "data": [
    {
      "url": "https://example.com/generated-image.png"
    }
  ]
}
```

#### 调试示例

```bash
# 基础请求
curl -X POST https://open.bigmodel.cn/api/paas/v4/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BIGMODEL_API_KEY" \
  -d '{
    "model": "cogview-4",
    "prompt": "一个美丽的日落海滩场景",
    "size": "1280x720"
  }'
```

### Gemini Image API

#### 基本信息

| 属性 | 值 |
|------|-----|
| **端点** | `/v1beta/models/{model}:generateContent` |
| **方法** | POST |
| **Content-Type** | `application/json` |
| **认证** | `Authorization: Bearer {api_key}` |

#### 支持的模型

| 模型 ID | 模型名称 | 描述 |
|---------|---------|------|
| `gemini-3-pro-image-preview` | Gemini 3 Pro Image | Google Nano Banana Pro 图片生成 |

#### 请求格式

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "生成一个电影级的日落海滩场景"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"]
  }
}
```

#### 带参考图的请求

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "根据参考图生成类似风格的场景"
        },
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "base64_encoded_image_data"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9"
    }
  }
}
```

**文件位置**: `services/adapters/imageAdapter.ts`

```typescript
const callGeminiApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiKey: string,
  apiBase: string
): Promise<string> => {
  const apiModel = model.apiModel || model.id;
  const endpoint = model.endpoint || `/v1beta/models/${apiModel}:generateContent`;
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  
  // 构建提示词
  let finalPrompt = options.prompt;
  
  // 如果有参考图，添加一致性指令
  if (options.referenceImages && options.referenceImages.length > 0) {
    finalPrompt = `
      ⚠️⚠️⚠️ CRITICAL REQUIREMENTS - CHARACTER CONSISTENCY ⚠️⚠️⚠️
      
      Reference Images Information:
      - The FIRST image is the Scene/Environment reference.
      - Any subsequent images are Character references (Base Look or Variation).
      
      Task:
      Generate a cinematic shot matching this prompt: "${options.prompt}".
      
      ⚠️ ABSOLUTE REQUIREMENTS (NON-NEGOTIABLE):
      1. Scene Consistency:
         - STRICTLY maintain the visual style, lighting, and environment from the scene reference.
      
      2. Character Consistency - HIGHEST PRIORITY:
         If characters are present in the prompt, they MUST be IDENTICAL to the character reference images:
         • Facial Features: Eyes (color, shape, size), nose structure, mouth shape, facial contours must be EXACTLY the same
         • Hairstyle & Hair Color: Length, color, texture, and style must be PERFECTLY matched
         • Clothing & Outfit: Style, color, material, and accessories must be IDENTICAL
         • Body Type: Height, build, proportions must remain consistent
         
      ⚠️ DO NOT create variations or interpretations of the character - STRICT REPLICATION ONLY!
      ⚠️ Character appearance consistency is THE MOST IMPORTANT requirement!
    `;
  }

  // 构建请求 parts
  const parts: any[] = [{ text: finalPrompt }];

  // 添加参考图片
  if (options.referenceImages) {
    options.referenceImages.forEach((imgUrl) => {
      const match = imgUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
    });
  }

  // 构建请求体
  const requestBody: any = {
    contents: [{
      role: 'user',
      parts: parts,
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };
  
  // 非默认宽高比需要添加 imageConfig
  if (aspectRatio !== '16:9') {
    requestBody.generationConfig.imageConfig = {
      aspectRatio: aspectRatio,
    };
  }

  // 调用 API
  const response = await retryOperation(async () => {
    const res = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': '*/*',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      if (res.status === 400) {
        throw new Error('提示词可能包含不安全或违规内容，未能处理。\n\n建议：\n1. 避免使用武器、暴力等敏感词汇\n2. 使用更温和的描述方式\n3. 例如：将"警员"改为"年轻男子"，"手枪"改为"道具"\n\n请修改后重试。');
      }
      if (res.status === 500) {
        throw new Error('当前请求较多，暂时未能处理成功，请稍后重试。');
      }
      
      let errorMessage = `HTTP 错误: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        const errorText = await res.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    return await res.json();
  });

  // 提取 base64 图片
  const candidates = response.candidates || [];
  let base64Image: string | undefined;
  
  if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        base64Image = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  if (!base64Image) {
    throw new Error('图片生成失败：未能从响应中提取图片数据');
  }

  // 将 base64 转换为 Blob
  const base64Data = base64Image.split(',')[1];
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const imageBlob = new Blob([byteArray], { type: 'image/png' });

  // 保存到本地 IndexedDB
  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);
  
  console.log(`[ImageAdapter] Gemini图片已保存到本地: ${localImageId}`);
  
  // 返回本地图片 ID，格式为 local:{id}
  return `local:${localImageId}`;
};
```

#### 响应格式

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "base64_encoded_image_data"
            }
          }
        ]
      }
    }
  ]
}
```

#### 调试示例

```bash
# 基础请求
curl -X POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "生成一个电影级的日落海滩场景"
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"]
    }
  }'

# 带参考图的请求
curl -X POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "根据参考图生成类似风格的场景"
          },
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "base64_encoded_image_data"
            }
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9"
      }
    }
  }'
```

---

## 🎬 视频生成 API

### 同步模式 (Veo)

#### 基本信息

| 属性 | 值 |
|------|-----|
| **端点** | `/v1/chat/completions` |
| **方法** | POST |
| **Content-Type** | `application/json` |
| **认证** | `Authorization: Bearer {api_key}` |

#### 支持的模型

| 模型 ID | 模型名称 | 描述 |
|---------|---------|------|
| `veo` | Veo 3.1 首尾帧 | 需要起始帧和结束帧 |

#### 请求格式

```json
{
  "model": "veo_3_1_t2v_fast_landscape",
  "messages": [
    {
      "role": "user",
      "content": "生成一个日落海滩的视频"
    }
  ],
  "stream": false,
  "temperature": 0.7
}
```

#### 带起始帧的请求

```json
{
  "model": "veo_3_1_i2v_s_fast_fl_landscape",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "生成一个日落海滩的视频"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,base64_encoded_image_data"
          }
        }
      ]
    }
  ],
  "stream": false,
  "temperature": 0.7
}
```

#### 带首尾帧的请求

```json
{
  "model": "veo_3_1_i2v_s_fast_fl_landscape",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "生成从起始帧到结束帧的视频"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,base64_encoded_start_image"
          }
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,base64_encoded_end_image"
          }
        }
      ]
    }
  ],
  "stream": false,
  "temperature": 0.7
}
```

**文件位置**: `services/adapters/videoAdapter.ts`

```typescript
const callVeoApi = async (
  options: VideoGenerateOptions,
  model: VideoModelDefinition,
  apiKey: string,
  apiBase: string
): Promise<string> => {
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  const hasStartImage = !!options.startImage;
  
  // Veo 不支持 1:1
  const finalAspectRatio = aspectRatio === '1:1' ? '16:9' : aspectRatio;
  
  // 获取具体的模型名称
  const modelName = getVeoModelName(hasStartImage, finalAspectRatio);
  
  // 清理图片数据
  const cleanStart = options.startImage?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';
  const cleanEnd = options.endImage?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';

  // 构建消息
  const messages: any[] = [{ role: 'user', content: options.prompt }];

  if (cleanStart) {
    messages[0].content = [
      { type: 'text', text: options.prompt },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${cleanStart}` } },
    ];
  }

  if (cleanEnd && Array.isArray(messages[0].content)) {
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${cleanEnd}` },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200000); // 20 分钟

  try {
    const response = await retryOperation(async () => {
      const res = await fetch(`${apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          stream: false,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error('提示词可能包含不安全或违规内容，未能处理。请修改后重试。');
        }
        if (res.status === 500) {
          throw new Error('当前请求较多，暂时未能处理成功，请稍后重试。');
        }
        
        let errorMessage = `HTTP 错误: ${res.status}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          const errorText = await res.text();
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      return res;
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 提取视频 URL
    const urlMatch = content.match(/https?:\/\/[^\s\])"]+\.mp4[^\s\])"']*/i) ||
                    content.match(/https?:\/\/[^\s\])"]+/i);
    
    if (!urlMatch) {
      throw new Error('视频生成失败：未能从响应中提取视频 URL');
    }

    const videoUrl = urlMatch[0];

    // 下载并转换为 base64
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`视频下载失败: ${videoResponse.status}`);
    }

    const videoBlob = await videoResponse.blob();
    const reader = new FileReader();
    
    return new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result && result.startsWith('data:')) {
          resolve(result);
        } else {
          reject(new Error('视频转换失败'));
        }
      };
      reader.onerror = () => reject(new Error('视频读取失败'));
      reader.readAsDataURL(videoBlob);
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('视频生成超时 (20分钟)');
    }
    throw error;
  }
};
```

#### 响应格式

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "veo_3_1_t2v_fast_landscape",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "视频已生成：https://example.com/generated-video.mp4"
      },
      "finish_reason": "stop"
    }
  ]
}
```

#### 调试示例

```bash
# 文本生成视频
curl -X POST https://api.antsk.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "veo_3_1_t2v_fast_landscape",
    "messages": [
      {
        "role": "user",
        "content": "生成一个日落海滩的视频"
      }
    ],
    "stream": false,
    "temperature": 0.7
  }'

# 图片生成视频
curl -X POST https://api.antsk.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "veo_3_1_i2v_s_fast_fl_landscape",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "生成一个日落海滩的视频"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,base64_encoded_image_data"
            }
          }
        ]
      }
    ],
    "stream": false,
    "temperature": 0.7
  }'
```

### 异步模式 (Sora / Veo 3.1 Fast)

#### 基本信息

| 属性 | 值 |
|------|-----|
| **创建任务端点** | `/v1/videos` |
| **查询状态端点** | `/v1/videos/{id}` 或 `/api/paas/v4/async-result/{id}` |
| **下载视频端点** | `/v1/videos/{id}/content` |
| **方法** | POST (创建), GET (查询/下载) |
| **Content-Type** | `multipart/form-data` (创建) |
| **认证** | `Authorization: Bearer {api_key}` |

#### 支持的模型

| 模型 ID | 模型名称 | 描述 |
|---------|---------|------|
| `sora-2` | Sora-2 | 异步模式，支持横屏/竖屏/方形 |
| `veo_3_1-fast` | Veo 3.1 Fast | 异步模式，支持横屏/竖屏，价格便宜速度快 |

#### 创建任务请求

**文件位置**: `services/adapters/videoAdapter.ts`

```typescript
const callSoraApi = async (
  options: VideoGenerateOptions,
  model: VideoModelDefinition,
  apiKey: string,
  apiBase: string
): Promise<string> => {
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  const duration = options.duration || model.params.defaultDuration;
  const apiModel = model.apiModel || model.id;
  const references = [options.startImage, options.endImage].filter(Boolean) as string[];
  const resolvedModel = apiModel || 'sora-2';
  const useReferenceArray = resolvedModel.toLowerCase().startsWith('veo_3_1-fast');

  if (resolvedModel === 'sora-2' && references.length >= 2) {
    throw new Error('Sora-2 不支持首尾帧模式，请只传一张参考图。');
  }
  
  const { width, height, size } = getSizeFromAspectRatio(aspectRatio);

  console.log(`🎬 使用异步模式生成视频 (${resolvedModel}, ${aspectRatio}, ${duration}秒)...`);

  // 创建任务
  const formData = new FormData();
  formData.append('model', resolvedModel);
  formData.append('prompt', options.prompt);
  formData.append('seconds', String(duration));
  formData.append('size', size);

  const appendReference = async (base64: string, filename: string, fieldName: string) => {
    const cleanBase64 = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const resizedBase64 = await resizeImageToSize(cleanBase64, width, height);
    const byteCharacters = atob(resizedBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    formData.append(fieldName, blob, filename);
  };

  // 添加参考图片（veo_3_1-fast 支持首尾帧数组；单图时使用 input_reference）
  if (useReferenceArray && references.length >= 2) {
    const limited = references.slice(0, 2);
    await appendReference(limited[0], 'reference-start.png', 'input_reference[]');
    await appendReference(limited[1], 'reference-end.png', 'input_reference[]');
  } else if (references.length >= 1) {
    await appendReference(references[0], 'reference.png', 'input_reference');
  }

  // 创建任务请求
  // 使用模型配置的 endpoint
  const createResponse = await fetch(`${apiBase}${model.endpoint || '/v1/videos'}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!createResponse.ok) {
    if (createResponse.status === 400) {
      throw new Error('提示词可能包含不安全或违规内容，未能处理。请修改后重试。');
    }
    if (createResponse.status === 500) {
      throw new Error('当前请求较多，暂时未能处理成功，请稍后重试。');
    }
    
    let errorMessage = `创建任务失败: HTTP ${createResponse.status}`;
    try {
      const errorData = await createResponse.json();
      errorMessage = errorData.error?.message || errorMessage;
    } catch (e) {
      const errorText = createResponse.text();
      if (errorText) errorMessage = errorText;
    }
    throw new Error(errorMessage);
  }

  const createData = await createResponse.json();
  const taskId = createData.id || createData.task_id;
  
  if (!taskId) {
    throw new Error('创建视频任务失败：未返回任务 ID');
  }

  console.log('📋 Sora-2 任务已创建，任务 ID:', taskId);

  // 轮询状态
  const maxPollingTime = 1200000; // 20 分钟
  const pollingInterval = 5000;
  const startTime = Date.now();
  
  let videoId: string | null = null;
  let videoUrlFromStatus: string | null = null;

  while (Date.now() - startTime < maxPollingTime) {
    await new Promise(resolve => setTimeout(resolve, pollingInterval));
    
    // BigModel 使用 /async-result/{id}，其他模型使用 /videos/{id}
    const statusEndpoint = model.providerId === 'bigmodel' 
      ? '/api/paas/v4/async-result' 
      : (model.endpoint || '/v1/videos');
    const statusResponse = await fetch(`${apiBase}${statusEndpoint}/${taskId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      console.warn('⚠️ 查询任务状态失败，继续重试...');
      continue;
    }

    const statusData = await statusResponse.json();
    // BigModel 使用 task_status，其他模型使用 status
    const status = statusData.task_status || statusData.status;
    const isBigModel = model.providerId === 'bigmodel';

    console.log(`🔄 ${model.id} 任务状态:`, status, '进度:', statusData.progress);

    if (status === 'completed' || status === 'succeeded' || status === 'SUCCESS') {
      // BigModel 返回 video_result 数组
      if (isBigModel && statusData.video_result && statusData.video_result.length > 0) {
        videoUrlFromStatus = statusData.video_result[0].url || statusData.video_result[0];
        console.log('✅ BigModel 视频 URL:', videoUrlFromStatus);
      } else {
        videoUrlFromStatus = statusData.video_url || statusData.videoUrl || null;
        if (statusData.id && statusData.id.startsWith('video_')) {
          videoId = statusData.id;
        } else {
          videoId = statusData.output_video || statusData.video_id || statusData.outputs?.[0]?.id || statusData.id;
        }
        if (!videoId && statusData.outputs && statusData.outputs.length > 0) {
          videoId = statusData.outputs[0];
        }
      }
      console.log('✅ 任务完成，视频:', videoUrlFromStatus || videoId);
      break;
    } else if (status === 'failed' || status === 'error' || status === 'FAIL') {
      throw new Error(`视频生成失败: ${statusData.error || statusData.message || '未知错误'}`);
    }
  }

  if (!videoId && !videoUrlFromStatus) {
    throw new Error('视频生成超时 (20分钟) 或未返回视频 ID');
  }

  if (videoUrlFromStatus) {
    const videoBase64 = await convertVideoUrlToBase64(videoUrlFromStatus);
    console.log('✅ 视频下载完成并转换为 base64');
    return videoBase64;
  }

  // 下载视频
  const maxDownloadRetries = 5;
  const downloadTimeout = 600000;

  for (let attempt = 1; attempt <= maxDownloadRetries; attempt++) {
    try {
      console.log(`📥 尝试下载视频 (第${attempt}/${maxDownloadRetries}次)...`);
      
      const downloadController = new AbortController();
      const downloadTimeoutId = setTimeout(() => downloadController.abort(), downloadTimeout);
      
      const downloadResponse = await fetch(`${apiBase}/v1/videos/${videoId}/content`, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: downloadController.signal,
      });
      
      clearTimeout(downloadTimeoutId);
      
      if (!downloadResponse.ok) {
        if (downloadResponse.status >= 500 && attempt < maxDownloadRetries) {
          console.warn(`⚠️ 下载失败 HTTP ${downloadResponse.status}，${5 * attempt}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
          continue;
        }
        throw new Error(`视频下载失败: HTTP ${downloadResponse.status}`);
      }
      
      const videoBlob = await downloadResponse.blob();
      
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (result && result.startsWith('data:')) {
            console.log('✅ 视频下载完成并转换为 base64');
            resolve(result);
          } else {
            reject(new Error('视频转换失败'));
          }
        };
        reader.onerror = () => reject(new Error('视频读取失败'));
        reader.readAsDataURL(videoBlob);
      });
    } catch (error: any) {
      if (attempt === maxDownloadRetries) {
        throw error;
      }
      console.warn(`⚠️ 下载出错: ${error.message}，重试中...`);
      await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
    }
  }

  throw new Error('视频下载失败：已达到最大重试次数');
};
```

#### 创建任务请求格式

```bash
# 文本生成视频
curl -X POST https://api.antsk.cn/v1/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=sora-2" \
  -F "prompt=生成一个日落海滩的视频" \
  -F "seconds=8" \
  -F "size=1280x720"

# 图片生成视频
curl -X POST https://api.antsk.cn/v1/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=sora-2" \
  -F "prompt=生成一个日落海滩的视频" \
  -F "seconds=8" \
  -F "size=1280x720" \
  -F "input_reference=@reference.png"

# 首尾帧模式 (Veo 3.1 Fast)
curl -X POST https://api.antsk.cn/v1/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=veo_3_1-fast" \
  -F "prompt=从起始帧到结束帧的视频" \
  -F "seconds=8" \
  -F "size=1280x720" \
  -F "input_reference[]=@start.png" \
  -F "input_reference[]=@end.png"
```

#### 查询任务状态

```bash
# 查询任务状态 (AntSK)
curl -X GET https://api.antsk.cn/v1/videos/{task_id} \
  -H "Authorization: Bearer YOUR_API_KEY"

# 查询任务状态 (BigModel)
curl -X GET https://open.bigmodel.cn/api/paas/v4/async-result/{task_id} \
  -H "Authorization: Bearer YOUR_BIGMODEL_API_KEY"
```

#### 查询任务状态响应格式

```json
{
  "id": "task_id",
  "status": "completed",
  "progress": 100,
  "video_url": "https://example.com/generated-video.mp4",
  "video_id": "video_xxx",
  "error": null
}
```

**BigModel 格式**:
```json
{
  "id": "task_id",
  "task_status": "SUCCESS",
  "progress": 100,
  "video_result": [
    {
      "url": "https://example.com/generated-video.mp4"
    }
  ]
}
```

#### 下载视频

```bash
# 下载视频
curl -X GET https://api.antsk.cn/v1/videos/{video_id}/content \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -o video.mp4
```

#### 状态码说明

| 状态码 | 含义 |
|--------|------|
| `pending` | 任务等待处理 |
| `processing` | 任务处理中 |
| `completed` / `succeeded` / `SUCCESS` | 任务完成 |
| `failed` / `error` / `FAIL` | 任务失败 |

---

## 🌐 开发环境代理配置

### Vite 代理配置

**文件位置**: `vite.config.ts`

```typescript
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // BigModel API 代理
          '/bigmodel': {
            target: 'https://open.bigmodel.cn',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/bigmodel/, ''),
          },
          // BigModel 文件下载代理 (aigc-files.bigmodel.cn)
          '/bigmodel-files': {
            target: 'https://aigc-files.bigmodel.cn',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/bigmodel-files\//, ''),
          },
          // UCloud 视频下载代理 (解决 CORS)
          '/video-proxy': {
            target: 'https://maas-watermark-prod-new.cn-wlcb.ufileos.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/video-proxy\//, ''),
          },
        },
      },
      plugins: [react(), imageProxyPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.ANTSK_API_KEY),
        'process.env.ANTSK_API_KEY': JSON.stringify(env.ANTSK_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
```

### 代理规则

| 代理路径 | 目标地址 | 用途 |
|---------|---------|------|
| `/bigmodel` | `https://open.bigmodel.cn` | BigModel API 请求 |
| `/bigmodel-files` | `https://aigc-files.bigmodel.cn` | BigModel 文件下载 |
| `/video-proxy` | `https://maas-watermark-prod-new.cn-wlcb.ufileos.com` | UCloud 视频下载 |

### 代理使用示例

```typescript
// 开发环境使用代理
const apiBase = import.meta.env.DEV ? '/bigmodel' : 'https://open.bigmodel.cn';

// BigModel 文件下载代理
const proxyUrl = url.includes('aigc-files.bigmodel.cn')
  ? `/bigmodel-files/${videoPath}`
  : url;

// UCloud 视频下载代理
const proxyUrl = url.includes('ufileos.com')
  ? `/video-proxy/${videoPath}`
  : url;
```

---

## 📊 模型注册中心

### 模型配置结构

**文件位置**: `types/model.ts`

```typescript
interface ModelDefinitionBase {
  id: string;                    // 唯一标识，如 'gpt-5.1'
  apiModel?: string;             // API 实际模型名（可与其他模型重复）
  name: string;                  // 显示名称，如 'GPT-5.1'
  type: ModelType;               // 模型类型：'chat' | 'image' | 'video'
  providerId: string;            // 提供商 ID
  endpoint?: string;             // API 端点（可覆盖默认）
  description?: string;          // 描述
  isBuiltIn: boolean;            // 是否内置（内置模型不可删除）
  isEnabled: boolean;             // 是否启用
  apiKey?: string;               // 模型专属 API Key（可选）
}
```

### 提供商配置结构

```typescript
interface ModelProvider {
  id: string;                    // 唯一标识
  name: string;                  // 显示名称
  baseUrl: string;               // API 基础 URL
  apiKey?: string;               // 独立 API Key（可选）
  isBuiltIn: boolean;            // 是否内置
  isDefault: boolean;            // 是否为默认提供商
}
```

### 内置提供商

**文件位置**: `types/model.ts`

```typescript
export const BUILTIN_PROVIDERS: ModelProvider[] = [
  {
    id: 'antsk',
    name: 'AntSK',
    baseUrl: 'https://api.antsk.cn',
    isBuiltIn: true,
    isDefault: true,
  },
  {
    id: 'bigmodel',
    name: 'BigModel',
    baseUrl: 'https://open.bigmodel.cn',
    isBuiltIn: true,
    isDefault: false,
  },
];
```

### 模型解析逻辑

**文件位置**: `services/ai/apiCore.ts`

```typescript
export const resolveModel = (type: 'chat' | 'image' | 'video', modelId?: string) => {
  if (modelId) {
    const normalizedModelId = modelId.toLowerCase();
    const lookupId = normalizedModelId === 'veo_3_1-fast-4k' ? 'veo_3_1-fast' : modelId;
    
    // 首先尝试通过 id 精确匹配
    const model = getModelById(lookupId);
    if (model && model.type === type) {
      logger.debug(LogCategory.AI, `[resolveModel] 通过 id 找到模型: ${model.id} ${model.name}`);
      return model;
    }
    
    // 然后尝试通过 apiModel 匹配
    const candidates = getModels(type).filter(m => m.apiModel === lookupId);
    if (candidates.length === 1) {
      logger.debug(LogCategory.AI, `[resolveModel] 通过 apiModel 找到模型: ${candidates[0].id} ${candidates[0].name}`);
      return candidates[0];
    }
    
    // 如果都找不到，记录警告并使用激活的模型
    logger.warn(LogCategory.AI, `[resolveModel] 未找到模型: ${modelId}, 将使用激活的模型`);
  }
  
  const activeModel = getActiveModel(type);
  if (activeModel) {
    logger.debug(LogCategory.AI, `[resolveModel] 使用激活的模型: ${activeModel.id} ${activeModel.name}`);
    return activeModel;
  }
  
  logger.warn(LogCategory.AI, '[resolveModel] 没有激活的模型，返回 undefined');
  return undefined;
};

export const resolveRequestModel = (type: 'chat' | 'image' | 'video', modelId?: string): string => {
  if (modelId && modelId.toLowerCase() === 'veo_3_1-fast-4k') {
    return modelId;
  }
  const resolved = resolveModel(type, modelId);
  return resolved?.apiModel || resolved?.id || modelId || '';
};
```

---

## 🔧 调试工具和技巧

### 1. 使用浏览器开发者工具

#### Network 标签页

1. 打开浏览器开发者工具 (F12)
2. 切换到 Network 标签页
3. 执行 API 调用
4. 查看请求和响应的详细信息

#### Console 标签页

```javascript
// 查看当前激活的模型
console.log('Chat Model:', getActiveChatModel());
console.log('Image Model:', getActiveImageModel());
console.log('Video Model:', getActiveVideoModel());

// 查看 API Key 来源
console.log('API Key Source:', getApiKeySource('gpt-5.1'));

// 查看所有模型
console.log('All Models:', getModels());
```

### 2. 使用 curl 测试 API

```bash
# 测试对话 API
curl -X POST https://api.antsk.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 0.7
  }' -v

# 测试图片生成 API
curl -X POST https://open.bigmodel.cn/api/paas/v4/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BIGMODEL_API_KEY" \
  -d '{
    "model": "cogview-4",
    "prompt": "一个美丽的日落海滩",
    "size": "1280x720"
  }' -v

# 测试视频生成 API (异步)
curl -X POST https://api.antsk.cn/v1/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=sora-2" \
  -F "prompt=生成一个日落海滩的视频" \
  -F "seconds=8" \
  -F "size=1280x720" -v
```

### 3. 常见错误排查

#### 400 Bad Request

**可能原因**:
- 模型 ID 不正确
- 请求参数格式错误
- 提示词包含不安全内容

**解决方法**:
```bash
# 检查模型 ID
curl -X POST https://api.antsk.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "仅返回1"}],
    "temperature": 0.1,
    "max_tokens": 5
  }'
```

#### 401 Unauthorized

**可能原因**:
- API Key 无效或过期
- API Key 格式错误

**解决方法**:
```bash
# 验证 API Key
curl -X POST https://api.antsk.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "仅返回1"}],
    "temperature": 0.1,
    "max_tokens": 5
  }'
```

#### 429 Too Many Requests

**可能原因**:
- 请求频率过高
- 配额不足

**解决方法**:
- 等待一段时间后重试
- 检查 API 配额
- 使用重试机制

#### 500 Internal Server Error

**可能原因**:
- 服务器内部错误
- 服务暂时不可用

**解决方法**:
- 等待一段时间后重试
- 联系服务提供商

### 4. 日志调试

**文件位置**: `services/logger.ts`

```typescript
import { logger, LogCategory } from '../logger';

// 调试日志
logger.debug(LogCategory.AI, 'Debug message');

// 信息日志
logger.info(LogCategory.AI, 'Info message');

// 警告日志
logger.warn(LogCategory.AI, 'Warning message');

// 错误日志
logger.error(LogCategory.AI, 'Error message', error);
```

### 5. 环境变量配置

**文件位置**: `.env`

```bash
# AntSK API Key
ANTSK_API_KEY=your_antsk_api_key

# BigModel API Key
BIGMODEL_API_KEY=your_bigmodel_api_key

# Gemini API Key
GEMINI_API_KEY=your_gemini_api_key
```

---

## 📚 相关文档

- [提示词功能全览](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/WL/提示词功能全览.md)
- [提示词系统专业化改进方案](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/WL/提示词系统专业化改进方案.md)
- [存储架构文档](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/WL/存储架构文档.md)
- [API 迁移报告](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/API_MIGRATION_REPORT.md)
- [OpenAI Sora 文档](file:///Users/wl/Desktop/job/learn/WL-AI-Director/docs/openai-sora.md)

---

## 🎯 总结

本文档详细说明了 WL-AI-Director 项目中所有大模型 API 的调用方式，包括：

1. **对话模型 API** - 支持 Chat Completions API，包括流式和非流式响应
2. **图片生成 API** - 支持 BigModel CogView 和 Gemini Image 两种 API
3. **视频生成 API** - 支持同步模式 (Veo) 和异步模式 (Sora / Veo 3.1 Fast)
4. **API Key 管理** - 三级优先级策略，灵活配置
5. **开发环境代理** - 解决 CORS 问题
6. **模型注册中心** - 统一管理所有模型配置
7. **调试工具和技巧** - 帮助快速定位和解决问题

希望这份文档能够帮助你更好地理解和调试大模型 API！

---

**文档版本**: v1.0
**最后更新**: 2026-03-16
**维护者**: WL-AI-Director Team
