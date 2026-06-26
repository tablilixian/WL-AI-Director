import React, { useState, useCallback } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { Sparkles, Copy, Check, X, Brain, ChevronDown } from 'lucide-react';

interface VisualLanguagePanelProps {
  selectedLayerId: string;
  onClose: () => void;
}

const PRESET_QUESTIONS = [
  { label: '详细描述这张图片', prompt: '请详细描述这张图片的内容，包括主体、背景、颜色、氛围等所有视觉元素。' },
  { label: '分析构图与光线', prompt: '请分析这张图片的构图方式、光线运用和摄影技巧。' },
  { label: '识别画面中所有元素', prompt: '请逐一列出这张图片中出现的所有物体、人物和视觉元素。' },
  { label: '分析色彩与风格', prompt: '请分析这张图片的色彩搭配、色调倾向和整体视觉风格。' },
];

const DEFAULT_SYSTEM_PROMPT = 'You are a professional visual analyst with expertise in photography, cinematography, and art criticism. Analyze images with technical precision and provide clear, structured observations.';

export const VisualLanguagePanel: React.FC<VisualLanguagePanelProps> = ({ selectedLayerId, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  if (!selectedLayer || selectedLayer.type !== 'image') return null;

  const handleAnalyze = useCallback(async () => {
    if (!prompt.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setResult(null);

    try {
      const { generateVisualLanguage } = await import('../../../../services/ai/visualService');
      const resolvedSrc = await (await import('../../../../services/unifiedImageService')).unifiedImageService.resolveForApi(selectedLayer.src);
      const output = await generateVisualLanguage(systemPrompt, prompt, resolvedSrc);
      setResult(output);
    } catch (error: any) {
      setResult(`分析失败: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [prompt, systemPrompt, isAnalyzing, selectedLayer.src]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = result;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  const handleSaveToCanvas = useCallback(() => {
    if (!result) return;
    const textId = crypto.randomUUID();
    addLayer({
      id: textId,
      type: 'text',
      x: selectedLayer.x + selectedLayer.width + 20,
      y: selectedLayer.y,
      width: 320,
      height: 200,
      src: '',
      title: `AI分析: ${prompt.slice(0, 20)}`,
      text: result,
      fontSize: 13,
      color: '#e2e8f0',
      createdAt: Date.now(),
      sourceLayerId: selectedLayer.id,
      operationType: 'visual-language',
    });
    onClose();
  }, [result, selectedLayer, prompt, addLayer, onClose]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-[560px] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-medium text-white">AI 视觉分析</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── 图片信息 ── */}
          <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg border border-gray-700/50 p-2.5">
            <div className="w-12 h-12 rounded overflow-hidden bg-gray-700 flex-shrink-0">
              {selectedLayer.src && (
                <img src={selectedLayer.src} alt={selectedLayer.title} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-200 truncate">{selectedLayer.title}</p>
              <p className="text-[10px] text-gray-500">{selectedLayer.width}×{selectedLayer.height}</p>
            </div>
          </div>

          {/* ── 预设问题模板 ── */}
          <div>
            <label className="text-xs font-medium text-gray-300 mb-1.5 block">快捷提问</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUESTIONS.map(q => (
                <button
                  key={q.label}
                  onClick={() => setPrompt(q.prompt)}
                  className={`px-2.5 py-1 text-[10px] rounded-lg border transition-colors ${
                    prompt === q.prompt
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── 问题输入 ── */}
          <div>
            <label className="text-xs font-medium text-gray-300 mb-1.5 block">你的问题 / 指令</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="输入关于这张图片的问题或分析指令..."
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors resize-none"
            />
          </div>

          {/* ── 高级设置 ── */}
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/50">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full px-3 py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              <span>高级设置（系统提示词）</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            {showAdvanced && (
              <div className="px-3 pb-3">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors resize-none font-mono"
                />
              </div>
            )}
          </div>

          {/* ── 分析按钮 ── */}
          <button
            onClick={handleAnalyze}
            disabled={!prompt.trim() || isAnalyzing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-white bg-cyan-600 rounded-lg hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                开始分析
              </>
            )}
          </button>

          {/* ── 分析结果 ── */}
          {result && (
            <div className="bg-gray-800/60 rounded-lg border border-cyan-500/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-cyan-400 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  分析结果
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                  <button
                    onClick={handleSaveToCanvas}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                  >
                    保存到画布
                  </button>
                </div>
              </div>
              <div className="bg-gray-900 rounded p-3 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                {result}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
