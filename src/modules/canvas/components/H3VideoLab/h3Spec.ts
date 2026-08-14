// H3 视频生成提示词规范（官方 base 模式，来源 MiniMax-AI/MiniMax-H3 skills/h3-prompt-writing）
// 用途：
//  1) H3_SPEC_SYSTEM —— 作为「🪄 从梗概生成」AI 助手的 system prompt，让大模型产出符合 H3 图生视频协议的字段。
//  2) H3_RULES —— 面板内嵌的「提示词规则参考」，把官方协议完整呈现给用户（"包含整个新的提示词规则"）。
// 注意：首行「指令行」（<Picture N> 帧对齐）由代码 buildH3InstructionLine 自动生成，
//      AI 只需产出 3 个核心字段 + 结构化对白。仅承载不变约束，与每次变化的剧情梗概分离。

export const H3_SPEC_SYSTEM = `You are a MiniMax H3 video-prompt engineer. The user gives a short synopsis (may be in Chinese); you return a structured H3 image-to-video prompt as strict JSON.

# H3 image-to-video protocol (base modes: I2VA / FL2VA / L2VA)
The final prompt is assembled by code as:
  <instruction line: anchors the reference picture(s) to the timeline>
  (blank line)
  integrated_multimodal_description: <main body, ENGLISH>
  overall_soundscape: <ambience, ENGLISH>
  non_diegetic_music: <score, ENGLISH or "N/A">

You must produce ONLY a JSON object with exactly these keys: description, soundscape, music, dialogues. Do NOT write the instruction line — code adds it.

# Rules
1. integrated_multimodal_description (English): describe visuals, actions, shots, camera, and diegetic sound along the timeline. Begin with "[Shot 1]" and establish style (e.g. "Live-action, cinematic"). For the FIRST frame, reference it as "<Picture 1>" (e.g. "the woman shown in <Picture 1> remains..."). For LAST-frame mode, the last [Shot N] must reach the ending pose established by <Picture 1>. For first+last frame mode, the last [Shot N] must reach the ending pose established by <Picture 2>. Use "[Shot 2] At 00:03.500, the camera cuts to..." for later shots (strictly increasing cut times, MM:SS.mmm). Camera motion = type + amplitude + speed, written as natural English, e.g. "The camera pushes in with small amplitude at slow speed toward...". Available types: Zoom In/Out, Push In/Pull Out, Pan/Truck/Tilt Left/Right, Pedestal Up/Down, Arc Shot, Tracking Shot, Static Shot, Shake Slightly/Strongly, POV, Roll Clockwise/Counterclockwise.
2. Speakers & dialogue: assign stable IDs (S1), (S2). Write dialogue inside <d>[Language] ...</d> preserving the original words verbatim (do NOT translate). Language tag is the English language name, e.g. [Chinese], [English]. Put only the language tag + spoken text inside <d>; keep speaker identity/action outside. Off-screen voiceover: "says in an off-screen voiceover: <d>[Chinese] ...</d> while his lips remain completely closed."
3. overall_soundscape (English, 1-4 sentences): ambient sound, physical action sounds, non-verbal human sounds across the whole video (wind, rain, footsteps, fabric, impacts, breathing, laughter). Do NOT repeat dialogue here. Use "N/A" only if the user wants total silence.
4. non_diegetic_music (English, 1-3 sentences): background music only the audience hears — name instrumentation, tempo, rhythm, dynamic changes. Use "N/A" when none.
5. dialogues array: each item {timestamp (seconds, float), character (name or ""), text (original-language spoken words, no <d> tag)}. Keep timestamps within the video duration.

# Expected JSON schema (declare types & required fields explicitly for reliable structure)
You MUST output a JSON object with EXACTLY this shape (loosely based on JSON Schema):
{
  "description": string,   // REQUIRED. integrated_multimodal_description body in English, with [Shot N] timing and inline <d>[Language] text</d> where natural.
  "soundscape": string,    // REQUIRED. overall_soundscape in English (or "N/A").
  "music": string,         // REQUIRED. non_diegetic_music in English (or "N/A").
  "dialogues": [           // REQUIRED. array; EMPTY array [] if no dialogue.
    { "timestamp": number, // float seconds, within video duration.
      "character": string, // speaker name or "" for unknown.
      "text": string }     // original-language spoken words, NO <d> tag.
  ]
}
Rules: all four keys are required; "dialogues" must be an array (use [] when none). Do NOT add extra top-level keys.

# Return format (strict JSON only, no extra text)
{
  "description": "integrated_multimodal_description body in English, with [Shot N] timing and inline <d>[Language] text</d> where natural",
  "soundscape": "overall_soundscape in English",
  "music": "non_diegetic_music in English or N/A",
  "dialogues": [{"timestamp": 3.0, "character": "Boy", "text": "要是时间能停在这一刻就好了"}]
}`;

/**
 * 内嵌规则参考（面板 📖 提示词规则 展示用）。
 * 把官方 base 模式协议完整呈现，覆盖三种图生视频模式的差异。
 */
export const H3_RULES = {
  general: [
    '结构：首行「指令行」+ 空行 + 3 个字段（integrated_multimodal_description / overall_soundscape / non_diegetic_music）。',
    '描述体建议用英文（H3 按英文结构调参，效果最佳）；仅对白 / 歌词 / 屏显文字保留原文语言。',
    '指令行由代码自动生成：把 <Picture N> 锚定到时间轴（首帧 = 0.00s，尾帧 = 结尾秒）。',
    '参考图（如有）作为 <Picture N> 列出 "is referenced"，不指定时间锚点。',
  ],
  fields: [
    {
      name: 'integrated_multimodal_description',
      desc: '英文，按播放顺序写视觉 / 动作 / 运镜 / 画内声音；[Shot 1] 起手并引用 <Picture 1>。',
    },
    {
      name: 'overall_soundscape',
      desc: '英文 1–4 句：环境音 + 物理动作声 + 非语言人声（不含对白）。无则填 N/A。',
    },
    {
      name: 'non_diegetic_music',
      desc: '英文 1–3 句，仅观众可闻的配乐（乐器 / 节奏 / 动态）。无则填 N/A。',
    },
  ] as { name: string; desc: string }[],
  dialogue:
    '对白写入 <d>[语言] 文本</d>，语言用英文名（[Chinese] / [English]）；文本保持原文不翻译。生成时按时间追加为 [Shot N] At MM:SS.mmm, 角色 says: <d>[...] ...</d>。',
  time: '分镜时间格式：At 00:03.500（MM:SS.mmm，3 位毫秒，严格递增）。',
  camera:
    '运镜 = 类型 + 幅度 + 速度，例：The camera pushes in with small amplitude at slow speed。可用类型见面板「综合描述」内的运镜词。',
  modes: {
    i2va: 'I2VA：单张首帧。指令行 <Picture 1> 锚定 0.00s，视频从首帧向前发展。可加参考图。',
    fl2va: 'FL2VA：首帧 + 尾帧。指令行 <Picture 1>@0.00s、<Picture 2>@结尾秒，模型精确插值到尾帧。',
    l2va: 'L2VA：单张尾帧。指令行 <Picture 1> 锚定到结尾秒，视频向该尾帧收敛。可加参考图。',
  } as Record<'i2va' | 'fl2va' | 'l2va', string>,
};

/**
 * 调用 AI 助手时拼装的 user prompt 模板。
 * @param mode          'i2va'（仅首帧）| 'fl2va'（首+尾帧）| 'l2va'（仅尾帧）
 * @param dialogueLang  <d> 标签语言名（Chinese / English ...）
 * @param promptLang    'en' | 'zh' —— 描述体语言（官方建议 en）
 */
export function buildSynopsisPrompt(
  synopsis: string,
  mode: 'i2va' | 'fl2va' | 'l2va',
  dialogueLang: string,
  promptLang: 'en' | 'zh',
): string {
  const modeNote =
    mode === 'fl2va'
      ? '模式：首帧+尾帧（FL2VA）。描述最后 [Shot N] 必须收敛到尾帧姿态；代码会把 <Picture 2> 锚定到视频结尾。'
      : mode === 'l2va'
        ? '模式：仅尾帧（L2VA）。描述从当前画面出发、最后 [Shot N] 必须收敛到该尾帧；代码会把 <Picture 1> 锚定到视频结尾秒。'
        : '模式：仅首帧（I2VA）。描述从 <Picture 1> 出发向前发展；代码会把 <Picture 1> 锚定为 0.00s 首帧。';
  const langNote =
    promptLang === 'en'
      ? 'integrated_multimodal_description / overall_soundscape / non_diegetic_music 用【英文】写（H3 按英文结构调参，效果最佳）。'
      : 'integrated_multimodal_description / overall_soundscape / non_diegetic_music 用【中文】写。';
  const dlgNote = `对白 <d> 标签语言用 [${dialogueLang}]，对白原文保持用户语言不要翻译。`;
  return `请根据以下剧情梗概生成 H3 图生视频提示词字段：\n\n${synopsis}\n\n${modeNote}\n${langNote}\n${dlgNote}\n\n只返回 JSON。`;
}
