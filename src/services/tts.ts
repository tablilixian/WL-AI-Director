/** TTS 语音信息 */
export interface TTSVoice {
  id: string;
  name: string;
}

// ─── 浏览器 Web Speech API ──────────────────────────────────

export class WebSpeechTTSProvider {
  readonly name = 'Web Speech API';
  readonly supportsGenerate = false;

  async getVoices(): Promise<TTSVoice[]> {
    await this.#ensureVoices();
    return speechSynthesis.getVoices().map(v => ({
      id: v.voiceURI,
      name: `${v.name} (${v.lang})`,
    }));
  }

  async speak(text: string, voiceId: string): Promise<void> {
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.voiceURI === voiceId);
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(e);
      speechSynthesis.speak(utterance);
    });
  }

  async generate(_text: string, _voiceId: string): Promise<Blob> {
    throw new Error('Web Speech API 不支持生成音频文件');
  }

  #ensureVoices(): Promise<void> {
    return new Promise((resolve) => {
      if (speechSynthesis.getVoices().length) { resolve(); return; }
      speechSynthesis.onvoiceschanged = () => resolve();
    });
  }
}

// ─── 本地 Edge-TTS（通过 Docker）────────────────────────────

const EDGE_TTS_BASE = '/edge-tts';

const EDGE_VOICES: TTSVoice[] = [
  // 中文语音
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（中文女声）' },
  { id: 'zh-CN-YunxiNeural', name: '云希（中文男声）' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊（中文女声）' },
  { id: 'zh-CN-YunjianNeural', name: '云健（中文男声）' },
  { id: 'zh-CN-YunyangNeural', name: '云扬（中文男声）' },
  // 英文语音
  { id: 'en-US-AvaNeural', name: 'Ava（英文女声）' },
  { id: 'en-US-AndrewNeural', name: 'Andrew（英文男声）' },
  { id: 'en-US-EmmaNeural', name: 'Emma（英文女声）' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia（英式女声）' },
  { id: 'en-GB-RyanNeural', name: 'Ryan（英式男声）' },
  // 日语
  { id: 'ja-JP-NanamiNeural', name: 'Nanami（日语女声）' },
  // 粤语
  { id: 'zh-HK-HiuGaaiNeural', name: '晓佳（粤语女声）' },
];

export class EdgeTTSProvider {
  readonly name = '本地 Edge-TTS';
  readonly supportsGenerate = true;
  private baseUrl = EDGE_TTS_BASE;

  getVoices(): Promise<TTSVoice[]> {
    return Promise.resolve(EDGE_VOICES);
  }

  async speak(text: string, voiceId: string): Promise<void> {
    const blob = await this.generate(text, voiceId);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); };
    await audio.play();
  }

  async generate(text: string, voiceId: string): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your_api_key_here',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voiceId,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Edge-TTS 错误 (${res.status}): ${body}`);
    }

    return await res.blob();
  }
}

// ─── 工具函数 ────────────────────────────────────────────────

let cachedProvider: WebSpeechTTSProvider | EdgeTTSProvider | null = null;

export function getTTSProvider(): WebSpeechTTSProvider | EdgeTTSProvider {
  if (cachedProvider) return cachedProvider;

  const provider = tryGetEdgeTTS() ?? new WebSpeechTTSProvider();
  cachedProvider = provider;
  return provider;
}

function tryGetEdgeTTS(): EdgeTTSProvider | null {
  const provider = new EdgeTTSProvider();
  return provider;
}

export function resetTTSProvider(): void {
  cachedProvider = null;
}
