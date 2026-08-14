// H3 提示词拼装器（官方 base 模式：图生视频 I2VA / FL2VA / L2VA）
// 结构 = 首行「指令行」+ 空行 + 3 个核心字段：
//   integrated_multimodal_description / overall_soundscape / non_diegetic_music
// 指令行把 <Picture N>（首帧/尾帧/参考图）锚定到时间轴，H3 模型据此对齐参考图。
// 可直接作为后台 image2video 的 prompt 字段。
import type { H3LabConfig, H3ImageSpec } from './types';

/** 把秒格式化为 H3 分镜时间：At 00:03.500（英文，3 位毫秒，官方 base-en.txt 用法） */
export function formatH3ShotTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad = (n: number, len: number) => String(n).padStart(len, '0');
  return `At ${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

/** 把秒格式化为对齐指令用的 S.SS（2 位小数，如 8.00） */
export function formatH3AlignTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  return safe.toFixed(2);
}

/** 取描述中最后一个 [Shot N] 的编号（对白镜头行延续编号用） */
function lastShotNumber(desc: string): number {
  const re = /\[Shot\s+(\d+)\]/g;
  let max = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc))) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

/**
 * 生成首行「指令行」——把参考图锚定到时间轴（官方统一格式）。
 * - I2VA：仅首帧 → <Picture 1> 锚定 0.00s。
 * - FL2VA：首帧 @0.00s + 尾帧 @结尾秒。
 * - L2VA：仅尾帧 → <Picture 1> 锚定到结尾秒。
 * - 参考图（ref）：作为 <Picture N> 列出 "is referenced"，不指定时间锚点。
 */
export function buildH3InstructionLine(images: H3ImageSpec[], durationSec: number): string {
  if (images.length === 0) return '';
  const ss = formatH3AlignTime(durationSec);
  const parts = images.map((img, i) => {
    const pic = i + 1;
    if (img.role === 'first') {
      return `at 0.00 seconds, <Picture ${pic}> (from [Shot ${pic}]) is fully referenced`;
    }
    if (img.role === 'last') {
      return `at ${ss} seconds, <Picture ${pic}> (from [Shot ${pic}]) is fully referenced`;
    }
    return `<Picture ${pic}> (from [Shot ${pic}]) is referenced`;
  });
  return `For the target video, ${parts.join(', and ')}.`;
}

/**
 * 拼装完整 H3 提示词（图生视频 base 模式）。
 * 1) 指令行（首行）
 * 2) 空行
 * 3) integrated_multimodal_description: <描述体>
 * 4) 结构化对白按时间排序，追加为 [Shot N] At MM:SS.mmm, 角色 says: <d>[语言] 文本</d>
 * 5) overall_soundscape: <声景>
 * 6) non_diegetic_music: <音乐 | N/A>
 */
export function buildH3Prompt(c: H3LabConfig): string {
  const out: string[] = [];

  // Part One：指令行（首行，必须）
  const instruction = buildH3InstructionLine(c.images, c.durationSec);
  if (instruction) {
    out.push(instruction);
    out.push('');
  }

  // Part Two：三个核心字段
  const desc =
    c.description.trim() ||
    '(Describe the shot in English: visual style, subjects, actions, camera motion, and diegetic sound along the timeline. Begin [Shot 1] referencing <Picture 1>.)';
  out.push(`integrated_multimodal_description: ${desc}`);

  // 结构化对白：时间排序后追加为带时间的镜头行（与描述体同为 integrated_multimodal_description 字段）
  const dialogues = [...c.dialogues]
    .filter((d) => d.text.trim())
    .sort((a, b) => a.timestamp - b.timestamp);
  let shotN = lastShotNumber(desc);
  dialogues.forEach((d) => {
    shotN += 1;
    const who = d.character.trim() ? `${d.character.trim()} says: ` : 'A voice says: ';
    // 时间轴保护：对白时间必须落在视频时长内，否则会生成非法分镜时间
    // （如视频仅 8s 却标 At 00:25.000）。越界一律 clamp 到 [0, durationSec]。
    const ts = Math.min(Math.max(0, d.timestamp), c.durationSec);
    out.push(
      `[Shot ${shotN}] ${formatH3ShotTime(ts)}, ${who}<d>[${c.dialogueLang}] ${d.text.trim()}</d>`,
    );
  });
  out.push('');

  out.push(`overall_soundscape: ${c.soundscape.trim() || 'N/A'}`);
  out.push(`non_diegetic_music: ${c.music.trim() || 'N/A'}`);

  return out.join('\n').trim();
}
