// H3 提示词工作室（官方 base 模式：I2VA / FL2VA / L2VA）
// 独立功能：把画布中选中的图片作为首帧/尾帧/参考图，按 MiniMax H3 原生「指令行 + 3 字段」提示词生成视频。
// - 顶部模式三选一（首帧生视频 / 首尾帧 / 尾帧生视频）
// - 内嵌「提示词规则参考」完整呈现官方协议
// - 源图区随模式变化；生成路由 I2VA/L2VA→MSR、FL2VA→MKR
// 完全独立挂载，不修改 GenerateVideoPanel 任何逻辑；复用 canvasModelService.generateVideo 与 addLayer。
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useCanvasStore } from '../../hooks/useCanvasState';
import { canvasModelService } from '../../services/canvasModelService';
import { ResolvedImage } from '../ResolvedImage';
import { logger, LogCategory } from '../../../../../services/logger.ts';
import {
  H3_ASPECT_RATIOS,
  H3_ASPECT_DIMS,
  H3_PLACEHOLDERS,
  H3_DIALOGUE_LANGS,
  H3_CAMERA_MOTIONS,
  H3_CAMERA_MODIFIERS,
  H3_MODE_META,
  type H3Tab,
  type H3Dialogue,
  type H3LabConfig,
  type H3AspectRatio,
  type H3Mode,
  type H3ImageSpec,
} from './types';
import { buildH3Prompt } from './buildH3Prompt';
import { parseJsonSafe } from './h3SynopsisParse';
import { H3_SPEC_SYSTEM, H3_RULES, buildSynopsisPrompt } from './h3Spec';
import { X, Plus, Trash2, Wand2, Copy, Sparkles, Film, BookOpen } from 'lucide-react';

interface H3VideoLabProps {
  layerIds: string[];
  onClose: () => void;
}

type PickerTarget = 'primary' | 'secondary' | 'ref';

const uid = () => Math.random().toString(36).slice(2);

const TABS: { key: H3Tab; label: string }[] = [
  { key: 'description', label: '综合描述' },
  { key: 'soundscape', label: '声景' },
  { key: 'music', label: '音乐' },
  { key: 'dialogue', label: '对白' },
  { key: 'settings', label: '设置' },
];

/** 根据模式与所选图片，推导提示词的图片角色数组（顺序即 <Picture N>） */
function deriveImageSpecs(mode: H3Mode, refCount: number): H3ImageSpec[] {
  if (mode === 'fl2va') return [{ role: 'first' }, { role: 'last' }];
  const primary: H3ImageSpec = { role: mode === 'l2va' ? 'last' : 'first' };
  const refs: H3ImageSpec[] = Array.from({ length: refCount }, () => ({ role: 'ref' as const }));
  return [primary, ...refs];
}

export const H3VideoLab: React.FC<H3VideoLabProps> = ({ layerIds, onClose }) => {
  const { layers } = useCanvasStore();

  // ── 模式（默认：选中 2+ 张 → 首尾帧，否则首帧生视频）──
  const [mode, setMode] = useState<H3Mode>(layerIds.length >= 2 ? 'fl2va' : 'i2va');

  // ── 源图：主图（按模式标为首帧/尾帧）+ 尾帧（仅 FL2VA）+ 参考图 ──
  const [primaryId, setPrimaryId] = useState<string | null>(layerIds[0] ?? null);
  const [secondaryId, setSecondaryId] = useState<string | null>(layerIds[1] ?? null);
  const [referenceIds, setReferenceIds] = useState<string[]>(layerIds.slice(2));
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  // ── H3 配置状态（base 模式：指令行 + 3 字段）──
  const [description, setDescription] = useState('');
  const [soundscape, setSoundscape] = useState('');
  const [music, setMusic] = useState('');
  const [dialogues, setDialogues] = useState<H3Dialogue[]>([]);
  const [dialogueLang, setDialogueLang] = useState<string>('Chinese');
  const [promptLang, setPromptLang] = useState<'en' | 'zh'>('en');
  const [durationSec, setDurationSec] = useState(8);
  const [aspectRatio, setAspectRatio] = useState<H3AspectRatio>('16:9');

  const [activeTab, setActiveTab] = useState<H3Tab>('description');
  const [showRules, setShowRules] = useState(true);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // ── 生成状态 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  // ── AI 助手状态 ──
  const [showSynopsis, setShowSynopsis] = useState(false);
  const [synopsisText, setSynopsisText] = useState('');
  const [isAssisting, setIsAssisting] = useState(false);

  const meta = H3_MODE_META[mode];

  const primaryLayer = useMemo(
    () => (primaryId ? layers.find((l) => l.id === primaryId) : undefined),
    [layers, primaryId],
  );
  const secondaryLayer = useMemo(
    () => (secondaryId ? layers.find((l) => l.id === secondaryId) : undefined),
    [layers, secondaryId],
  );
  const refLayers = useMemo(
    () =>
      referenceIds
        .map((id) => layers.find((l) => l.id === id))
        .filter((l): l is NonNullable<typeof l> => !!l),
    [layers, referenceIds],
  );

  // 校验：所需图片是否齐备
  const hasRequired = !!primaryLayer?.src && (mode !== 'fl2va' || !!secondaryLayer?.src);

  const imageSpecs = useMemo(
    () => deriveImageSpecs(mode, refLayers.length),
    [mode, refLayers.length],
  );

  const config: H3LabConfig = useMemo(
    () => ({
      mode,
      images: imageSpecs,
      description,
      soundscape,
      music,
      dialogues,
      dialogueLang,
      promptLang,
      durationSec,
      aspectRatio,
    }),
    [
      mode,
      imageSpecs,
      description,
      soundscape,
      music,
      dialogues,
      dialogueLang,
      promptLang,
      durationSec,
      aspectRatio,
    ],
  );

  const previewPrompt = useMemo(() => buildH3Prompt(config), [config]);

  const candidateImages = useMemo(
    () =>
      layers.filter(
        (l) =>
          l.type === 'image' &&
          !l.isLoading &&
          l.id !== primaryId &&
          l.id !== secondaryId &&
          !referenceIds.includes(l.id),
      ),
    [layers, primaryId, secondaryId, referenceIds],
  );

  const handlePickImage = useCallback(
    (id: string) => {
      if (pickerTarget === 'primary') setPrimaryId(id);
      else if (pickerTarget === 'secondary') setSecondaryId(id);
      else if (referenceIds.length < 4) setReferenceIds((prev) => [...prev, id]);
      setPickerTarget(null);
    },
    [pickerTarget, secondaryId, referenceIds],
  );

  const insertAtCaret = useCallback(
    (text: string) => {
      const el = descRef.current;
      if (!el) {
        setDescription((d) => d + text);
        return;
      }
      const start = el.selectionStart ?? description.length;
      const end = el.selectionEnd ?? description.length;
      const next = description.slice(0, start) + text + description.slice(end);
      setDescription(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + text.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [description],
  );

  // ── AI 从梗概生成 ──
  const handleAssist = useCallback(async () => {
    const synopsis = synopsisText.trim();
    if (!synopsis || isAssisting) return;
    setIsAssisting(true);
    try {
      const { chatCompletion } = await import('../../../../../services/ai/apiCore');
      const basePrompt = buildSynopsisPrompt(synopsis, mode, dialogueLang, promptLang);
      // 首次尝试（wldramallm provider 不会强制 json_object，依赖容错解析兜底）
      let res = await chatCompletion(
        basePrompt,
        undefined,
        0.7,
        8192,
        'json_object',
        600000,
        H3_SPEC_SYSTEM,
      );
      let data = parseJsonSafe(res || '');
      if (!data) {
        // 重试一次：追加更硬约束，降低散文包裹/截断概率
        const retryPrompt = `${basePrompt}\n\nCRITICAL: Return ONLY a raw JSON object — no markdown fences, no explanatory text before or after. Keys must be exactly: description, soundscape, music, dialogues.`;
        res = await chatCompletion(
          retryPrompt,
          undefined,
          0.5,
          8192,
          'json_object',
          600000,
          H3_SPEC_SYSTEM,
        );
        data = parseJsonSafe(res || '');
      }
      if (data) {
        if (data.description) setDescription(data.description);
        if (data.soundscape) setSoundscape(data.soundscape);
        if (data.music) setMusic(data.music);
        if (data.dialogues.length) {
          setDialogues(
            data.dialogues.map((d) => ({
              id: uid(),
              timestamp: Number(d.timestamp) || 0,
              character: String(d.character ?? ''),
              text: String(d.text ?? ''),
            })),
          );
        }
        if (!data.description && !data.soundscape && !data.music && data.dialogues.length === 0) {
          // 解析成功但全空：保留手动填写，并展示原始返回便于排查
          alert(
            `AI 返回的 JSON 字段均为空，已为你保留手动填写。\n\n【模型原始返回前 600 字】\n${(res || '').slice(0, 600)}`,
          );
        }
        setShowSynopsis(false);
        setActiveTab('description');
      } else {
        // 完全解析不出 JSON：展示原始返回，便于定位是「散文包裹 / 截断 / 键名不对」
        alert(
          `AI 未能返回有效 JSON，请重试或手动填写。\n\n【模型原始返回前 800 字，便于排查】\n${(res || '').slice(0, 800)}`,
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`生成失败: ${msg}`);
    } finally {
      setIsAssisting(false);
    }
  }, [synopsisText, isAssisting, mode, dialogueLang, promptLang]);

  // ── 生成视频 ──
  const handleGenerate = useCallback(async () => {
    if (!hasRequired || isGenerating) return;
    setIsGenerating(true);
    setProgress(0);
    setProgressLabel('正在生成视频...');
    try {
      const prompt = buildH3Prompt(config);
      const primary = primaryLayer;
      if (!primary?.src) return;
      const startImage = primary.src;
      let endImage: string | undefined;
      let allImages: string[] = [];

      if (mode === 'fl2va') {
        const sec = secondaryLayer;
        if (!sec?.src) return;
        endImage = sec.src;
        allImages = [startImage, endImage];
      } else {
        // I2VA / L2VA：主图作 startImage（L2VA 时该图即尾帧，由指令行锚定到结尾），参考图顺延
        endImage = undefined;
        allImages = [startImage, ...refLayers.map((l) => l.src).filter((s): s is string => !!s)];
      }

      const videoUrl = await canvasModelService.generateVideo({
        prompt,
        startImage,
        endImage,
        referenceImages: allImages,
        aspectRatio: config.aspectRatio,
        duration: config.durationSec,
        onProgress: (p) => setProgress(p),
      });

      setProgressLabel('处理视频文件...');
      setProgress(90);

      let finalSrc = videoUrl;
      let videoId: string | undefined;
      if (videoUrl.startsWith('local:')) {
        videoId = videoUrl.replace('local:', '');
        finalSrc = videoUrl;
      } else if (videoUrl.startsWith('video:')) {
        videoId = videoUrl.replace('video:', '');
        finalSrc = videoUrl;
      } else if (videoUrl.startsWith('data:')) {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const { videoStorageService } = await import('../../../../../services/imageStorageService');
        const vidId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await videoStorageService.saveVideo(vidId, blob);
        videoId = vidId;
        finalSrc = `video:${vidId}`;
      } else {
        try {
          const { videoStorageService } =
            await import('../../../../../services/imageStorageService');
          const dl = videoUrl.includes('maas-watermark-prod-new.cn-wlcb.ufileos.com')
            ? videoUrl.replace(
                'https://maas-watermark-prod-new.cn-wlcb.ufileos.com',
                '/video-proxy',
              )
            : videoUrl.includes('aigc-files.bigmodel.cn')
              ? videoUrl.replace('https://aigc-files.bigmodel.cn', '/bigmodel-files')
              : videoUrl;
          const response = await fetch(dl);
          if (!response.ok) throw new Error(`下载失败: ${response.status}`);
          const blob = await response.blob();
          const vidId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          await videoStorageService.saveVideo(vidId, blob);
          videoId = vidId;
          finalSrc = `video:${vidId}`;
        } catch {
          finalSrc = videoUrl;
        }
      }

      const [w, h] = H3_ASPECT_DIMS[config.aspectRatio] ?? [1280, 720];
      const { addLayer } = useCanvasStore.getState();
      const srcForPos = primary;
      addLayer({
        id: crypto.randomUUID(),
        type: 'video',
        x: srcForPos.x ?? 100,
        y: (srcForPos.y ?? 100) + (srcForPos.height ?? 400) + 40,
        width: w,
        height: h,
        src: finalSrc,
        imageId: videoId,
        title: 'H3 图生视频',
        createdAt: Date.now(),
        sourceLayerId: primaryId ?? undefined,
        sourceLayerIds: [primaryId, secondaryId, ...referenceIds].filter((x): x is string => !!x),
        operationType: 'image-to-video',
        duration: config.durationSec,
        generationPrompt: JSON.stringify(config),
      });

      setProgress(100);
      setProgressLabel('生成完成！');
      setTimeout(() => onClose(), 1000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.CANVAS, 'H3 视频生成失败:', e);
      alert(`生成失败: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  }, [
    hasRequired,
    isGenerating,
    mode,
    primaryLayer,
    secondaryLayer,
    refLayers,
    primaryId,
    secondaryId,
    referenceIds,
    config,
    onClose,
  ]);

  const copyPrompt = useCallback(() => {
    navigator.clipboard?.writeText(previewPrompt).catch(() => undefined);
  }, [previewPrompt]);

  // ── 空状态 ──
  if (!primaryLayer) {
    return (
      <div className="fixed right-0 top-0 h-full w-[460px] bg-gray-900 border-l border-gray-700 z-[200] flex flex-col">
        <Header mode={mode} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">
          未找到图片图层，请在画布中选择一张图片后重试。
        </div>
      </div>
    );
  }

  const primaryRing = mode === 'l2va' ? 'ring-cyan-500' : 'ring-violet-500';

  return (
    <div className="fixed right-0 top-0 h-full w-[460px] bg-gray-900 border-l border-gray-700 z-[200] flex flex-col text-gray-200">
      <Header mode={mode} onClose={onClose} />

      {/* 模式选择 */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/60">
        <div className="text-xs text-gray-400 mb-2">生成模式（图生视频 base 模式）</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(H3_MODE_META) as H3Mode[]).map((m) => {
            const mm = H3_MODE_META[m];
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex flex-col items-start px-2 py-1.5 rounded-lg border text-left transition-colors ${
                  mode === m
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="text-xs font-medium">{mm.label}</span>
                <span className={`text-[10px] ${mode === m ? 'text-violet-100' : 'text-gray-500'}`}>
                  {mm.en}
                </span>
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-gray-500 mt-2">{meta.desc}</div>
      </div>

      {/* 源图区（模式感知） */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/40">
        <div className="text-xs text-gray-400 mb-2">
          源图（{meta.primaryLabel}必选{meta.needsLast ? '，尾帧必选' : ''}）
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <Thumb label={meta.primaryLabel} layer={primaryLayer} ring={primaryRing} />
            <button
              onClick={() => setPickerTarget('primary')}
              className="text-[10px] text-gray-400 hover:text-violet-300 mt-0.5"
            >
              重选
            </button>
          </div>
          <div className="flex-1">
            {mode === 'fl2va' ? (
              secondaryLayer ? (
                <div className="flex items-center gap-2">
                  <Thumb label="尾帧" layer={secondaryLayer} ring="ring-cyan-500" small />
                  <button
                    onClick={() => setSecondaryId(null)}
                    className="text-xs text-gray-400 hover:text-red-400"
                  >
                    移除
                  </button>
                </div>
              ) : (
                <div className="text-xs text-amber-400">未设置尾帧（FL2VA 必需）</div>
              )
            ) : (
              <div className="text-xs text-gray-500">
                {mode === 'l2va' ? '视频将向此尾帧收敛' : '视频从首帧向前发展'}
              </div>
            )}

            {meta.supportsRef && (
              <div className="mt-2 flex flex-wrap gap-1">
                {refLayers.map((l) => (
                  <div key={l.id} className="relative group">
                    <div className="w-10 h-10 rounded border border-gray-700 overflow-hidden">
                      <ResolvedImage
                        src={l.src ?? ''}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() => setReferenceIds((prev) => prev.filter((id) => id !== l.id))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] leading-4 hidden group-hover:block"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setPickerTarget(mode === 'fl2va' ? 'secondary' : 'ref')}
              disabled={mode === 'fl2va' && !!secondaryId}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40"
            >
              <Plus className="w-3 h-3" /> {mode === 'fl2va' ? '尾帧' : '参考图'}
            </button>
            {pickerTarget && (
              <div className="absolute right-0 mt-1 w-56 max-h-64 overflow-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2 z-10">
                {candidateImages.length === 0 ? (
                  <div className="text-xs text-gray-500 p-2">
                    {mode === 'fl2va' ? '画布中无其他图片可作尾帧' : '画布中无其他图片可作参考'}
                  </div>
                ) : (
                  candidateImages.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => handlePickImage(l.id)}
                      className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-gray-700 text-left"
                    >
                      <div className="w-8 h-8 rounded overflow-hidden bg-gray-700 shrink-0">
                        <ResolvedImage
                          src={l.src ?? ''}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-xs text-gray-300 truncate">{l.title || '图片'}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 规则参考（可折叠，呈现完整 H3 提示词规则） */}
      <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/30">
        <button
          onClick={() => setShowRules((v) => !v)}
          className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
        >
          <BookOpen className="w-3.5 h-3.5" /> H3 提示词规则
          <span className="text-gray-500">{showRules ? '（收起）' : '（展开）'}</span>
        </button>
        {showRules && (
          <div className="mt-2 space-y-2 text-[11px] text-gray-400 leading-relaxed max-h-56 overflow-auto pr-1">
            <div>
              <div className="text-gray-300 font-medium mb-0.5">通用规则</div>
              <ul className="list-disc list-inside space-y-0.5">
                {H3_RULES.general.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-gray-300 font-medium mb-0.5">三个字段</div>
              <ul className="space-y-0.5">
                {H3_RULES.fields.map((f) => (
                  <li key={f.name}>
                    <code className="text-emerald-300">{f.name}</code>：{f.desc}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-gray-300 font-medium mb-0.5">对白 / 时间 / 运镜</div>
              <div>对白：{H3_RULES.dialogue}</div>
              <div>时间：{H3_RULES.time}</div>
              <div>运镜：{H3_RULES.camera}</div>
            </div>
            <div className="border-t border-gray-800 pt-1.5">
              <div className="text-violet-300 font-medium mb-0.5">当前模式 · {meta.en}</div>
              <div>{H3_RULES.modes[mode]}</div>
            </div>
          </div>
        )}
      </div>

      {/* 标签页 */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-800 bg-gray-900">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              activeTab === t.key
                ? 'bg-violet-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 标签内容 */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {activeTab === 'description' && (
          <Section title="综合多模态描述 (integrated_multimodal_description)">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-500">
                英文描述体，按播放顺序写视觉/动作/运镜/声音
              </span>
            </div>
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={H3_PLACEHOLDERS.description}
              rows={10}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm resize-none font-mono leading-relaxed"
            />
            <div className="text-[11px] text-gray-500">
              首帧锚点：<code className="text-gray-300">&lt;Picture 1&gt;</code> ｜ 分镜时间：
              <code className="text-gray-300">[Shot 2] At 00:03.500,</code> ｜ 对白：
              <code className="text-gray-300">{`<d>[${dialogueLang}] 文本</d>`}</code>
            </div>

            {/* 运镜词插入助手 */}
            <div className="mt-2">
              <div className="text-[11px] text-gray-500 mb-1">
                运镜词（点击插入，建议补全幅度/速度）
              </div>
              <div className="flex flex-wrap gap-1">
                {H3_CAMERA_MOTIONS.map((m) => (
                  <button
                    key={m}
                    onClick={() => insertAtCaret(`${m} `)}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-violet-300"
                    title={m}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {H3_CAMERA_MODIFIERS.map((m) => (
                  <button
                    key={m}
                    onClick={() => insertAtCaret(` ${m} `)}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-violet-300"
                    title={m}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                onClick={() => insertAtCaret(`<d>[${dialogueLang}] </d>`)}
                className="mt-1.5 text-[11px] text-violet-400 hover:text-violet-300"
              >
                插入对白标签
              </button>
            </div>
          </Section>
        )}

        {activeTab === 'soundscape' && (
          <Section title="整体声景 (overall_soundscape)">
            <textarea
              value={soundscape}
              onChange={(e) => setSoundscape(e.target.value)}
              placeholder={H3_PLACEHOLDERS.soundscape}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm resize-none"
            />
            <div className="text-[11px] text-gray-500">
              英文 1–4 句：环境音 + 物理动作声 + 非语言人声（不含对白）。无则填 N/A。
            </div>
          </Section>
        )}

        {activeTab === 'music' && (
          <Section title="非叙事性音乐 (non_diegetic_music)">
            <textarea
              value={music}
              onChange={(e) => setMusic(e.target.value)}
              placeholder={H3_PLACEHOLDERS.music}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm resize-none"
            />
            <div className="text-[11px] text-gray-500">
              英文 1–3 句，仅观众可闻的配乐（乐器/节奏/动态）。无则填 N/A。
            </div>
          </Section>
        )}

        {activeTab === 'dialogue' && (
          <Section title="对白 (<d> 标签，按时间自动转为镜头行)">
            {dialogues.map((d) => (
              <div key={d.id} className="flex gap-2 items-start">
                <input
                  type="number"
                  step="0.1"
                  value={d.timestamp}
                  onChange={(e) =>
                    setDialogues((p) =>
                      p.map((x) =>
                        x.id === d.id ? { ...x, timestamp: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  placeholder="秒"
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                />
                <input
                  value={d.character}
                  onChange={(e) =>
                    setDialogues((p) =>
                      p.map((x) => (x.id === d.id ? { ...x, character: e.target.value } : x)),
                    )
                  }
                  placeholder="角色"
                  className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                />
                <input
                  value={d.text}
                  onChange={(e) =>
                    setDialogues((p) =>
                      p.map((x) => (x.id === d.id ? { ...x, text: e.target.value } : x)),
                    )
                  }
                  placeholder={H3_PLACEHOLDERS.dialogueText}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                />
                <button
                  onClick={() => setDialogues((p) => p.filter((x) => x.id !== d.id))}
                  className="text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setDialogues((p) => [...p, { id: uid(), timestamp: 0, character: '', text: '' }])
              }
              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
            >
              <Plus className="w-3 h-3" /> 添加对白
            </button>
            <div className="text-[11px] text-gray-500">
              生成时按时间排序，自动追加为{' '}
              <code className="text-gray-300">
                [Shot N] At MM:SS.mmm, 角色 says: &lt;d&gt;[{dialogueLang}] 文本&lt;/d&gt;
              </code>
              。 若已在「综合描述」内联写了对白，请勿重复填写。
            </div>
          </Section>
        )}

        {activeTab === 'settings' && (
          <Section title="设置 & 提示词预览">
            <div className="flex items-center gap-4">
              <label className="text-xs text-gray-400">时长 {durationSec}s</label>
              <input
                type="range"
                min={3}
                max={16}
                step={1}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {H3_ASPECT_RATIOS.map((r) => (
                <button
                  key={r}
                  onClick={() => setAspectRatio(r)}
                  className={`px-2 py-1 text-xs rounded border ${
                    aspectRatio === r
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-400">对白语言</span>
              <select
                value={dialogueLang}
                onChange={(e) => setDialogueLang(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
              >
                {H3_DIALOGUE_LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-gray-500">（&lt;d&gt; 标签用）</span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-400">描述语言</span>
              <div className="flex gap-1">
                {(['en', 'zh'] as const).map((lg) => (
                  <button
                    key={lg}
                    onClick={() => setPromptLang(lg)}
                    className={`px-2 py-1 text-xs rounded border ${
                      promptLang === lg
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                    }`}
                  >
                    {lg === 'en' ? '英文(推荐)' : '中文'}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-gray-500">H3 按英文结构调参</span>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">H3 提示词预览</span>
                <button
                  onClick={copyPrompt}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
                >
                  <Copy className="w-3 h-3" /> 复制
                </button>
              </div>
              <pre className="w-full max-h-72 overflow-auto bg-gray-950 border border-gray-800 rounded p-2 text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap">
                {previewPrompt || '（填写综合描述后实时生成）'}
              </pre>
            </div>
          </Section>
        )}
      </div>

      {/* 底部：AI 助手 + 生成 */}
      <div className="border-t border-gray-800 p-3 bg-gray-900">
        {isGenerating && (
          <div className="mb-2">
            <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[11px] text-gray-400 mt-1">{progressLabel}</div>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setShowSynopsis((v) => !v)}
            disabled={isGenerating}
            className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 disabled:opacity-50"
          >
            <Wand2 className="w-4 h-4 text-violet-400" /> 从梗概生成
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !hasRequired}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-50"
          >
            <Film className="w-4 h-4" /> {isGenerating ? '生成中...' : '生成视频'}
          </button>
        </div>

        {showSynopsis && (
          <div className="mt-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">
              输入剧情梗概，AI 按 H3 官方协议生成各段字段（{meta.label}）
            </div>
            <textarea
              value={synopsisText}
              onChange={(e) => setSynopsisText(e.target.value)}
              placeholder="例如：一对年轻情侣在午后咖啡厅依偎，男孩握住女孩的手说时间能停下就好了，最后两人靠在一起"
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-sm resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAssist}
                disabled={isAssisting || !synopsisText.trim()}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm rounded bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" /> {isAssisting ? '生成中...' : '生成'}
              </button>
              <button
                onClick={() => setShowSynopsis(false)}
                className="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function Header({ mode, onClose }: { mode: H3Mode; onClose: () => void }) {
  const badge = `${H3_MODE_META[mode].en} · ${H3_MODE_META[mode].label}`;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <span className="text-violet-400 text-lg">🎬</span>
        <h2 className="text-sm font-semibold text-gray-100">H3 提示词工作室</h2>
        <span className="text-[10px] text-gray-300 border border-gray-700 rounded px-1 py-0.5 bg-gray-800">
          {badge}
        </span>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-white">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

function Thumb({
  label,
  layer,
  ring,
  small,
}: {
  label: string;
  layer: { src?: string; title?: string };
  ring: string;
  small?: boolean;
}) {
  const size = small ? 'w-12 h-12' : 'w-16 h-16';
  return (
    <div className="text-center shrink-0">
      <div
        className={`${size} rounded-lg overflow-hidden border border-gray-700 ring-2 ${ring} bg-gray-800`}
      >
        {layer.src ? (
          <ResolvedImage src={layer.src} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>
      <div className="text-[10px] text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-300 mb-1.5">{title}</div>
      {children}
    </div>
  );
}
