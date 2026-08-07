import React, { useState, useEffect, useCallback } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Volume2,
  FileAudio,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { TextClip, TextAnimation, AudioClip } from '../../../types/editor';
import { getTTSProvider, TTSVoice } from '../../../services/tts';
import { useTimelineStore } from '../../../stores/timelineStore';
import { indexedDBService } from '../../../services/indexedDB';
import { nanoid } from 'nanoid';
import { logger, LogCategory } from '../../../../services/logger.ts';

interface TextEditorProps {
  clip: TextClip;
  onUpdate: (updates: Partial<TextClip>) => void;
  onClose?: () => void;
}

const FONTS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, serif', label: 'Times' },
  { value: 'Courier New, monospace', label: 'Courier' },
  { value: 'Microsoft YaHei, sans-serif', label: '微软雅黑' },
];

const ANIMATIONS: { value: TextAnimation; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'fade', label: '淡入' },
  { value: 'slide', label: '滑入' },
  { value: 'pop', label: '弹出' },
];

export const TextEditor: React.FC<TextEditorProps> = ({ clip, onUpdate, onClose }) => {
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [generating, setGenerating] = useState(false);

  const provider = getTTSProvider();

  useEffect(() => {
    provider
      .getVoices()
      .then(setVoices)
      .catch(() => {});
  }, [provider]);

  const handleTextChange = useCallback(
    (text: string) => {
      if (clip.ttsStatus === 'done' && clip.text !== text) {
        onUpdate({ text, ttsStatus: 'none', ttsAudioClipId: undefined });
      } else {
        onUpdate({ text });
      }
    },
    [clip, onUpdate],
  );

  const handleSpeak = useCallback(async () => {
    if (!clip.text || speaking) return;
    setSpeaking(true);
    try {
      await provider.speak(clip.text, selectedVoice ?? '');
    } catch (e) {
      logger.warn(LogCategory.VIDEO, '[TTS] 试听失败:', e);
    } finally {
      setSpeaking(false);
    }
  }, [clip.text, selectedVoice, speaking, provider]);

  const handleGenerate = useCallback(async () => {
    if (!clip.text || generating) return;
    setGenerating(true);
    onUpdate({ ttsStatus: 'generating' });
    try {
      const blob = await provider.generate(clip.text, selectedVoice);

      const sourceId = `audio-${nanoid()}`;
      const audioFile = new File([blob], `${sourceId}.mp3`, { type: 'audio/mpeg' });
      await indexedDBService.saveFile(sourceId, audioFile);

      const url = URL.createObjectURL(blob);

      const addClip = useTimelineStore.getState().addClip;
      const tracks = useTimelineStore.getState().tracks;
      const audioTrack = tracks.find((t) => t.type === 'audio');
      if (!audioTrack) {
        throw new Error('未找到音频轨道');
      }

      const audioClip: AudioClip = {
        id: `tts-${clip.id}-${Date.now()}`,
        trackId: audioTrack.id,
        sourceId,
        sourceType: 'audio',
        sourceUrl: url,
        name: `${clip.text.slice(0, 20)}配音`,
        startTime: clip.startTime,
        duration: clip.duration,
        inPoint: 0,
        outPoint: clip.duration,
        type: 'audio',
        volume: 1,
        speed: 1,
        opacity: 1,
        fadeIn: 0,
        fadeOut: 100,
      };

      addClip(audioTrack.id, audioClip);

      onUpdate({
        ttsStatus: 'done',
        ttsVoiceId: selectedVoice,
        ttsVoiceName: voices.find((v) => v.id === selectedVoice)?.name,
        ttsAudioClipId: audioClip.id,
      });
    } catch (e: any) {
      logger.error(LogCategory.VIDEO, '[TTS] 生成配音失败:', e);
      onUpdate({ ttsStatus: 'error' });
      alert(`配音生成失败: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  }, [
    clip.text,
    clip.startTime,
    clip.duration,
    clip.id,
    selectedVoice,
    generating,
    voices,
    onUpdate,
  ]);

  return (
    <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">文字编辑</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            ×
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--text-tertiary)] mb-1">文字内容</label>
          <textarea
            value={clip.text}
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full h-20 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
            placeholder="输入字幕内容..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">字体</label>
            <select
              value={clip.fontFamily}
              onChange={(e) => onUpdate({ fontFamily: e.target.value })}
              className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
            >
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">字号</label>
            <input
              type="number"
              value={clip.fontSize}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
              min={12}
              max={200}
              className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">颜色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={clip.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer"
              />
              <input
                type="text"
                value={clip.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="flex-1 px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">背景</label>
            <input
              type="color"
              value={(clip.backgroundColor || '#000000').slice(0, 7)}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
              className="w-full h-8 rounded cursor-pointer"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-tertiary)] mb-1">对齐</label>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => onUpdate({ align })}
                className={`flex-1 p-2 rounded ${
                  clip.align === align
                    ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {align === 'left' && <AlignLeft className="w-4 h-4 mx-auto" />}
                {align === 'center' && <AlignCenter className="w-4 h-4 mx-auto" />}
                {align === 'right' && <AlignRight className="w-4 h-4 mx-auto" />}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">X 位置 (%)</label>
            <input
              type="number"
              value={clip.x}
              onChange={(e) => onUpdate({ x: Number(e.target.value) })}
              min={0}
              max={100}
              className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">Y 位置 (%)</label>
            <input
              type="number"
              value={clip.y}
              onChange={(e) => onUpdate({ y: Number(e.target.value) })}
              min={0}
              max={100}
              className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-tertiary)] mb-1">动画</label>
          <select
            value={clip.animation || 'none'}
            onChange={(e) => onUpdate({ animation: e.target.value as TextAnimation })}
            className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
          >
            {ANIMATIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── TTS 配音 ─── */}
      <div className="border-t border-[var(--border-subtle)] pt-4 space-y-3">
        <h4 className="text-xs font-medium text-[var(--text-primary)]">AI 配音</h4>

        <div>
          <label className="block text-xs text-[var(--text-tertiary)] mb-1">语音</label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="">选择语音...</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSpeak}
            disabled={!clip.text || !selectedVoice || speaking}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {speaking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            试听
          </button>

          {provider.supportsGenerate && (
            <button
              onClick={handleGenerate}
              disabled={!clip.text || !selectedVoice || generating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileAudio className="w-3.5 h-3.5" />
              )}
              生成配音
            </button>
          )}
        </div>

        {clip.ttsStatus && clip.ttsStatus !== 'none' && (
          <div className="flex items-center gap-1.5 text-xs">
            {clip.ttsStatus === 'generating' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)]">生成中...</span>
              </>
            )}
            {clip.ttsStatus === 'done' && (
              <>
                <Check className="w-3 h-3 text-green-500" />
                <span className="text-green-500">配音已生成</span>
              </>
            )}
            {clip.ttsStatus === 'error' && (
              <>
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-red-500">生成失败</span>
              </>
            )}
          </div>
        )}

        <div className="text-[10px] text-[var(--text-tertiary)]">
          引擎: {provider.name}
          {!provider.supportsGenerate && <span className="ml-1">（仅试听，不生成音频文件）</span>}
        </div>
      </div>
    </div>
  );
};
