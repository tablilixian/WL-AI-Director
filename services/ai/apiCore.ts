/**
 * API 基础设施层
 * 统一的 API 调用、重试、错误处理、JSON 清理等工具函数
 */

import { AspectRatio } from '../../types';
import { logger, LogCategory } from '../logger';
import {
  getGlobalApiKey as getRegistryApiKey,
  setGlobalApiKey as setRegistryApiKey,
  getApiBaseUrlForModel,
  getApiKeyForModel,
  getApiKeySource,
  validateApiKey,
  getModelById,
  getModels,
  getActiveModel,
  getActiveChatModel,
  getActiveVideoModel,
  getActiveImageModel,
  isLocalProvider,
} from '../modelRegistry';
import { VIDEO_SORA_SIZE } from '../../config/sizeConfig';
import { withConcurrencyLimit } from './concurrencyLimiter';

/**
 * LLM 输出 token 上限档位。
 * - MAX_TOKENS_LONG：长 JSON 数组 / 长文本（分镜、剧本解析、批量视觉提示词等），8192 可覆盖 3000 字剧本级别。
 * - MAX_TOKENS_SHORT：镜头级 / 单条生成（关键帧优化、动作、角色视觉 prompt 等），4096 充裕。
 * 所有 chatCompletion 调用点的 max_tokens 都应使用这两个常量，避免再次散落硬编码（尤其禁止 1024 这类易截断值）。
 */
export const MAX_TOKENS_LONG = 8192;
export const MAX_TOKENS_SHORT = 4096;

/**
 * 检查是否为 BigModel 模型
 */
const isBigModelModel = (modelId: string): boolean => {
  return (
    modelId.startsWith('glm-') ||
    modelId.startsWith('cogview') ||
    modelId.startsWith('vidu') ||
    modelId.startsWith('cogvideo')
  );
};

/**
 * 检查是否为 BigModel 视频模型
 */
const isBigModelVideoModel = (modelId: string): boolean => {
  return (
    modelId.startsWith('vidu') || modelId.startsWith('cogvideo') || modelId.startsWith('cogvideox')
  );
};

/**
 * 检查是否为 WLDramaLLM 模型
 */
const isWLDramaLLMModel = (modelId: string): boolean => {
  return modelId.startsWith('wldramallm-');
};

/**
 * 开发环境获取 API Base URL（使用代理避免 CORS）
 * 注意：BigModel 视频模型使用视频代理，其他 BigModel 模型使用普通代理
 */
const getDevApiBaseUrl = (modelId: string): string => {
  if (isBigModelVideoModel(modelId)) {
    return '/bigmodel';
  }
  if (isBigModelModel(modelId)) {
    return '/bigmodel';
  }
  if (isWLDramaLLMModel(modelId)) {
    return '/wldramallm';
  }
  return getApiBaseUrlForModel(modelId);
};

// ============================================
// 脚本日志回调（供各服务模块使用）
// ============================================

type ScriptLogCallback = (message: string) => void;

let scriptLogCallback: ScriptLogCallback | null = null;

export const setScriptLogCallback = (callback: ScriptLogCallback) => {
  scriptLogCallback = callback;
};

export const clearScriptLogCallback = () => {
  scriptLogCallback = null;
};

export const logScriptProgress = (message: string) => {
  if (scriptLogCallback) {
    scriptLogCallback(message);
  }
};

// ============================================
// API Key 管理
// ============================================

/**
 * API Key 错误类
 */
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

/**
 * 设置全局API密钥
 */
export const setGlobalApiKey = (key: string) => {
  setRegistryApiKey(key);
};

/** 默认 API base URL（向后兼容） */
const DEFAULT_API_BASE = 'https://open.bigmodel.cn';

/**
 * 解析模型：根据 type 和可选 modelId 找到对应的模型配置
 */
export const resolveModel = (type: 'chat' | 'image' | 'video', modelId?: string) => {
  if (modelId) {
    const normalizedModelId = modelId.toLowerCase();
    const lookupId = normalizedModelId;

    // 首先尝试通过 id 精确匹配
    const model = getModelById(lookupId);
    if (model && model.type === type) {
      logger.debug(LogCategory.AI, `[resolveModel] 通过 id 找到模型: ${model.id} ${model.name}`);
      return model;
    }

    // 然后尝试通过 apiModel 匹配
    const candidates = getModels(type).filter((m) => m.apiModel === lookupId);
    if (candidates.length === 1) {
      logger.debug(
        LogCategory.AI,
        `[resolveModel] 通过 apiModel 找到模型: ${candidates[0].id} ${candidates[0].name}`,
      );
      return candidates[0];
    }

    // 如果都找不到，记录警告并使用激活的模型
    logger.warn(LogCategory.AI, `[resolveModel] 未找到模型: ${modelId}, 将使用激活的模型`);
  }

  const activeModel = getActiveModel(type);
  if (activeModel) {
    logger.debug(
      LogCategory.AI,
      `[resolveModel] 使用激活的模型: ${activeModel.id} ${activeModel.name}`,
    );
    return activeModel;
  }

  logger.warn(LogCategory.AI, '[resolveModel] 没有激活的模型，返回 undefined');
  return undefined;
};

/**
 * 解析请求用的模型名称（apiModel 字段）
 */
export const resolveRequestModel = (type: 'chat' | 'image' | 'video', modelId?: string): string => {
  const resolved = resolveModel(type, modelId);
  return resolved?.apiModel || resolved?.id || modelId || '';
};

/**
 * 检查并返回 API Key
 * @throws {ApiKeyError} 如果 API Key 缺失
 */
export const checkApiKey = (
  type: 'chat' | 'image' | 'video' = 'chat',
  modelId?: string,
): string => {
  const resolvedModel = resolveModel(type, modelId);
  logger.debug(
    LogCategory.AI,
    `[checkApiKey] type=${type}, modelId=${modelId}, resolvedModel=${resolvedModel?.id} ${resolvedModel?.providerId}`,
  );

  if (resolvedModel) {
    // 本地部署的模型（如 Ollama）无需 API Key
    if (
      isLocalProvider(resolvedModel.providerId) ||
      resolvedModel.providerId === 'wldrama' ||
      resolvedModel.providerId === 'wldramallm'
    ) {
      return '';
    }

    const modelApiKey = getApiKeyForModel(resolvedModel.id);
    const apiKeySource = getApiKeySource(resolvedModel.id);
    logger.debug(
      LogCategory.AI,
      `[checkApiKey] modelApiKey found: ${!!modelApiKey}, source: ${apiKeySource}`,
    );

    if (modelApiKey) return modelApiKey;

    // 如果没有找到 API Key，抛出更详细的错误
    const validation = validateApiKey(type, resolvedModel.id);
    if (!validation.isValid) {
      throw new ApiKeyError(`${validation.message} (来源: ${validation.source})`);
    }
  }

  const registryKey = getRegistryApiKey();
  logger.debug(LogCategory.AI, `[checkApiKey] registryKey found: ${!!registryKey}`);
  if (registryKey) return registryKey;

  throw new ApiKeyError('API Key 缺失，请在模型配置中设置 API Key。');
};

/**
 * 获取 API 基础 URL
 */
export const getApiBase = (type: 'chat' | 'image' | 'video' = 'chat', modelId?: string): string => {
  try {
    const resolvedModel = resolveModel(type, modelId);
    if (resolvedModel) {
      // 使用开发环境代理
      return getDevApiBaseUrl(resolvedModel.id);
    }
    return DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
};

/**
 * 获取当前激活的对话模型名称
 */
export const getActiveChatModelName = (): string => {
  try {
    const model = getActiveChatModel();
    return model?.apiModel || model?.id || getDefaultChatModelId();
  } catch {
    return getDefaultChatModelId();
  }
};

/**
 * 获取默认的对话模型ID（用于后备）
 */
export const getDefaultChatModelId = (): string => {
  try {
    const model = getActiveChatModel();
    if (model?.id) return model.id;

    // 如果没有激活模型，返回第一个可用的模型
    const models = getModels('chat');
    const enabledModel = models.find((m) => m.isEnabled);
    return enabledModel?.id || models[0]?.id || 'glm-4-flash';
  } catch {
    return 'glm-4-flash';
  }
};

// Re-export modelRegistry helpers that other modules may need
export { getActiveModel, getActiveChatModel, getActiveVideoModel, getActiveImageModel };

// ============================================
// 通用工具函数
// ============================================

/**
 * 统一从 unknown 类型的错误中提取可读信息（catch 块中 error 默认是 unknown）。
 */
export const getErrorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * 重试操作辅助函数，用于处理429限流、超时、服务器错误等临时性错误
 * 采用指数退避策略
 */
export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000,
): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (e: unknown) {
      lastError = e;
      const err = e as { status?: number; code?: number; message?: string };
      const message = err.message ?? '';
      const isRetryableError =
        err.status === 429 ||
        err.code === 429 ||
        err.status === 504 ||
        message.includes('429') ||
        message.includes('quota') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.includes('超时') ||
        message.includes('timeout') ||
        message.includes('Gateway Timeout') ||
        message.includes('504') ||
        message.includes('ECONNRESET') ||
        message.includes('ETIMEDOUT') ||
        message.includes('network') ||
        message.includes('openai_error') ||
        (typeof err.status === 'number' && err.status >= 500);

      if (isRetryableError && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        logger.warn(
          LogCategory.AI,
          `请求失败，正在重试... (第 ${i + 1}/${maxRetries} 次，${delay}ms后重试) ${message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
};

/**
 * 清理AI返回的JSON字符串，移除markdown代码块标记
 */
export const cleanJsonString = (str: string): string => {
  if (!str) return '{}';
  let cleaned = str.trim();
  // Remove markdown code block markers
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/```\s*$/, '');
  // Try to find a valid JSON object in the response
  // This handles cases where AI returns text before/after the JSON
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  return cleaned.trim();
};

/**
 * 字符级遍历：转义字符串值内部的原始换行/制表符，并修正未转义双引号。
 * 通过结构状态机区分三种引号语义，避免把「键名闭合引号」误判为「值内嵌引号」：
 *  - 当前字符串是 key  → 遇到的 " 一律视为键名闭合
 *  - 当前字符串是 value → 向前看：若后面紧跟 , } ] 视为值闭合，否则视为内嵌引号转义
 */
const escapeStringInternals = (s: string): string => {
  let out = '';
  let inString = false;
  let currentStringType: 'key' | 'value' | null = null;
  // 下一个顶层 " 打开的是 key 还是 value（由结构上下文决定）
  let mode: 'key' | 'value' = 'key';
  const containerStack: Array<'obj' | 'arr'> = [];
  // 与 containerStack 平行：栈顶标记「当前容器内是否已出现至少一个元素」。
  // 用于修复 LLM 漏写数组分隔符（如 [{"a":1}{"b":2}]），仅在 arr 容器内、元素之后补 ','，
  // 绝不动 obj 容器（对象靠 key:"..." 区分，补逗号会破坏结构）。
  const expectComma: boolean[] = [];
  let escaped = false;

  const topContainer = (): 'obj' | 'arr' | null =>
    containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
  // 在「容器内已存在元素、且之后出现新值起点」时补一个 ','，并标记已有元素。
  // 仅在数组(arr)容器内补逗号：对象(obj)靠 key:"..." 区分元素，补逗号会破坏结构。
  const markElementStart = (): void => {
    if (expectComma.length === 0) return;
    const i = expectComma.length - 1;
    if (expectComma[i] && topContainer() === 'arr') out += ',';
    expectComma[i] = true;
  };

  const modeAfterContainer = (): 'key' | 'value' => (topContainer() === 'obj' ? 'key' : 'value');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        markElementStart();
        inString = true;
        currentStringType = mode;
        out += ch;
      } else if (currentStringType === 'key') {
        // 键名闭合：总是真正的闭合
        inString = false;
        currentStringType = null;
        mode = 'value'; // 键名之后是 : value
        out += ch;
      } else {
        // 值字符串：判断是否真正闭合。
        // 跳过空白后，若遇到 , } ]（结构分隔）或 " [ { 数字/字面量（下一个值起点），
        // 即视为当前字符串已自然闭合（覆盖 "a" "b" 漏逗号、字符串后跟新值等）。
        // 否则（后面紧跟普通字符）视为字符串内未转义引号 → 转义，避免过早闭合。
        const rest = s.slice(i + 1);
        if (/^\s*([,}\]]|"|\[|\{|[-0-9]|t|f|n)/.test(rest)) {
          inString = false;
          currentStringType = null;
          mode = modeAfterContainer();
          out += ch;
        } else {
          // 值内部的未转义引号 → 转义，避免字符串过早闭合
          out += '\\"';
        }
      }
      continue;
    }
    if (inString) {
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
    } else {
      // 结构令牌推动 mode 与容器栈
      if (ch === '{') {
        markElementStart();
        containerStack.push('obj');
        expectComma.push(false);
        mode = 'key';
      } else if (ch === '[') {
        markElementStart();
        containerStack.push('arr');
        expectComma.push(false);
        mode = 'value';
      } else if (ch === '}') {
        containerStack.pop();
        expectComma.pop();
        mode = modeAfterContainer();
      } else if (ch === ']') {
        containerStack.pop();
        expectComma.pop();
        mode = modeAfterContainer();
      } else if (ch === ':') {
        mode = 'value';
      } else if (ch === ',') {
        mode = modeAfterContainer();
      } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
        // 数字值起点（覆盖整数/小数/负数/科学计数法），补缺失的数组分隔符
        markElementStart();
      } else if (
        (ch === 't' || ch === 'f' || ch === 'n') &&
        /^(true|false|null)/.test(s.slice(i))
      ) {
        // 字面量值起点（true/false/null），补缺失的数组分隔符
        markElementStart();
      }
    }
    out += ch;
  }
  return out;
};

/**
 * 在 JSON.parse 失败时对「接近合法」的 LLM JSON 做尽力修复。
 * 仅作为兜底，不改动正常解析路径。覆盖四类最常见缺陷：
 *  1) 字符串值内部的未转义换行/制表符（V8 报 Bad control character）
 *  2) 字符串值内部的未转义双引号（导致字符串过早闭合 → Expected ',' or '}'）
 *  3) 对象/数组末尾的多余逗号
 *  4) 数组元素之间漏写的逗号（如 [{"a":1}{"b":2}] → Expected ',' or ']'）
 */
export const repairBrokenJson = (raw: string): string => {
  if (!raw) return '{}';
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  // 截取最外层对象或数组
  const objStart = s.indexOf('{');
  const arrStart = s.indexOf('[');
  let start = -1;
  let endChar = '';
  if (objStart === -1 && arrStart === -1) return s;
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    start = objStart;
    endChar = '}';
  } else {
    start = arrStart;
    endChar = ']';
  }
  const end = s.lastIndexOf(endChar);
  if (start === -1 || end === -1 || end < start) return s;
  s = s.slice(start, end + 1);

  s = escapeStringInternals(s);
  // 去除对象/数组末尾的多余逗号
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
};

/**
 * 健壮解析 LLM 返回的 JSON：三级兜底，正常路径零影响。
 *  1) 直接 JSON.parse(原始串)
 *  2) JSON.parse(cleanJsonString(原始串))  —— 去 markdown 围栏、截 {…}
 *  3) JSON.parse(repairBrokenJson(原始串)) —— 修复未转义引号/换行/尾随逗号/数组漏逗号
 * 全部失败才抛出带上下文的错误。合法 JSON 走第 1 步，行为与 JSON.parse 完全一致。
 */
export const parseLlmJson = <T = unknown>(raw: string, context?: string): T => {
  const tryParse = (s: string): T => JSON.parse(s) as T;
  try {
    return tryParse(raw);
  } catch {
    try {
      return tryParse(cleanJsonString(raw));
    } catch {
      try {
        return tryParse(repairBrokenJson(raw));
      } catch (e) {
        throw new Error(
          `LLM JSON 解析失败${context ? ` (${context})` : ''}: ${(e as Error).message}`,
        );
      }
    }
  }
};

/**
 * 从 HTTP 错误响应中解析错误信息，返回带 status 属性的 Error
 */
export const parseHttpError = async (response: Response): Promise<Error> => {
  const httpStatus = response.status;
  let errorMessage = `HTTP错误: ${httpStatus}`;
  try {
    const errorData = await response.json();
    errorMessage = errorData.error?.message || errorMessage;
  } catch {
    try {
      const errorText = await response.text();
      if (errorText) errorMessage = errorText;
    } catch {
      // ignore
    }
  }
  const err = new Error(errorMessage) as Error & { status: number };
  err.status = httpStatus;
  return err;
};

// ============================================
// Chat Completion API
// ============================================

interface ChatCompletionRequest {
  model: string;
  messages: { role: string; content: string }[];
  // 结构化输出（json_object）模式下按阿里云百炼官方建议不设置 max_tokens，
  // 否则 JSON 可能在输出中途被截断 → 改为可选。
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
  stream?: boolean;
}

/**
 * 调用聊天完成API（非流式）
 */
export const chatCompletion = async (
  prompt: string,
  model?: string,
  temperature: number = 0.7,
  maxTokens: number = MAX_TOKENS_LONG,
  responseFormat?: 'json_object',
  timeout: number = 600000,
  systemPrompt?: string,
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  const apiKey = checkApiKey('chat', resolvedModel);
  const requestModel = resolveRequestModel('chat', resolvedModel);

  const resolved = resolveModel('chat', resolvedModel);

  // 七层提示词架构：systemPrompt 承载不变约束层(L1+L5+L6+L7)，
  // 与每次变化的 user prompt 分离，降低 token 消耗并提升稳定性。
  const messages: { role: 'system' | 'user'; content: string }[] = systemPrompt
    ? [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ]
    : [{ role: 'user', content: prompt }];

  const requestBody: ChatCompletionRequest = {
    model: requestModel,
    messages,
  };

  const wantsJson = responseFormat === 'json_object';
  // wldramallm（Drama backend，localhost:3005）实测会拒绝 response_format 参数（返回 400），
  // 且不接受 temperature——因此该 provider 永远不转发这两个字段，只能靠调用方自行容错解析。
  // 其余 provider 开启 json_object 模式时，按阿里云百炼官方建议启用结构化输出，并省略
  // max_tokens 以避免 JSON 被截断（结构化输出仅在此时真正生效）。
  const structuredOutputActive = wantsJson && resolved?.providerId !== 'wldramallm';

  if (resolved?.providerId !== 'wldramallm') {
    requestBody.temperature = temperature;
  }
  if (structuredOutputActive) {
    requestBody.response_format = { type: 'json_object' };
  }
  if (!structuredOutputActive) {
    requestBody.max_tokens = maxTokens;
  }
  const maxConcurrency =
    (resolved?.type === 'chat' ? resolved.params.maxConcurrency : undefined) ?? 5;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return withConcurrencyLimit(resolvedModel, maxConcurrency, async () => {
    try {
      const apiBase = getApiBase('chat', resolvedModel);
      const endpoint = resolved?.endpoint || '/v1/chat/completions';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      if (resolved?.providerId === 'wldramallm') {
        logger.info(LogCategory.AI, '[WLDramaLLM Request]', JSON.stringify(requestBody, null, 2));
      }

      const response = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await parseHttpError(response);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const err = error as { name?: string };
      if (err.name === 'AbortError') {
        throw new Error(`请求超时（${timeout}ms）`);
      }
      throw error;
    }
  });
};

/**
 * 调用聊天完成API（SSE流式模式）
 */
export const chatCompletionStream = async (
  prompt: string,
  model?: string,
  temperature: number = 0.7,
  maxTokens: number = MAX_TOKENS_LONG,
  responseFormat: 'json_object' | undefined = undefined,
  timeout: number = 600000,
  onDelta?: (delta: string) => void,
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  const apiKey = checkApiKey('chat', resolvedModel);
  const requestModel = resolveRequestModel('chat', resolvedModel);
  const resolved = resolveModel('chat', resolvedModel);
  const requestBody: ChatCompletionRequest = {
    model: requestModel,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  };

  const wantsJson = responseFormat === 'json_object';
  // 同 chatCompletion：wldramallm 拒绝 response_format（400）且不接受 temperature；
  // 仅在其余 provider 开启 json_object 时启用结构化输出并省略 max_tokens。
  const structuredOutputActive = wantsJson && resolved?.providerId !== 'wldramallm';

  if (resolved?.providerId !== 'wldramallm') {
    requestBody.temperature = temperature;
  }
  if (structuredOutputActive) {
    requestBody.response_format = { type: 'json_object' };
  }
  if (!structuredOutputActive) {
    requestBody.max_tokens = maxTokens;
  }
  const maxConcurrency =
    (resolved?.type === 'chat' ? resolved.params.maxConcurrency : undefined) ?? 5;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return withConcurrencyLimit(resolvedModel, maxConcurrency, async () => {
    try {
      const apiBase = getApiBase('chat', resolvedModel);
      const endpoint = resolved?.endpoint || '/v1/chat/completions';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      if (resolved?.providerId === 'wldramallm') {
        logger.info(
          LogCategory.AI,
          '[WLDramaLLM Stream Request]',
          JSON.stringify(requestBody, null, 2),
        );
      }

      const response = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
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
                const delta =
                  payload?.choices?.[0]?.delta?.content ||
                  payload?.choices?.[0]?.message?.content ||
                  '';
                if (delta) {
                  fullText += delta;
                  onDelta?.(delta);
                }
              } catch {
                // 忽略解析失败的行
              }
            }
          }

          boundaryIndex = buffer.indexOf('\n\n');
        }
      }

      clearTimeout(timeoutId);
      return fullText;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const err = error as { name?: string };
      if (err.name === 'AbortError') {
        throw new Error(`请求超时（${timeout}ms）`);
      }
      throw error;
    }
  });
};

// ============================================
// API Key 验证
// ============================================

/**
 * 验证 API Key 的连通性
 */
export const verifyApiKey = async (key: string): Promise<{ success: boolean; message: string }> => {
  try {
    const apiBase = getApiBase('chat');
    const resolvedModel = getDefaultChatModelId();
    const requestModel = resolveRequestModel('chat', resolvedModel);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }
    const response = await fetch(`${apiBase}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: requestModel,
        messages: [{ role: 'user', content: '仅返回1' }],
        temperature: 0.1,
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      let errorMessage = `验证失败: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
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
  } catch (error: unknown) {
    return { success: false, message: error instanceof Error ? error.message : '网络错误' };
  }
};

// ============================================
// 媒体工具函数
// ============================================

/**
 * 将视频URL转换为base64格式
 */
export const convertVideoUrlToBase64 = async (url: string): Promise<string> => {
  // 处理 BigModel 视频 URL 代理
  let proxyUrl = url;

  if (url.includes('aigc-files.bigmodel.cn')) {
    const videoPath = url.replace('https://aigc-files.bigmodel.cn/', '');
    proxyUrl = `/bigmodel-files/${videoPath}`;
    logger.debug(LogCategory.VIDEO, `[Video] 使用 BigModel 文件代理: ${proxyUrl}`);
  } else if (url.includes('ufileos.com')) {
    const videoPath = url.replace('https://maas-watermark-prod-new.cn-wlcb.ufileos.com/', '');
    proxyUrl = `/video-proxy/${videoPath}`;
    logger.debug(LogCategory.VIDEO, `[Video] 使用 UCloud 代理: ${proxyUrl}`);
  } else {
    // 其他 URL 直接使用
    proxyUrl = url;
  }

  try {
    // 使用代理下载
    const response = await fetch(proxyUrl);

    // 检查响应状态
    const contentType = response.headers.get('content-type') || '';
    logger.debug(
      LogCategory.VIDEO,
      `[Video] 代理响应状态: ${response.status}, 类型: ${contentType}`,
    );

    // 如果返回的不是视频类型（包括 HTML 错误页面）
    const isVideoType =
      contentType.startsWith('video/') ||
      contentType.includes('octet-stream') ||
      contentType.includes('application/octet-stream');

    if (!isVideoType) {
      // 尝试读取响应内容看看是什么
      const text = await response.text();
      logger.error(
        LogCategory.VIDEO,
        `[Video] 代理返回非视频类型，内容前500字符: ${text.substring(0, 500)}`,
      );

      // 如果内容是 HTML，说明代理有问题
      if (text.trim().startsWith('<') || text.includes('<!DOCTYPE')) {
        throw new Error(`视频下载失败: 代理返回 HTML 错误页面，可能是代理配置问题或服务器错误`);
      }

      // 如果不是 HTML，可能是其他错误
      throw new Error(`视频下载失败: 代理返回非视频类型内容 (${contentType})`);
    }

    if (!response.ok) {
      throw new Error(`下载视频失败: HTTP ${response.status}`);
    }

    // 获取 Blob 并转换
    const blob = await response.blob();
    logger.debug(
      LogCategory.VIDEO,
      `[Video] 获取到视频 Blob, 大小: ${blob.size}, 类型: ${blob.type}`,
    );

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        logger.debug(
          LogCategory.VIDEO,
          `[Video] 视频转换为 base64 成功, 长度: ${base64String.length}`,
        );
        resolve(base64String);
      };
      reader.onerror = () => {
        reject(new Error('转换视频为base64失败'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(LogCategory.VIDEO, '视频URL转base64失败:', error);

    // 如果是 CORS 错误，给出更明确的提示
    if (message.includes('Failed to fetch') || message.includes('CORS')) {
      throw new Error(`视频下载失败: 存在 CORS 跨域问题，请确保视频服务器允许跨域访问`);
    }
    throw new Error(`视频转换失败: ${message}`);
  }
};

/**
 * 调整图片尺寸到指定宽高（cover模式，保持比例居中裁剪）
 */
export const resizeImageToSize = async (
  base64Data: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建canvas上下文'));
        return;
      }
      const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const offsetX = (targetWidth - scaledWidth) / 2;
      const offsetY = (targetHeight - scaledHeight) / 2;
      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
      const result = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      resolve(result);
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = `data:image/png;base64,${base64Data}`;
  });
};

// ============================================
// 视频模型辅助
// ============================================

/**
 * 获取 Veo 模型名称（根据横竖屏和是否有参考图）
 */
export const getVeoModelName = (hasReferenceImage: boolean, aspectRatio: AspectRatio): string => {
  const orientation = aspectRatio === '9:16' ? 'portrait' : 'landscape';
  if (hasReferenceImage) {
    return `veo_3_1_i2v_s_fast_fl_${orientation}`;
  } else {
    return `veo_3_1_t2v_fast_${orientation}`;
  }
};

/**
 * 根据横竖屏比例获取 Sora 视频尺寸
 */
export const getSoraVideoSize = (aspectRatio: AspectRatio): string => {
  return VIDEO_SORA_SIZE[aspectRatio]?.size;
};
