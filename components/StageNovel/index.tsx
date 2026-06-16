import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, FileText, Upload, Loader2, ChevronRight, BookOpen, Users,
  Image, Package, Globe,   Check, CheckCircle, AlertCircle, ArrowLeft, ArrowRight,
  File as FileIcon, Clock,
} from 'lucide-react';
import { NovelAnalysis, NovelChapter, NovelCharacter, NovelScene, NovelItem, WorldSetting, ScriptAdaptation } from '../../types/novel';
import { ProjectState } from '../../types';
import { parseNovelFile } from '../../services/novel/novelFileParser';
import { splitChaptersByAI, analyzeNovel, analyzeSingleChapter } from '../../services/ai/novelAnalysisService';
import { adaptToScript, AdaptationResult } from '../../services/ai/novelScriptAdaptationService';
import { saveNovelAnalysis, getAllNovelAnalyses } from '../../services/novel/novelStorageService';
import { createNewProjectState } from '../../services/storageService';

type Step = 'upload' | 'analyzing' | 'browse' | 'adapt' | 'createProject';
type BrowseTab = 'chapters' | 'characters' | 'scenes' | 'items' | 'world';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: ProjectState) => void;
}

const STEP_LABELS: Record<Step, string> = {
  upload: '上传小说',
  analyzing: 'AI 分析',
  browse: '浏览结果',
  adapt: '剧本改编',
  createProject: '创建项目',
};

const STEP_ORDER: Step[] = ['upload', 'analyzing', 'browse', 'adapt', 'createProject'];

const NovelAnalysisModal: React.FC<Props> = ({ isOpen, onClose, onCreateProject }) => {
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [processingMsg, setProcessingMsg] = useState('');
  const [processingLogs, setProcessingLogs] = useState<string[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [parsedChapters, setParsedChapters] = useState<{ title: string; content: string }[]>([]);
  const [splitDone, setSplitDone] = useState(false);
  const [splitChapters, setSplitChapters] = useState<{ index: number; title: string; content: string }[]>([]);
  const [novelAnalysis, setNovelAnalysis] = useState<NovelAnalysis | null>(null);
  const [adaptationResult, setAdaptationResult] = useState<AdaptationResult | null>(null);

  const [browseTab, setBrowseTab] = useState<BrowseTab>('chapters');
  const [selectedChapterIndices, setSelectedChapterIndices] = useState<number[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [adaptStrategy, setAdaptStrategy] = useState('忠实还原原著风格，重点突出主要情节和角色冲突');
  const [adaptLogs, setAdaptLogs] = useState<string[]>([]);
  const [adaptedChapterIndices, setAdaptedChapterIndices] = useState<number[]>([]);

  const [existingAnalyses, setExistingAnalyses] = useState<NovelAnalysis[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessing = step === 'analyzing';
  const currentStepIdx = STEP_ORDER.indexOf(step);

  useEffect(() => {
    if (isOpen) {
      getAllNovelAnalyses().then(setExistingAnalyses).catch(() => {});
    }
  }, [isOpen]);

  const addLog = useCallback((msg: string) => {
    setProcessingLogs(prev => [...prev.slice(-49), msg]);
  }, []);

  const reset = useCallback(() => {
    setStep('upload');
    setError(null);
    setProcessingMsg('');
    setProcessingLogs([]);
    setFile(null);
    setParsedChapters([]);
    setSplitDone(false);
    setSplitChapters([]);
    setNovelAnalysis(null);
    setAdaptationResult(null);
    setBrowseTab('chapters');
    setSelectedChapterIndices([]);
    setSelectedSceneIds([]);
    setAdaptLogs([]);
    setAdaptedChapterIndices([]);
  }, []);

  const handleClose = () => {
    if (isProcessing) return;
    reset();
    onClose();
  };

  const handleFileSelect = async (f: File) => {
    setError(null);
    setFile(f);
  };

  const handleResumeAnalysis = async (analysis: NovelAnalysis) => {
    setNovelAnalysis(analysis);
    setSelectedChapterIndices(analysis.chapters.map(ch => ch.index));
    setSelectedSceneIds(analysis.keyScenes.map(s => s.id));
    setStep('browse');
  };

  const handleSplitChapters = async () => {
    if (!file) return;
    setError(null);
    setProcessingLogs([]);
    setProcessingMsg('正在解析和拆分章节...');

    try {
      addLog('正在解析文件...');
      const parsed = await parseNovelFile(file);
      addLog(`文件解析完成，共 ${parsed.chapters.length} 个章节片段`);

      setParsedChapters(parsed.chapters);

      addLog('正在通过 AI 拆分章节...');
      let chapters: { index: number; title: string; content: string }[];

      if (parsed.chapters.length <= 1) {
        chapters = await splitChaptersByAI(parsed.rawText, undefined, addLog);
      } else {
        chapters = parsed.chapters.map((ch, i) => ({ ...ch, index: i + 1 }));
        addLog(`使用文件固有章节结构，共 ${chapters.length} 章`);
      }

      setSplitChapters(chapters);
      setSplitDone(true);
      setProcessingMsg(`章节拆分完成，共 ${chapters.length} 章`);
    } catch (err: any) {
      setError(err.message || '章节拆分失败');
    }
  };

  const handleRunAnalysis = async () => {
    if (!file || splitChapters.length === 0) return;
    setStep('analyzing');
    setError(null);
    setProcessingLogs([]);

    try {
      const chapters = splitChapters;

      addLog('正在逐章提取摘要...');
      const chaptersWithSummary: NovelChapter[] = [];
      for (let i = 0; i < Math.min(chapters.length, 50); i++) {
        const ch = chapters[i];
        addLog(`分析第${ch.index}章...`);
        const result = await analyzeSingleChapter(
          { index: ch.index, title: ch.title, content: ch.content },
        );
        chaptersWithSummary.push({
          index: ch.index,
          title: ch.title,
          summary: result.summary,
          content: ch.content,
          keyEvents: result.keyEvents,
        });
      }

      addLog('正在分析小说整体内容（角色、场景、物品、世界观）...');
      const analysisResult = await analyzeNovel(
        { title: file.name.replace(/\.(txt|epub)$/i, ''), chapters: chaptersWithSummary },
        undefined,
        addLog,
      );

      const novelAnalysisData: NovelAnalysis = {
        id: crypto.randomUUID(),
        projectId: '',
        fileInfo: {
          id: crypto.randomUUID(),
          fileName: file.name,
          fileType: file.name.endsWith('.epub') ? 'epub' : 'txt',
          fileSize: file.size,
          uploadTime: Date.now(),
        },
        rawText: parsedChapters.length > 0 ? parsedChapters.map(c => c.content).join('\n\n') : splitChapters.map(c => c.content).join('\n\n'),
        title: file.name.replace(/\.(txt|epub)$/i, ''),
        author: undefined,
        genre: analysisResult.genre,
        summary: analysisResult.summary,
        chapters: chaptersWithSummary,
        characters: analysisResult.characters,
        keyScenes: analysisResult.keyScenes,
        keyItems: analysisResult.keyItems,
        worldSettings: analysisResult.worldSettings,
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setNovelAnalysis(novelAnalysisData);
      await saveNovelAnalysis(novelAnalysisData);
      addLog('分析结果已保存');

      setSelectedChapterIndices(novelAnalysisData.chapters.map(ch => ch.index));
      setSelectedSceneIds(novelAnalysisData.keyScenes.map(s => s.id));
      setStep('browse');
    } catch (err: any) {
      setError(err.message || '分析失败');
      setStep('upload');
    }
  };

  const handleAdapt = async () => {
    if (!novelAnalysis) return;
    setStep('adapt');
    setError(null);
    setAdaptLogs([]);
    const addAdaptLog = (msg: string) => setAdaptLogs(prev => [...prev.slice(-49), msg]);

    try {
      const selectedChapters = novelAnalysis.chapters.filter(ch =>
        selectedChapterIndices.includes(ch.index)
      );
      const selectedScenes = novelAnalysis.keyScenes.filter(s =>
        selectedSceneIds.includes(s.id)
      );

      addAdaptLog(`选定 ${selectedChapters.length} 章、${selectedScenes.length} 个场景`);
      addAdaptLog('正在生成剧本改编...');

      const result = await adaptToScript(
        {
          novelTitle: novelAnalysis.title,
          chapters: selectedChapters,
          selectedScenes: selectedScenes,
          characters: novelAnalysis.characters,
          worldSettings: novelAnalysis.worldSettings,
        },
        undefined,
        addAdaptLog,
      );

      setAdaptationResult(result);
      setAdaptedChapterIndices(selectedChapterIndices);
      addAdaptLog('剧本改编完成，请确认');
    } catch (err: any) {
      setError(err.message || '剧本改编失败');
      addAdaptLog(`错误: ${err.message}`);
    }
  };

  const handleCreateProject = async () => {
    if (!novelAnalysis || !adaptationResult) return;
    setStep('createProject');

    try {
      const project = createNewProjectState();
      project.title = adaptationResult.title || novelAnalysis.title;
      project.rawScript = adaptationResult.storyParagraphs.map(p => p.text).join('\n\n');
      project.scriptData = {
        title: adaptationResult.title,
        genre: adaptationResult.genre,
        logline: adaptationResult.logline,
        characters: adaptationResult.characters.map(c => ({
          id: crypto.randomUUID(),
          name: c.name,
          gender: c.gender,
          age: c.age,
          personality: c.personality,
          visualPrompt: c.visualPrompt,
          negativePrompt: undefined,
          coreFeatures: undefined,
          imageUrl: undefined,
          threeViewImageUrl: undefined,
          turnaround: undefined,
          variations: [],
          status: 'pending' as const,
        })),
        scenes: adaptationResult.scenes.map(s => ({
          id: crypto.randomUUID(),
          location: s.location,
          time: s.time,
          atmosphere: s.atmosphere,
          visualPrompt: undefined,
          negativePrompt: undefined,
          imageUrl: undefined,
          status: 'pending' as const,
        })),
        props: [],
        storyParagraphs: adaptationResult.storyParagraphs.map((p, i) => ({
          id: i + 1,
          text: p.text,
          sceneRefId: p.sceneRefId,
        })),
      };
      project.stage = 'script';

      const adaptationRecord: ScriptAdaptation = {
        id: crypto.randomUUID(),
        novelAnalysisId: novelAnalysis.id,
        sourceChapters: adaptedChapterIndices.length > 0
          ? adaptedChapterIndices
          : novelAnalysis.chapters.map(ch => ch.index),
        sourceScenes: selectedSceneIds,
        adaptationStrategy: adaptStrategy,
        scriptData: {
          title: adaptationResult.title,
          genre: adaptationResult.genre,
          logline: adaptationResult.logline,
          characters: adaptationResult.characters,
          scenes: adaptationResult.scenes,
          storyParagraphs: adaptationResult.storyParagraphs,
        },
        createdAt: Date.now(),
      };

      novelAnalysis.projectId = project.id;
      if (!novelAnalysis.adaptations) novelAnalysis.adaptations = [];
      novelAnalysis.adaptations.push(adaptationRecord);
      await saveNovelAnalysis(novelAnalysis);

      onCreateProject(project);
      reset();
    } catch (err: any) {
      setError(err.message || '创建项目失败');
    }
  };

  const goToStep = (targetStep: Step) => {
    if (isProcessing) return;
    setError(null);
    setStep(targetStep);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={handleClose}>
      <div
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-[var(--bg-primary)] border border-[var(--border-primary)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-[var(--accent-text)]" />
            <h2 className="text-lg text-[var(--text-primary)] font-bold tracking-wide">小说导入与分析</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
          {STEP_ORDER.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <ChevronRight className="w-3 h-3 text-[var(--text-muted)] mx-1" />}
              <button
                onClick={() => goToStep(s)}
                disabled={isProcessing || i > currentStepIdx}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 ${
                  step === s
                    ? 'text-[var(--accent-text)] bg-[var(--bg-hover)]'
                    : i < currentStepIdx
                      ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                }`}
              >
                {i < currentStepIdx ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 flex items-center justify-center text-[9px] font-mono border border-current rounded-full">{i + 1}</span>}
                {STEP_LABELS[s]}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 border border-[var(--error-border)] bg-[var(--error-hover-bg)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--error)] mt-0.5 shrink-0" />
              <span className="text-xs text-[var(--error-text)]">{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              {existingAnalyses.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> 历史分析记录
                  </h3>
                  <div className="space-y-1 mb-4 max-h-40 overflow-y-auto border border-[var(--border-subtle)] p-2">
                    {existingAnalyses.map(a => (
                      <button
                        key={a.id}
                        onClick={() => handleResumeAnalysis(a)}
                        className="w-full flex items-center gap-3 p-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <BookOpen className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[var(--text-primary)] font-medium truncate">{a.title}</p>
                          <p className="text-[9px] text-[var(--text-muted)] font-mono">
                            {a.chapters.length} 章 · {a.characters.length} 角色 · {a.keyScenes.length} 场景
                            {a.fileInfo && ` · ${(a.fileInfo.fileSize / 1024 / 1024).toFixed(1)}MB`}
                          </p>
                        </div>
                        <span className="text-[9px] text-[var(--text-tertiary)] font-mono shrink-0">
                          {new Date(a.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f && (f.name.endsWith('.txt') || f.name.endsWith('.epub'))) {
                    handleFileSelect(f);
                  }
                }}
                className="border-2 border-dashed border-[var(--border-primary)] hover:border-[var(--border-secondary)] p-12 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
                <p className="text-sm text-[var(--text-secondary)] font-medium">点击或拖拽上传小说文件</p>
                <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1">支持 TXT、EPUB 格式</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.epub"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </div>

              {file && !splitDone && (
                <div className="p-4 border border-[var(--border-primary)] bg-[var(--bg-surface)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-[var(--accent-text)]" />
                    <div>
                      <p className="text-sm text-[var(--text-primary)] font-medium">{file.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSplitChapters}
                    className="px-5 py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    拆分章节
                  </button>
                </div>
              )}
              {file && splitDone && (
                <div className="p-4 border border-[var(--border-primary)] bg-[var(--bg-surface)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <div>
                        <p className="text-sm text-[var(--text-primary)] font-medium">{file.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono">
                          章节拆分完成，共 {splitChapters.length} 章
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-xs uppercase tracking-wider transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      重新选择文件
                    </button>
                    <button
                      onClick={handleRunAnalysis}
                      className="px-5 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                      开始 AI 分析
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <Loader2 className="w-8 h-8 text-[var(--accent-text)] animate-spin" />
              <p className="text-sm text-[var(--text-secondary)]">AI 正在分析小说内容，请稍候...</p>
              {processingLogs.length > 0 && (
                <div className="w-full max-w-lg max-h-48 overflow-y-auto border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3">
                  {processingLogs.map((log, i) => (
                    <p key={i} className="text-[10px] text-[var(--text-tertiary)] font-mono leading-relaxed">{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'browse' && novelAnalysis && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-3">
                {(['chapters', 'characters', 'scenes', 'items', 'world'] as BrowseTab[]).map(tab => {
                  const icons: Record<BrowseTab, React.ReactNode> = {
                    chapters: <BookOpen className="w-3.5 h-3.5" />,
                    characters: <Users className="w-3.5 h-3.5" />,
                    scenes: <Image className="w-3.5 h-3.5" />,
                    items: <Package className="w-3.5 h-3.5" />,
                    world: <Globe className="w-3.5 h-3.5" />,
                  };
                  const labels: Record<BrowseTab, string> = {
                    chapters: `章节 (${novelAnalysis.chapters.length})`,
                    characters: `角色 (${novelAnalysis.characters.length})`,
                    scenes: `场景 (${novelAnalysis.keyScenes.length})`,
                    items: `物品 (${novelAnalysis.keyItems.length})`,
                    world: `世界观 (${novelAnalysis.worldSettings.length})`,
                  };
                  return (
                    <button
                      key={tab}
                      onClick={() => setBrowseTab(tab)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                        browseTab === tab
                          ? 'text-[var(--accent-text)] border-b-2 border-[var(--accent-text)]'
                          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {icons[tab]}
                      {labels[tab]}
                    </button>
                  );
                })}
              </div>

              <div className="max-h-96 overflow-y-auto space-y-3">
                {browseTab === 'chapters' && novelAnalysis.chapters.map(ch => (
                  <div key={ch.index} className="p-3 border border-[var(--border-primary)] bg-[var(--bg-surface)]">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">
                        第{ch.index}章 {ch.title}
                      </h4>
                      <span className="text-[9px] text-[var(--text-muted)] font-mono">
                        {(ch.content.length / 100).toFixed(0)}00字
                      </span>
                    </div>
                    {ch.summary && (
                      <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">{ch.summary}</p>
                    )}
                    {ch.keyEvents.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ch.keyEvents.map((ev, i) => (
                          <span key={i} className="text-[9px] text-[var(--text-muted)] bg-[var(--bg-sunken)] px-1.5 py-0.5 border border-[var(--border-subtle)]">
                            {ev}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {browseTab === 'characters' && novelAnalysis.characters.map(ch => (
                  <div key={ch.id} className="p-3 border border-[var(--border-primary)] bg-[var(--bg-surface)]">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">{ch.name}</h4>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 border ${
                        ch.role === 'protagonist' ? 'border-[var(--accent-text)] text-[var(--accent-text)]' :
                        ch.role === 'antagonist' ? 'border-[var(--error-border)] text-[var(--error-text)]' :
                        'border-[var(--border-primary)] text-[var(--text-muted)]'
                      }`}>
                        {ch.role === 'protagonist' ? '主角' : ch.role === 'antagonist' ? '反派' : ch.role === 'supporting' ? '配角' : '龙套'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-mono">
                      {ch.gender} · {ch.age} · {ch.personality}
                    </p>
                    {ch.background && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">{ch.background}</p>
                    )}
                    {ch.aliases.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ch.aliases.map((a, i) => (
                          <span key={i} className="text-[9px] text-[var(--text-muted)] bg-[var(--bg-sunken)] px-1">别称: {a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {browseTab === 'scenes' && novelAnalysis.keyScenes.map(s => (
                  <div key={s.id} className="p-3 border border-[var(--border-primary)] bg-[var(--bg-surface)]">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">{s.name}</h4>
                    <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">{s.description}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1">第{s.chapterIndex}章 · {s.significance}</p>
                  </div>
                ))}

                {browseTab === 'items' && novelAnalysis.keyItems.map(item => (
                  <div key={item.id} className="p-3 border border-[var(--border-primary)] bg-[var(--bg-surface)]">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">{item.name}</h4>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono">{item.category}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-1 leading-relaxed">{item.description}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">{item.significance}</p>
                  </div>
                ))}

                {browseTab === 'world' && novelAnalysis.worldSettings.map(ws => (
                  <div key={ws.id} className="p-3 border border-[var(--border-primary)] bg-[var(--bg-surface)]">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">{ws.name}</h4>
                      <span className="text-[9px] text-[var(--text-muted)] bg-[var(--bg-sunken)] px-1.5 py-0.5 border border-[var(--border-subtle)]">
                        {ws.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">{ws.description}</p>
                    {ws.details && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{ws.details}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => goToStep('adapt')}
                  className="px-5 py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  进入剧本改编 →
                </button>
              </div>
            </div>
          )}

          {step === 'adapt' && novelAnalysis && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">选择章节</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedChapterIndices(novelAnalysis.chapters.map(ch => ch.index))}
                        className="px-2 py-0.5 border border-[var(--border-subtle)] text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] uppercase tracking-wider font-bold transition-colors"
                      >
                        全选
                      </button>
                      <button
                        onClick={() => setSelectedChapterIndices([])}
                        className="px-2 py-0.5 border border-[var(--border-subtle)] text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] uppercase tracking-wider font-bold transition-colors"
                      >
                        全不选
                      </button>
                      <span className="text-[9px] text-[var(--text-muted)] font-mono ml-1">
                        {selectedChapterIndices.length}/{novelAnalysis.chapters.length}
                      </span>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-[var(--border-subtle)] p-2">
                    {novelAnalysis.chapters.map(ch => {
                      const isAdapted = adaptedChapterIndices.includes(ch.index);
                      return (
                        <label key={ch.index} className="flex items-center gap-2 p-1.5 hover:bg-[var(--bg-hover)] cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={selectedChapterIndices.includes(ch.index)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedChapterIndices(prev => [...prev, ch.index]);
                              } else {
                                setSelectedChapterIndices(prev => prev.filter(i => i !== ch.index));
                              }
                            }}
                            className="accent-[var(--accent-text)]"
                          />
                          <span className={`${isAdapted ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'}`}>
                            第{ch.index}章 {ch.title}
                          </span>
                          {isAdapted && (
                            <span className="text-[8px] text-[var(--success)] border border-[var(--success)] px-1 py-0.5 leading-none font-bold uppercase tracking-wider">已改编</span>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">选择场景</h3>
                  {(() => {
                    const adaptedSceneCount = novelAnalysis.keyScenes.filter(s => adaptedChapterIndices.includes(s.chapterIndex)).length;
                    return adaptedSceneCount > 0 ? (
                      <p className="text-[9px] text-[var(--text-muted)] font-mono -mt-1">{adaptedSceneCount} 个场景所属章节已改编</p>
                    ) : null;
                  })()}
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-[var(--border-subtle)] p-2">
                    {novelAnalysis.keyScenes.map(s => {
                      const isSceneAdapted = adaptedChapterIndices.includes(s.chapterIndex);
                      return (
                        <label key={s.id} className="flex items-center gap-2 p-1.5 hover:bg-[var(--bg-hover)] cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={selectedSceneIds.includes(s.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedSceneIds(prev => [...prev, s.id]);
                              } else {
                                setSelectedSceneIds(prev => prev.filter(id => id !== s.id));
                              }
                            }}
                            className="accent-[var(--accent-text)]"
                          />
                          <span className={`${isSceneAdapted ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'}`}>{s.name}</span>
                          <span className="text-[var(--text-muted)]">(第{s.chapterIndex}章)</span>
                          {isSceneAdapted && (
                            <span className="text-[8px] text-[var(--success)] border border-[var(--success)] px-1 py-0.5 leading-none font-bold uppercase tracking-wider">已改编</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">改编策略</h3>
                  <textarea
                    value={adaptStrategy}
                    onChange={e => setAdaptStrategy(e.target.value)}
                    className="w-full h-24 p-2 text-xs border border-[var(--border-primary)] bg-[var(--bg-surface)] text-[var(--text-primary)] resize-none"
                    placeholder="描述改编策略..."
                  />

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleAdapt}
                      disabled={adaptationResult !== null}
                      className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                      {adaptationResult ? '已完成' : '生成剧本'}
                    </button>
                    <button
                      onClick={() => { setAdaptationResult(null); setAdaptLogs([]); }}
                      className="px-4 py-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                      重新生成
                    </button>
                  </div>

                  {adaptLogs.length > 0 && (
                    <div className="max-h-32 overflow-y-auto border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-2">
                      {adaptLogs.map((log, i) => (
                        <p key={i} className="text-[9px] text-[var(--text-tertiary)] font-mono leading-relaxed">{log}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {adaptationResult && (
                <div className="border border-[var(--border-primary)] p-4 space-y-3">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">改编结果预览</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center">
                      <p className="text-lg font-bold text-[var(--accent-text)]">{adaptationResult.characters.length}</p>
                      <p className="text-[9px] text-[var(--text-muted)] uppercase">角色</p>
                    </div>
                    <div className="p-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center">
                      <p className="text-lg font-bold text-[var(--accent-text)]">{adaptationResult.scenes.length}</p>
                      <p className="text-[9px] text-[var(--text-muted)] uppercase">场次</p>
                    </div>
                    <div className="p-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center">
                      <p className="text-lg font-bold text-[var(--accent-text)]">{adaptationResult.storyParagraphs.length}</p>
                      <p className="text-[9px] text-[var(--text-muted)] uppercase">段落</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">{adaptationResult.logline}</p>

                  <div className="max-h-40 overflow-y-auto space-y-2 border border-[var(--border-subtle)] p-2">
                    {adaptationResult.storyParagraphs.slice(0, 10).map((p, i) => (
                      <p key={i} className="text-[10px] text-[var(--text-secondary)] font-mono leading-relaxed border-b border-[var(--border-subtle)] pb-1 last:border-0">
                        <span className="text-[var(--text-muted)]">[场{p.sceneRefId}] </span>
                        {p.text.slice(0, 200)}
                      </p>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={() => goToStep('browse')}
                      className="px-4 py-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                      返回修改
                    </button>
                    <button
                      onClick={handleCreateProject}
                      className="px-5 py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                      创建项目 →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'createProject' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 text-[var(--accent-text)] animate-spin" />
              <p className="text-sm text-[var(--text-secondary)]">正在创建项目...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NovelAnalysisModal;
