import React, { useState, useCallback } from 'react';
import { X, Loader2, Sparkles, Check, AlertCircle } from 'lucide-react';
import { useTimelineStore } from '../../stores/timelineStore';
import { TextClip } from '../../types/editor';
import { chatCompletion, parseLlmJson } from '../../../services/ai/apiCore';
import { Shot } from '../../../types';
import { logger, LogCategory } from '../../../services/logger.ts';

interface GenerateSubtitleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shots?: Shot[];
}

export const GenerateSubtitleDialog: React.FC<GenerateSubtitleDialogProps> = ({
  isOpen,
  onClose,
  shots,
}) => {
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<'idle' | 'done' | 'error'>('idle');

  const handleGenerate = useCallback(async () => {
    const { tracks, addClip } = useTimelineStore.getState();

    const videoTrack = tracks.find((t) => t.type === 'video');
    const textTrack = tracks.find((t) => t.type === 'text');
    if (!videoTrack || !textTrack) {
      alert('请确保视频轨道和字幕轨道都已存在');
      return;
    }

    const videoClips = videoTrack.clips.filter(
      (c) => c.sourceType === 'video' || c.sourceType === 'image',
    );
    if (videoClips.length === 0) {
      alert('没有可生成字幕的视频片段');
      return;
    }

    setGenerating(true);
    setProgress('正在调用 AI 生成字幕...');
    setResult('idle');

    try {
      const clipInfo = videoClips.map((c, i) => {
        const shot = shots?.find((s) => s.id === c.sourceId);
        return {
          index: i + 1,
          startTime: c.startTime,
          duration: c.duration,
          name: c.name || shot?.actionSummary?.slice(0, 30) || `片段 ${i + 1}`,
          actionSummary: shot?.actionSummary || '',
          dialogue: shot?.dialogue || '',
        };
      });

      const clipTable = clipInfo
        .map(
          (c) =>
            `${c.index}. 起始:${(c.startTime / 1000).toFixed(1)}s 时长:${(c.duration / 1000).toFixed(1)}s 描述:${c.actionSummary}${c.dialogue ? ` 对话:${c.dialogue}` : ''}`,
        )
        .join('\n');

      const prompt = `你是一个专业的视频字幕撰稿人。请根据以下信息为每个视频片段生成一句简短自然的旁白字幕。

${description ? `视频主题描述: ${description}` : ''}

共有 ${videoClips.length} 个片段：

${clipTable}

要求：
- 每句字幕不超过 30 个字
- 语言自然流畅，适合配音旁白
- 符合片段的内容描述和时长
- 如果是对话片段，保留对话内容

以 JSON 数组格式返回（不要 markdown 标记）：
[{"index": 1, "text": "字幕内容"}, ...]`;

      setProgress('正在分析片段内容并生成字幕...');
      const response = await chatCompletion(prompt, 'glm-4-flash', 0.8, 4096, 'json_object');
      logger.info(LogCategory.VIDEO, '[GenerateSubtitle] LLM 返回:', response);
      const parsed = parseLlmJson(response);
      let subtitles: { index: number; text: string }[];
      if (Array.isArray(parsed)) {
        subtitles = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        const arr = Object.values(parsed).find(Array.isArray);
        subtitles = (arr || []) as { index: number; text: string }[];
      } else {
        subtitles = [];
      }
      if (subtitles.length === 0) throw new Error('AI 返回的字幕数据为空，请重试');

      setProgress('正在写入字幕轨道...');

      let createdCount = 0;
      for (const sub of subtitles) {
        const clip = videoClips[sub.index - 1];
        if (!clip || !sub.text) continue;

        const textClip: TextClip = {
          id: `ai-sub-${clip.id}-${Date.now()}-${createdCount}`,
          trackId: textTrack.id,
          sourceId: `subtitle-${clip.sourceId || clip.id}`,
          sourceType: 'text',
          sourceUrl: '',
          name: sub.text.slice(0, 20),
          startTime: clip.startTime,
          duration: clip.duration,
          inPoint: 0,
          outPoint: clip.duration,
          type: 'text',
          text: sub.text,
          fontFamily: 'Arial, sans-serif',
          fontSize: 24,
          fontWeight: 400,
          color: '#ffffff',
          backgroundColor: '#00000080',
          x: 50,
          y: 85,
          align: 'center',
          animation: 'fade',
          volume: 1,
          speed: 1,
          opacity: 1,
        };

        addClip(textTrack.id, textClip);
        createdCount++;
      }

      setProgress(`成功生成 ${createdCount} 条字幕`);
      setResult('done');
    } catch (e: unknown) {
      logger.error(LogCategory.VIDEO, '[GenerateSubtitle] 失败:', e);
      setProgress(`生成失败: ${e instanceof Error ? e.message : String(e)}`);
      setResult('error');
    } finally {
      setGenerating(false);
    }
  }, [description, shots]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl shadow-2xl w-[480px] max-w-full mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            AI 生成字幕
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1.5">
              视频内容描述{' '}
              <span className="text-[var(--text-muted)]">（可选，帮助 AI 理解视频主题）</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：一段关于故宫的旅游宣传片..."
              className="w-full h-20 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
              disabled={generating}
            />
          </div>

          {progress && (
            <div
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded ${
                result === 'done'
                  ? 'bg-green-500/10 text-green-500'
                  : result === 'error'
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
              }`}
            >
              {generating && <Loader2 className="w-3 h-3 animate-spin" />}
              {result === 'done' && <Check className="w-3 h-3" />}
              {result === 'error' && <AlertCircle className="w-3 h-3" />}
              {progress}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={generating}
              className="px-4 py-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              关闭
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-purple-500 rounded hover:bg-purple-600 disabled:opacity-40"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {generating ? '生成中...' : '生成字幕'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
