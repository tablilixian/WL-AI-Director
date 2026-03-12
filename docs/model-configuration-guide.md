# 模型配置功能 — 使用说明与测试用例

> 文档版本: v2.0  
> 更新日期: 2026-03-12

---

## 1. 架构概览

### 1.1 核心设计

本项目采用**统一模型注册中心**架构，实现对话模型、图片模型、视频模型的独立厂商和模型配置。

```
┌─────────────────────────────────────────────────────────┐
│                    ModelConfigModal                      │
│  ┌──────────┬──────────┬──────────┬──────────┐          │
│  │ 全局配置 │ 对话模型 │ 图片模型 │ 视频模型 │          │
│  └──────────┴──────────┴──────────┴──────────┘          │
├─────────────────────────────────────────────────────────┤
│                   ModelRegistry                          │
│  providers[] │ models[] │ activeModels{chat,image,video} │
├─────────────────────────────────────────────────────────┤
│              Adapter Layer (适配器层)                     │
│  chatAdapter │ imageAdapter │ videoAdapter              │
├─────────────────────────────────────────────────────────┤
│              AI Service Layer (业务层)                    │
│  scriptService │ visualService │ videoService │ shotService │
└─────────────────────────────────────────────────────────┘
```

### 1.2 关键文件

| 文件 | 职责 |
|------|------|
| `types/model.ts` | 模型、厂商、注册中心的类型定义和内置模型数据 |
| `services/modelRegistry.ts` | 模型注册中心，CRUD 操作，API Key 管理 |
| `services/adapters/chatAdapter.ts` | 对话模型 API 适配 |
| `services/adapters/imageAdapter.ts` | 图片模型 API 适配 |
| `services/adapters/videoAdapter.ts` | 视频模型 API 适配 |
| `components/ModelConfig/index.tsx` | 模型配置弹窗入口 |
| `components/ModelConfig/ModelList.tsx` | 按类型的模型列表和厂商管理 |
| `components/ModelConfig/ModelCard.tsx` | 单个模型的配置卡片 |
| `components/ModelConfig/AddModelForm.tsx` | 添加自定义模型表单 |
| `components/ModelConfig/GlobalSettings.tsx` | 全局 API Key 配置 |
| `components/ModelSelector.tsx` | 内联模型选择器（各功能页面使用） |

### 1.3 已删除的旧文件

| 文件 | 说明 |
|------|------|
| `services/modelConfigService.ts` | 旧的模型配置服务，已完全迁移至 `modelRegistry.ts` |
| `components/ModelManagerTab.tsx` | 旧的模型管理组件，已被 `ModelConfig/*` 替代 |

---

## 2. 类型系统

### 2.1 核心类型

```typescript
// 模型类型
type ModelType = 'chat' | 'image' | 'video';

// 模型定义（统一基类）
interface ModelDefinitionBase {
  id: string;                    // 唯一标识
  apiModel?: string;             // API 实际模型名（可重复）
  name: string;                  // 显示名称
  type: ModelType;
  providerId: string;            // 所属厂商 ID
  endpoint?: string;             // API 端点
  description?: string;
  isBuiltIn: boolean;            // 是否内置
  isEnabled: boolean;
  apiKey?: string;               // 模型专属 API Key
}

// 对话模型定义
interface ChatModelDefinition extends ModelDefinitionBase {
  type: 'chat';
  params: ChatModelParams;       // temperature, maxTokens 等
}

// 图片模型定义
interface ImageModelDefinition extends ModelDefinitionBase {
  type: 'image';
  params: ImageModelParams;      // defaultAspectRatio, supportedAspectRatios
}

// 视频模型定义
interface VideoModelDefinition extends ModelDefinitionBase {
  type: 'video';
  params: VideoModelParams;      // mode, durations, aspectRatios
}

// 厂商定义
interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  isBuiltIn: boolean;
  isDefault: boolean;
}

// 注册中心状态
interface ModelRegistryState {
  providers: ModelProvider[];
  models: ModelDefinition[];
  activeModels: ActiveModels;    // { chat: string, image: string, video: string }
  globalApiKey?: string;
}
```

### 2.2 API Key 优先级

```
模型专属 API Key (最高优先级)
  ↓ 未设置
厂商级 API Key
  ↓ 未设置
全局 API Key (最低优先级)
```

### 2.3 内置厂商

| ID | 名称 | Base URL |
|----|------|----------|
| `antsk` | BigBanana API | `https://api.antsk.cn` |
| `bigmodel` | BigModel API | `https://open.bigmodel.cn` |

### 2.4 内置模型

**对话模型 (8 个)**:
- `gpt-5.1`, `gpt-5.2`, `gpt-41`, `claude-sonnet-4-5-20250929` (AntSK)
- `glm-4-plus`, `glm-4-air`, `glm-4-flash`, `glm-4` (BigModel)

**图片模型 (6 个)**:
- `gemini-3-pro-image-preview` (AntSK)
- `cogview-3-flash`, `cogview-4`, `cogview-3-plus`, `cogview-3` (BigModel)

**视频模型 (8 个)**:
- `veo`, `veo_3_1-fast`, `sora-2` (AntSK)
- `vidu2`, `viduq1`, `cogvideox-flash`, `cogvideox-3` (BigModel)

### 2.5 默认激活模型

```typescript
DEFAULT_ACTIVE_MODELS = {
  chat: 'gpt-5.1',
  image: 'gemini-3-pro-image-preview',
  video: 'sora-2',
}
```

---

## 3. 使用说明

### 3.1 打开模型配置

**方式一**: 在 Dashboard 页面点击「模型配置」按钮  
**方式二**: 在工作区侧边栏点击「模型配置」按钮  
**方式三**: 在剧本配置面板点击「模型配置」链接

### 3.2 全局配置 Tab

用于配置全局 API Key 和各厂商的 API Key。

**操作步骤**:
1. 在「选择 API 类型」下拉框中选择「全局 API Key」或特定厂商
2. 输入 API Key
3. 点击「验证并保存」

### 3.3 对话/图片/视频模型 Tab

每个 Tab 完全独立管理自己的模型和厂商。

#### 查看当前激活模型

Tab 顶部显示当前使用的模型和对应厂商:
```
✅ 当前使用: GPT-5.1 → BigBanana API (https://api.antsk.cn)
```

#### 厂商管理

**选择厂商**: 从下拉框中选择要管理的厂商  
**添加厂商**: 点击「添加厂商」按钮 → 填写名称、URL、API Key → 点击确认  
**删除厂商**: 选择自定义厂商 → 点击删除图标 → 确认删除  
**配置厂商 API Key**: 选择厂商 → 输入 API Key → 点击「保存」  
**验证 API Key**: 输入 API Key → 点击「验证 API Key」

> ⚠️ 内置厂商（BigBanana API、BigModel API）不可删除

#### 模型列表

模型按厂商分组展示，每组可折叠/展开。

**激活模型**: 点击「使用」按钮将该模型设为当前使用的模型  
**启用/禁用**: 点击切换开关，禁用的模型不会出现在选择器中  
**编辑参数**: 展开模型卡片可编辑:
- 对话模型: 温度、最大 Token
- 图片模型: 默认比例
- 视频模型: 默认比例、默认时长
- 通用: 模型专属 API Key

**删除模型**: 仅自定义模型可删除

#### 添加自定义模型

1. 点击「添加自定义模型」
2. 填写:
   - 模型名称（显示名称）
   - API 模型名（API 请求中的 model 参数）
   - 描述（可选）
   - API 端点（可选，留空使用默认）
   - API Key（可选，留空使用厂商/全局 Key）
3. 选择 API 提供商（已有或新建）
4. 对于视频模型，选择 API 模式（同步/异步）
5. 点击「添加模型」

### 3.4 在功能页面中切换模型

各功能页面（剧本生成、关键帧生成、视频生成）内有内联的模型选择器 `ModelSelector`：

- 选择器默认选中全局激活模型
- 切换仅在当前会话有效，不影响全局配置
- 需要永久更改默认模型，需在模型配置弹窗中操作

---

## 4. API Key 管理说明

### 4.1 三级 API Key

| 优先级 | 类型 | 作用范围 | 配置位置 |
|--------|------|----------|----------|
| 1 (最高) | 模型专属 API Key | 仅该模型 | 模型卡片展开配置 |
| 2 | 厂商 API Key | 该厂商下所有模型 | 厂商管理区域 |
| 3 (最低) | 全局 API Key | 所有模型 | 全局配置 Tab |

### 4.2 存储方式

所有配置保存在浏览器 `localStorage` 中，不会上传到服务器。

存储键:
- `bigbanana_model_registry` — 模型注册中心完整状态
- `antsk_api_key` — 全局 API Key（兼容旧版）

---

## 5. 测试用例

### 5.1 模型配置弹窗基础功能

| # | 测试用例 | 前置条件 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|----------|
| 1.1 | 打开模型配置弹窗 | 已登录 | 点击 Dashboard 上的「模型配置」按钮 | 弹窗显示，4 个 Tab 可见 |
| 1.2 | Tab 切换 | 弹窗已打开 | 分别点击 4 个 Tab | 每个 Tab 的内容正确显示 |
| 1.3 | 关闭弹窗 | 弹窗已打开 | 点击「×」或点击遮罩层 | 弹窗关闭 |
| 1.4 | 关闭弹窗 | 弹窗已打开 | 按 Escape 键 | 弹窗关闭 |

### 5.2 全局配置 Tab

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 2.1 | 配置全局 API Key | 选择「全局 API Key」→ 输入有效 Key → 点击「验证并保存」 | 显示「验证成功！API Key 已保存」 |
| 2.2 | 配置全局 API Key - 无效 Key | 选择「全局 API Key」→ 输入无效 Key → 点击「验证并保存」 | 显示验证失败信息 |
| 2.3 | 配置厂商 API Key | 选择 BigModel → 输入有效 Key → 点击「验证并保存」 | Key 保存成功 |
| 2.4 | 清除 API Key | 已配置 Key → 点击「清除 Key」 | Key 被清空，状态重置 |
| 2.5 | 未输入 Key 时验证 | Key 为空 → 点击「验证并保存」 | 按钮禁用，无操作 |

### 5.3 对话模型 Tab

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 3.1 | 查看激活模型 | 打开对话模型 Tab | 顶部显示当前使用的模型名称和厂商 |
| 3.2 | 切换激活模型 | 选择一个非激活模型 → 点击「使用」 | 激活标记移动到该模型，显示成功提示 |
| 3.3 | 展开/收起厂商分组 | 点击厂商分组头部 | 分组展开/收起，切换箭头方向 |
| 3.4 | 编辑模型参数 | 展开一个模型卡片 → 修改温度 | 参数保存成功 |
| 3.5 | 启用/禁用模型 | 点击模型的启用/禁用开关 | 模型状态切换，禁用模型变灰 |
| 3.6 | 添加自定义模型 | 点击「添加自定义模型」→ 填写表单 → 提交 | 新模型出现在列表中 |
| 3.7 | 添加模型 - 必填项缺失 | 不填写模型名称和 API 模型名 → 提交 | 显示警告提示 |
| 3.8 | 删除自定义模型 | 点击自定义模型的删除按钮 → 确认 | 模型被删除，成功提示 |
| 3.9 | 删除内置模型 | 尝试删除内置模型 | 无删除按钮（内置模型不可删除） |
| 3.10 | 模型专属 API Key | 展开模型 → 输入 API Key | Key 保存到该模型 |
| 3.11 | 切换厂商 | 选择不同厂商 | 厂商 API Key 输入框更新 |

### 5.4 图片模型 Tab

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 4.1 | 查看图片模型列表 | 打开图片模型 Tab | 显示所有图片模型，按厂商分组 |
| 4.2 | 切换激活图片模型 | 选择另一个图片模型 → 点击「使用」 | 激活状态切换 |
| 4.3 | 修改默认比例 | 展开模型 → 点击「竖屏」按钮 | 默认比例更新为 9:16 |
| 4.4 | 添加自定义图片模型 | 添加一个自定义图片模型 | 模型注册成功 |

### 5.5 视频模型 Tab

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 5.1 | 查看视频模型列表 | 打开视频模型 Tab | 显示所有视频模型，按厂商分组 |
| 5.2 | 切换激活视频模型 | 选择另一个视频模型 → 点击「使用」 | 激活状态切换 |
| 5.3 | 修改默认比例和时长 | 展开模型 → 修改比例和时长 | 参数保存成功 |
| 5.4 | 添加同步模式视频模型 | 添加自定义模型 → 选择「同步模式」 | 模型注册为同步模式 |
| 5.5 | 添加异步模式视频模型 | 添加自定义模型 → 选择「异步模式」 | 模型注册为异步模式 |

### 5.6 厂商管理

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 6.1 | 添加新厂商 | 点击「添加厂商」→ 填写名称和 URL → 提交 | 厂商出现在下拉列表 |
| 6.2 | 添加厂商 - 必填项缺失 | 不填写名称或 URL → 提交 | 显示警告提示 |
| 6.3 | 删除自定义厂商 | 选择自定义厂商 → 点击删除 → 确认 | 厂商被删除，关联模型也被删除 |
| 6.4 | 删除内置厂商 | 尝试删除 BigBanana API | 无删除按钮 |
| 6.5 | 切换厂商 API Key | 选择厂商 → 输入新 Key → 保存 | Key 更新成功 |
| 6.6 | 厂商下拉列表标识 | 查看厂商下拉框 | 内置厂商显示 🏢，自定义厂商显示 🔧 |

### 5.7 ModelSelector 内联选择器

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 7.1 | 默认选中全局激活模型 | 打开剧本配置页面 | 模型选择器默认选中全局激活的对话模型 |
| 7.2 | 临时切换模型 | 在选择器中选择其他模型 | 选择器显示新模型，当前会话生效 |
| 7.3 | 刷新页面恢复默认 | 切换模型后刷新页面 | 选择器恢复为全局激活模型 |
| 7.4 | 禁用模型不可选 | 在模型配置中禁用某模型 | 该模型不在选择器列表中出现 |

### 5.8 适配器层

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 8.1 | 对话模型 API 调用 | 使用激活的对话模型生成剧本 | 使用正确的 API URL 和 API Key |
| 8.2 | 图片模型 API 调用 | 使用激活的图片模型生成图片 | 使用正确的 API URL 和 API Key |
| 8.3 | 视频模型 API 调用 | 使用激活的视频模型生成视频 | 使用正确的 API URL 和 API Key |
| 8.4 | API Key 优先级验证 | 设置模型专属 Key > 厂商 Key > 全局 Key | API 调用使用模型专属 Key |
| 8.5 | 自定义厂商模型调用 | 添加自定义厂商和模型 → 调用 API | 请求发送到自定义厂商的 URL |

### 5.9 数据持久化

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 9.1 | 配置持久化 | 配置模型后关闭浏览器重新打开 | 所有配置保持 |
| 9.2 | 激活模型持久化 | 切换激活模型后刷新页面 | 激活模型保持 |
| 9.3 | 厂商配置持久化 | 添加自定义厂商后刷新页面 | 厂商配置保持 |

### 5.10 边界情况

| # | 测试用例 | 操作步骤 | 预期结果 |
|---|----------|----------|----------|
| 10.1 | 删除激活模型的厂商 | 删除当前激活模型所属的自定义厂商 | 自动切换到同类型第一个可用模型 |
| 10.2 | 禁用所有对话模型 | 禁用所有对话模型 | 默认模型选择器可能无选项，需处理 |
| 10.3 | API Key 验证超时 | 输入可能超时的 Key → 验证 | 显示超时错误，不阻塞 UI |
| 10.4 | 重复厂商 URL | 添加与现有厂商相同 URL 的厂商 | 返回已有厂商，不重复创建 |

---

## 6. 开发者指南

### 6.1 如何添加新模型

在 `types/model.ts` 中添加模型定义:

```typescript
// 在 BUILTIN_CHAT_MODELS / BUILTIN_IMAGE_MODELS / BUILTIN_VIDEO_MODELS 数组中添加
{
  id: 'my-new-model',
  name: 'My New Model',
  type: 'chat',
  providerId: 'antsk',
  apiModel: 'my-new-model',
  endpoint: '/v1/chat/completions',
  description: '这是一个新模型',
  isBuiltIn: true,
  isEnabled: true,
  params: { ...DEFAULT_CHAT_PARAMS },
}
```

### 6.2 如何添加新厂商

在 `types/model.ts` 中的 `BUILTIN_PROVIDERS` 添加:

```typescript
{
  id: 'my-provider',
  name: 'My Provider API',
  baseUrl: 'https://api.myprovider.com',
  isBuiltIn: true,
  isDefault: false,
}
```

然后为该厂商添加模型，设置 `providerId: 'my-provider'`。

### 6.3 如何在代码中使用模型注册中心

```typescript
import {
  getActiveChatModel,
  getActiveImageModel,
  getActiveVideoModel,
  getApiKeyForModel,
  getApiBaseUrlForModel,
  getModels,
  getProviders,
} from '../services/modelRegistry';

// 获取当前激活的模型
const chatModel = getActiveChatModel();
const imageModel = getActiveImageModel();
const videoModel = getActiveVideoModel();

// 获取模型的 API Key（自动使用三级优先级）
const apiKey = getApiKeyForModel(chatModel.id);

// 获取模型的 API 基础 URL
const baseUrl = getApiBaseUrlForModel(chatModel.id);

// 获取所有启用的对话模型
const chatModels = getModels('chat').filter(m => m.isEnabled);
```

### 6.4 适配器使用模式

适配器自动处理不同厂商的 API 差异:

```typescript
// 调用对话模型（自动适配）
import { callChatApi } from '../services/adapters/chatAdapter';
const response = await callChatApi({
  prompt: 'Hello',
  responseFormat: 'json',
});

// 调用图片模型（自动适配 Gemini/CogView）
import { generateImage } from '../services/aiService';
const imageUrl = await generateImage('A cat', { aspectRatio: '16:9' });

// 调用视频模型（自动适配 Veo/Sora/BigModel）
import { generateVideo } from '../services/aiService';
const videoUrl = await generateVideo({ prompt: 'A scene', startImage: '...' });
```

### 6.5 localStorage 数据结构

```json
{
  "bigbanana_model_registry": {
    "providers": [
      {
        "id": "antsk",
        "name": "BigBanana API (api.antsk.cn)",
        "baseUrl": "https://api.antsk.cn",
        "apiKey": "optional-provider-key",
        "isBuiltIn": true,
        "isDefault": true
      }
    ],
    "models": [
      {
        "id": "gpt-5.1",
        "name": "GPT-5.1",
        "type": "chat",
        "providerId": "antsk",
        "apiModel": "gpt-5.1",
        "isBuiltIn": true,
        "isEnabled": true,
        "params": {
          "temperature": 0.7
        }
      }
    ],
    "activeModels": {
      "chat": "gpt-5.1",
      "image": "gemini-3-pro-image-preview",
      "video": "sora-2"
    },
    "globalApiKey": "your-global-api-key"
  }
}
```

---

## 7. 变更日志

### v2.0 (2026-03-12)

**架构重构**:
- ✅ 删除旧的 `modelConfigService.ts` (409 行) 和 `ModelManagerTab.tsx` (438 行)
- ✅ 统一使用 `modelRegistry.ts` 作为唯一的模型配置服务
- ✅ 清理 `types.ts` 中的旧模型配置类型，迁移到 `types/model.ts`
- ✅ `Shot.videoModel` 类型从硬编码字符串联合类型改为 `string`

**功能增强**:
- ✅ 每个模型类型 Tab 支持独立添加/删除厂商
- ✅ 厂商下拉框添加内置/自定义厂商的视觉标识（🏢/🔧）
- ✅ 添加厂商时支持同时设置 API Key
- ✅ 删除厂商时自动删除关联模型，并处理激活模型切换

**开发者体验**:
- ✅ TypeScript 编译无新增错误
- ✅ 生产构建通过
- ✅ 完整的使用说明和测试用例文档

---

## 8. 常见问题

**Q: 为什么在功能页面切换模型后，刷新页面又恢复了原来的模型？**  
A: ModelSelector 仅在当前会话临时切换，不影响全局配置。如需永久更改，需在模型配置弹窗中操作。

**Q: 添加自定义模型时，"API 模型名"和"模型名称"有什么区别？**  
A: "模型名称"是显示名称（如 "GPT-4 Turbo"），"API 模型名"是 API 请求中的 model 参数（如 "gpt-4-turbo"）。两者可以不同。

**Q: 一个模型可以同时有模型专属 API Key 和厂商 API Key 吗？**  
A: 可以，但模型专属 Key 优先级更高，会覆盖厂商 Key。

**Q: 删除厂商后，该厂商下的模型会怎样？**  
A: 该厂商下的所有模型都会被删除。如果删除的是当前激活模型的厂商，系统会自动切换到同类型第一个可用模型。

**Q: 内置模型可以修改参数吗？**  
A: 可以。内置模型支持修改 `isEnabled` 和 `params`，但不支持修改其他属性（如名称、厂商、端点等）。

**Q: 可以添加与内置模型相同 API 模型名的自定义模型吗？**  
A: 可以。`apiModel` 字段允许重复，只有内部 `id` 必须唯一。
