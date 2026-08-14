// H3 AI 助手返回的 JSON 解析与容错。
// 根因：Drama 后台（wldramallm provider）的 chatCompletion 会跳过 response_format/temperature，
// 因此模型不是强制 JSON 模式，可能返回「散文包裹 / 截断 / 用官方字段名」的非标准 JSON。
// 这里做鲁棒解析：去散文、截尾修复、键名归一，确保「从梗概生成」稳定回填。
export interface H3SynopsisDialogue {
  timestamp: number;
  character: string;
  text: string;
}

export interface H3SynopsisResult {
  description: string;
  soundscape: string;
  music: string;
  dialogues: H3SynopsisDialogue[];
}

// 模型可能返回简短字段或官方长字段名，统一归一
const KEY_ALIASES: { aliases: string[]; pick: (r: Record<string, unknown>) => unknown }[] = [
  {
    aliases: [
      'description',
      'integrated_multimodal_description',
      'integratedMultimodalDescription',
      'desc',
      'body',
    ],
    pick: () => undefined,
  },
  {
    aliases: ['soundscape', 'overall_soundscape', 'overallSoundscape', 'ambience'],
    pick: () => undefined,
  },
  {
    aliases: ['music', 'non_diegetic_music', 'nonDiegeticMusic', 'score'],
    pick: () => undefined,
  },
  {
    aliases: ['dialogues', 'dialogue', 'dialogue_list', 'lines'],
    pick: () => undefined,
  },
];

function pick(raw: Record<string, unknown>, aliases: string[]): unknown {
  for (const a of aliases) {
    if (a in raw) return raw[a];
  }
  return undefined;
}

function normalizeDialogue(d: unknown): H3SynopsisDialogue {
  const o = (d ?? {}) as Record<string, unknown>;
  const t = o.timestamp ?? o.time ?? o.t ?? o.seconds;
  const c = o.character ?? o.speaker ?? o.role ?? o.name;
  const txt = o.text ?? o.content ?? o.line;
  return {
    timestamp: typeof t === 'number' ? t : Number(t) || 0,
    character: typeof c === 'string' ? c : String(c ?? ''),
    text: typeof txt === 'string' ? txt : String(txt ?? ''),
  };
}

function normalizeKeys(raw: Record<string, unknown>): H3SynopsisResult {
  const descRaw = pick(raw, KEY_ALIASES[0].aliases);
  const soundRaw = pick(raw, KEY_ALIASES[1].aliases);
  const musicRaw = pick(raw, KEY_ALIASES[2].aliases);
  const dlgRaw = pick(raw, KEY_ALIASES[3].aliases);
  return {
    description: typeof descRaw === 'string' ? descRaw : '',
    soundscape: typeof soundRaw === 'string' ? soundRaw : '',
    music: typeof musicRaw === 'string' ? musicRaw : '',
    dialogues: Array.isArray(dlgRaw) ? dlgRaw.map(normalizeDialogue) : [],
  };
}

/**
 * 尝试闭合未完成的 JSON（模型输出被截断时）。
 * 仅处理「末尾未闭合」这类可修复情形；出现括号不匹配则视为不可修复，返回 null。
 */
function repairTruncatedJson(text: string): string | null {
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  const openFor: Record<string, string> = { '}': '{', ']': '[' };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      const top = stack.pop();
      if (top !== openFor[ch]) return null; // 括号不匹配，无法修复
    }
  }
  if (stack.length === 0 && !inString) return null; // 已闭合，无需修复
  let fixed = text;
  if (inString) fixed += '"'; // 先闭合未结束的字符串
  while (stack.length) {
    fixed += stack.pop() === '{' ? '}' : ']';
  }
  return fixed;
}

/**
 * 容错解析 AI 返回的 JSON。返回归一化结构；完全解析不出合法 JSON 对象时返回 null。
 */
export function parseJsonSafe(text: string): H3SynopsisResult | null {
  const candidates: string[] = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  const tryParse = (s: string): H3SynopsisResult | null => {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return normalizeKeys(obj as Record<string, unknown>);
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  for (const c of candidates) {
    const trimmed = c.trim();
    const direct = tryParse(trimmed);
    if (direct) return direct;
    const repaired = repairTruncatedJson(trimmed);
    if (repaired) {
      const r = tryParse(repaired);
      if (r) return r;
    }
  }
  return null;
}
