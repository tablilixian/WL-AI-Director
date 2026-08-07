import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { X, Loader2, Volume2, Check, AlertCircle } from 'lucide-react';
import { useTimelineStore } from '../../stores/timelineStore';
import { TextClip, AudioClip } from '../../types/editor';
import { getTTSProvider, TTSVoice } from '../../services/tts';
import { cleanDialogueText } from '../../utils/textUtils';
import { indexedDBService } from '../../services/indexedDB';
import { nanoid } from 'nanoid';

interface BatchTTSDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BatchTTSDialog: React.FC<BatchTTSDialogProps> = ({ isOpen, onClose }) => {
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<'idle' | 'done' | 'error'>('idle');
  const [clipStatus, setClipStatus] = useState<
    Record<string, 'pending' | 'generating' | 'done' | 'error'>
  >({});
  const voiceInitRef = useRef(false);

  const provider = useMemo(() => getTTSProvider(), []);

  useEffect(() => {
    provider
      .getVoices()
      .then(setVoices)
      .catch(() => {});
  }, [provider]);

  const textClips = useMemo(() => {
    const { tracks } = useTimelineStore.getState();
    const textTrack = tracks.find((t) => t.type === 'text');
    if (!textTrack) return [];
    return textTrack.clips.filter((c): c is TextClip => {
      const tc = c as TextClip;
      return tc.type === 'text' && !!tc.text?.trim();
    });
  }, [isOpen]);

  const pendingClips = useMemo(
    () =>
      textClips.filter((c) => !c.ttsStatus || c.ttsStatus === 'none' || c.ttsStatus === 'error'),
    [textClips, clipStatus],
  );

  const groups = useMemo(() => {
    const map = new Map<string, TextClip[]>();
    for (const clip of pendingClips) {
      const key = clip.character || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(clip);
    }
    return Array.from(map.entries()).map(([character, clips]) => ({
      character: character || '旁白',
      clips,
    }));
  }, [pendingClips]);

  // 初始化 voiceMap：每次打开对话框时，按角色设置默认语音
  useEffect(() => {
    if (!isOpen) {
      voiceInitRef.current = false;
      return;
    }
    if (voices.length === 0 || voiceInitRef.current) return;
    voiceInitRef.current = true;

    const defaults: Record<string, string> = {};
    for (const group of groups) {
      defaults[group.character] =
        voices.find((v) => v.id.includes('Xiaoxiao'))?.id || voices[0]?.id || '';
    }
    setVoiceMap(defaults);
  }, [isOpen, voices, groups]);

  const setCharacterVoice = useCallback((character: string, voiceId: string) => {
    setVoiceMap((prev) => ({ ...prev, [character]: voiceId }));
  }, []);

  const totalPending = pendingClips.length;

  const handleBatchGenerate = useCallback(async () => {
    if (totalPending === 0) return;

    setGenerating(true);
    setResult('idle');

    const initial: Record<string, 'pending' | 'generating' | 'done' | 'error'> = {};
    for (const clip of pendingClips) {
      initial[clip.id] = 'pending';
    }
    setClipStatus(initial);

    const { tracks, addClip, updateClip } = useTimelineStore.getState();
    const audioTrack = tracks.find((t) => t.type === 'audio');
    if (!audioTrack) {
      setProgress('未找到音频轨道');
      setResult('error');
      setGenerating(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingClips.length; i++) {
      const clip = pendingClips[i];
      const cleanText = cleanDialogueText(clip.text);
      const shortText = cleanText.slice(0, 20);
      const character = clip.character || '旁白';
      const voiceId = voiceMap[character];

      if (!voiceId) {
        console.warn(`[BatchTTS] ${character} 未选择语音，跳过`);
        setClipStatus((prev) => ({ ...prev, [clip.id]: 'error' }));
        failCount++;
        continue;
      }

      setClipStatus((prev) => ({ ...prev, [clip.id]: 'generating' }));
      setProgress(`生成中 (${i + 1}/${totalPending}): ${shortText}...`);
      updateClip(clip.id, { ttsStatus: 'generating' } as any);

      try {
        const blob = await provider.generate(cleanText, voiceId);
        const sourceId = `audio-${nanoid()}`;
        const audioFile = new File([blob], `${sourceId}.mp3`, { type: 'audio/mpeg' });
        await indexedDBService.saveFile(sourceId, audioFile);
        const url = URL.createObjectURL(blob);

        const audioClip: AudioClip = {
          id: `tts-${clip.id}-${Date.now()}`,
          trackId: audioTrack.id,
          sourceId,
          sourceType: 'audio',
          sourceUrl: url,
          name: `${shortText}配音`,
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

        updateClip(audioClip.id, { startTime: clip.startTime });

        // eslint-disable-next-line no-async-promise-executor
        await new Promise<void>(async (resolve) => {
          try {
            const audioEl = new Audio(url);
            audioEl.preload = 'metadata';
            let resolved = false;
            const timer = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve();
              }
            }, 5000);
            audioEl.onloadedmetadata = () => {
              if (resolved) return;
              resolved = true;
              clearTimeout(timer);
              const actualDurationMs = audioEl.duration * 1000;
              if (isFinite(actualDurationMs) && actualDurationMs > 0) {
                updateClip(clip.id, { duration: actualDurationMs } as any);
                updateClip(audioClip.id, { duration: actualDurationMs });
              }
              resolve();
            };
            audioEl.onerror = () => {
              if (resolved) return;
              resolved = true;
              clearTimeout(timer);
              resolve();
            };
          } catch {
            resolve();
          }
        });

        const voiceName = voices.find((v) => v.id === voiceId)?.name;
        updateClip(clip.id, {
          ttsStatus: 'done',
          ttsVoiceId: voiceId,
          ttsVoiceName: voiceName,
          ttsAudioClipId: audioClip.id,
        } as any);

        setClipStatus((prev) => ({ ...prev, [clip.id]: 'done' }));
        successCount++;
      } catch (e: any) {
        console.error(`[BatchTTS] ${shortText} 失败:`, e);
        updateClip(clip.id, { ttsStatus: 'error' } as any);
        setClipStatus((prev) => ({ ...prev, [clip.id]: 'error' }));
        failCount++;
      }
    }

    setProgress(`完成: ${successCount} 成功${failCount > 0 ? `，${failCount} 失败` : ''}`);
    setResult(failCount === 0 ? 'done' : 'error');
    setGenerating(false);
  }, [totalPending, pendingClips, voiceMap, provider, voices]);

  const handleClose = useCallback(() => {
    if (generating) return;
    onClose();
  }, [generating, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl shadow-2xl w-[520px] max-w-full mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-blue-400" />
            批量生成配音
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {groups.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
              没有待生成配音的字幕
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-3">
              {groups.map((group) => (
                <div
                  key={group.character}
                  className="bg-[var(--bg-secondary)] rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {group.character}
                      <span className="ml-1 text-[var(--text-muted)] font-normal">
                        ({group.clips.length} 段)
                      </span>
                    </span>
                    <select
                      value={voiceMap[group.character] || ''}
                      onChange={(e) => setCharacterVoice(group.character, e.target.value)}
                      disabled={generating}
                      className="w-44 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
                    >
                      <option value="">选择语音...</option>
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-0.5">
                    {group.clips.map((clip) => {
                      const st = clipStatus[clip.id] || 'pending';
                      return (
                        <div key={clip.id} className="flex items-center gap-2 py-0.5">
                          <div className="w-3.5 flex justify-center flex-shrink-0">
                            {st === 'generating' && (
                              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                            )}
                            {st === 'done' && <Check className="w-3 h-3 text-green-500" />}
                            {st === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                            {st === 'pending' && (
                              <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                            )}
                          </div>
                          <span className="text-[11px] text-[var(--text-primary)] truncate flex-1">
                            {cleanDialogueText(clip.text)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

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

          <div className="text-[10px] text-[var(--text-tertiary)]">引擎: {provider.name}</div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleClose}
              disabled={generating}
              className="px-4 py-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              关闭
            </button>
            <button
              onClick={handleBatchGenerate}
              disabled={generating || totalPending === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-40"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              {generating ? '生成中...' : `开始生成 (${totalPending})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
