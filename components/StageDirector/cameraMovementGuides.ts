/**
 * 镜头运动构图指导配置
 * 为不同类型的镜头运动提供首帧和尾帧的构图建议
 */

export interface CameraMovementGuide {
  start: string;
  end: string;
}

export const CAMERA_MOVEMENT_GUIDES: Record<string, CameraMovementGuide> = {
  'horizontal left shot': {
    start: 'Composition: Subject positioned on the right side of frame, with space on the left for movement.',
    end: 'Composition: Subject moved to left side of frame, showing the journey from right to left.'
  },
  'horizontal right shot': {
    start: 'Composition: Subject positioned on the left side of frame, with space on the right for movement.',
    end: 'Composition: Subject moved to right side of frame, showing the journey from left to right.'
  },
  'pan left shot': {
    start: 'Composition: Frame focused on right portion of scene, anticipating leftward pan.',
    end: 'Composition: Frame reveals left portion of scene, completing the pan movement.'
  },
  'pan right shot': {
    start: 'Composition: Frame focused on left portion of scene, anticipating rightward pan.',
    end: 'Composition: Frame reveals right portion of scene, completing the pan movement.'
  },
  'zoom in shot': {
    start: 'Composition: Wide establishing shot showing full scene context, subject smaller in frame.',
    end: 'Composition: Tight close-up on subject, filling frame with detail and intimacy.'
  },
  'zoom out shot': {
    start: 'Composition: Close-up on subject, emphasizing details and emotion.',
    end: 'Composition: Wide pullback revealing surrounding environment and context.'
  },
  'dolly shot': {
    start: 'Composition: Initial framing with subject at specific distance and perspective.',
    end: 'Composition: Changed perspective with subject closer/further, revealing depth and space.'
  },
  'tilt up shot': {
    start: 'Composition: Camera angle pointing downward or level, capturing lower portion of subject.',
    end: 'Composition: Camera tilted upward, revealing height and vertical expanse above.'
  },
  'tilt down shot': {
    start: 'Composition: Camera angle pointing upward or level, emphasizing upper portion.',
    end: 'Composition: Camera tilted downward, revealing lower elements and ground level.'
  },
  'vertical up shot': {
    start: 'Composition: Lower vertical position, subject at bottom of frame or ground level.',
    end: 'Composition: Elevated position, subject risen vertically showing upward movement.'
  },
  'vertical down shot': {
    start: 'Composition: Elevated vertical position, subject higher in frame.',
    end: 'Composition: Lower position, subject descended showing downward movement.'
  },
  'tracking shot': {
    start: 'Composition: Subject in frame with forward/lateral space for tracking movement.',
    end: 'Composition: Subject tracked through space, maintaining visual relationship.'
  },
  'circular shot': {
    start: 'Composition: Subject centered, camera at initial angle of circular path.',
    end: 'Composition: Subject still centered, camera at opposite side revealing new angle.'
  },
  '360-degree circular shot': {
    start: 'Composition: Subject centered, camera beginning 360° orbit.',
    end: 'Composition: Subject centered, camera completing full revolution from different angle.'
  },
  'low angle shot': {
    start: 'Composition: Low camera angle looking upward, emphasizing height and power.',
    end: 'Composition: Maintained low angle, subject towering with dramatic perspective.'
  },
  'high angle shot': {
    start: 'Composition: High camera angle looking downward, creating overview perspective.',
    end: 'Composition: Maintained high angle, emphasizing scale and spatial relationships.'
  },
  "bird's eye view shot": {
    start: 'Composition: Directly overhead view, showing layout and patterns from above.',
    end: 'Composition: Continued overhead perspective, revealing changed spatial arrangement.'
  },
  'pov shot': {
    start: "Composition: First-person perspective from character's viewpoint.",
    end: 'Composition: Maintained POV, showing what character sees after movement/action.'
  },
  'over the shoulder shot': {
    start: "Composition: Frame includes foreground character's shoulder, looking at subject.",
    end: 'Composition: Maintained over-shoulder framing, possibly with shifted focus or angle.'
  },
  'handheld shot': {
    start: 'Composition: Dynamic handheld framing with natural movement and energy.',
    end: 'Composition: Continued handheld aesthetic with organic repositioning.'
  },
  'static shot': {
    start: 'Composition: Fixed camera position, stable framing throughout.',
    end: 'Composition: Same camera position, only subject movement within frame.'
  },
  'rotating shot': {
    start: 'Composition: Subject in frame, camera beginning rotational movement.',
    end: 'Composition: Subject with changed orientation due to camera rotation.'
  },
  'slow motion shot': {
    start: 'Composition: Action captured at beginning of slow-motion sequence.',
    end: 'Composition: Action progressed, emphasizing graceful movement detail.'
  },
  'parallel tracking shot': {
    start: 'Composition: Subject with camera tracking parallel alongside.',
    end: 'Composition: Maintained parallel relationship, subject moved through space.'
  },
  'diagonal tracking shot': {
    start: 'Composition: Subject with camera on diagonal tracking path.',
    end: 'Composition: Diagonal perspective maintained, dynamic spatial progression.'
  },
  'canted shot': {
    start: 'Composition: Tilted horizon line creating dutch angle, dynamic unease.',
    end: 'Composition: Maintained or adjusted dutch angle, emphasizing disorientation.'
  },
  'cinematic dolly zoom': {
    start: 'Composition: Initial balanced framing before vertigo effect.',
    end: 'Composition: Distorted perspective with foreground/background relationship altered.'
  }
};

// 获取所有已知的 key 列表，用于 LLM 分类提示词
const KNOWN_KEYS = Object.keys(CAMERA_MOVEMENT_GUIDES);

// 内存缓存：cameraMovement → matchedKey
const movementKeyCache = new Map<string, string>();

/**
 * 用 LLM 将任意镜头运动描述映射到预定义的 key
 */
async function mapToKnownMovement(
  movement: string,
  chatCompletion: (prompt: string, model?: string, temperature?: number, maxTokens?: number, responseFormat?: string) => Promise<string>,
  model?: string
): Promise<string | null> {
  const classifierPrompt = `You are a camera movement classifier. Given a description, pick the SINGLE best match from the predefined list below. Return ONLY the matched key string, nothing else.

Predefined list:
${KNOWN_KEYS.map(k => `- ${k}`).join('\n')}

Input: "${movement}"
Output:`;

  try {
    const result = await chatCompletion(classifierPrompt, model, 0.3, 100);
    const cleaned = result.trim().toLowerCase().replace(/[^a-z0-9\s'-]/g, '');
    if (KNOWN_KEYS.includes(cleaned)) {
      return cleaned;
    }
    // 模糊兜底：如果 LLM 返回的不完全匹配，做 string includes 再匹配一次
    for (const key of KNOWN_KEYS) {
      if (cleaned.includes(key) || key.includes(cleaned)) {
        return key;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 根据镜头运动类型返回构图指导
 * 先尝试字符串匹配（快速路径），失败后用 LLM 兜底（带缓存）
 */
export const getCameraMovementCompositionGuide = async (
  cameraMovement: string,
  frameType: 'start' | 'end',
  chatCompletion?: (prompt: string, model?: string, temperature?: number, maxTokens?: number, responseFormat?: string) => Promise<string>,
  model?: string
): Promise<string> => {
  const movement = cameraMovement.toLowerCase();
  
  // 1. 快速路径：精确匹配（LLM 输出本身就是规范值时，零延迟）
  const exactMatch = KNOWN_KEYS.find(k => movement === k);
  if (exactMatch) {
    console.log(`📐 [cameraGuide] 精确匹配 → "${exactMatch}" (${frameType})`);
    const guide = CAMERA_MOVEMENT_GUIDES[exactMatch];
    return frameType === 'start' ? guide.start : guide.end;
  }

  // 2. 检查缓存（之前用 LLM 映射过的变体名称）
  if (movementKeyCache.has(movement)) {
    const key = movementKeyCache.get(movement)!;
    console.log(`📐 [cameraGuide] 缓存命中 → "${movement}" → "${key}" (${frameType})`);
    const guide = CAMERA_MOVEMENT_GUIDES[key];
    return frameType === 'start' ? guide.start : guide.end;
  }

  // 3. LLM 分类（仅在提供了 chatCompletion 时启用）
  if (chatCompletion) {
    console.log(`📐 [cameraGuide] 字符串未匹配，调用 LLM 分类 → "${movement}"`);
    const matchedKey = await mapToKnownMovement(movement, chatCompletion, model);
    if (matchedKey) {
      movementKeyCache.set(movement, matchedKey);
      console.log(`📐 [cameraGuide] LLM 映射 → "${movement}" → "${matchedKey}" (${frameType})`);
      const guide = CAMERA_MOVEMENT_GUIDES[matchedKey];
      return frameType === 'start' ? guide.start : guide.end;
    }
    console.warn(`📐 [cameraGuide] LLM 映射失败，回退通用指导`);
  }

  // 4. 最终兜底
  console.log(`📐 [cameraGuide] 通用指导兜底 → "${movement}" (${frameType})`);
  return frameType === 'start'
    ? 'Composition: Initial frame composition suited for the camera movement.'
    : 'Composition: Final frame composition showing the result of camera movement.';
};
