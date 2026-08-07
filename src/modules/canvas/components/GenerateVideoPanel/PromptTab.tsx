import React from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { type GenerationPanelState } from './types';

export const PromptTab: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const {
    subjectPrompt,
    setSubjectPrompt,
    actionPrompt,
    setActionPrompt,
    environmentPrompt,
    setEnvironmentPrompt,
    stylePrompt,
    setStylePrompt,
    negativePrompt,
    setNegativePrompt,
    globalPrompt,
    setGlobalPrompt,
    isCheckingQuality,
    qualityReport,
    setQualityReport,
    buildFullPromptPreview,
    handleQualityCheck,
  } = panel;
  const fullPromptPreview = buildFullPromptPreview();
  return (
    <div className="p-4 space-y-3 overflow-y-auto">
      {/* 主体描述 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          主体描述
        </label>
        <input
          value={subjectPrompt}
          onChange={(e) => setSubjectPrompt(e.target.value)}
          placeholder="描述视频中的主要人物/对象的外观特征...&#10;例如：一位穿黑色风衣的年轻男子，短发，眼神坚毅"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>

      {/* 动作描述 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          动作描述
        </label>
        <textarea
          value={actionPrompt}
          onChange={(e) => setActionPrompt(e.target.value)}
          placeholder="描述主体的动作、行为、情绪变化...&#10;例如：在雨中缓步前行，偶尔抬头看路灯，神情疲惫"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500/50 transition-colors resize-none"
        />
      </div>

      {/* 环境描述 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          环境描述
        </label>
        <textarea
          value={environmentPrompt}
          onChange={(e) => setEnvironmentPrompt(e.target.value)}
          placeholder="描述场景环境、空间关系、背景细节...&#10;例如：潮湿的柏油路面反射霓虹灯光，雨滴打在水洼上泛起涟漪"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 transition-colors resize-none"
        />
      </div>

      {/* 风格氛围 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          风格与氛围
        </label>
        <textarea
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder="描述视觉风格、色彩基调、情感氛围...&#10;例如：赛博朋克美学，冷色调，电影级景深，略带颗粒感"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
        />
      </div>

      {/* 负面提示词 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          负面提示词
          <span className="text-[9px] text-gray-600 font-normal">（不希望出现的内容）</span>
        </label>
        <input
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder="例如：卡通风格，低质量，模糊，水印，人物变形"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50 transition-colors"
        />
      </div>

      {/* AI 质检按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleQualityCheck}
          disabled={isCheckingQuality || !fullPromptPreview.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-cyan-600/80 text-white rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isCheckingQuality ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              AI 质检
            </>
          )}
        </button>
        <span className="text-[10px] text-gray-600">检查提示词是否有逻辑冲突或不合理之处</span>
      </div>

      {/* 质检报告 */}
      {qualityReport && (
        <div className="bg-gray-800/60 rounded-lg border border-cyan-500/30 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-medium text-cyan-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              AI 质检报告
            </h4>
            <button
              onClick={() => setQualityReport(null)}
              className="text-gray-500 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <pre className="text-[11px] text-gray-300 font-sans leading-relaxed whitespace-pre-wrap">
            {qualityReport}
          </pre>
        </div>
      )}

      {/* 全局补充说明 */}
      <div className="border-t border-gray-700/30 pt-3">
        <details className="group">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors flex items-center gap-1">
            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
            全局补充提示词（可选）
          </summary>
          <textarea
            value={globalPrompt}
            onChange={(e) => setGlobalPrompt(e.target.value)}
            placeholder="额外的全局描述，会附加在最终提示词末尾"
            rows={2}
            className="w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
          />
        </details>
      </div>

      {/* 提示词预览 */}
      <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 p-3">
        <details open>
          <summary className="text-xs font-medium text-gray-400 mb-1 cursor-pointer hover:text-gray-300 transition-colors flex items-center gap-1">
            <ChevronDown className="w-3 h-3" />
            最终提示词预览
          </summary>
          <div className="bg-gray-900 rounded p-2.5 text-[11px] text-gray-500 font-mono leading-relaxed max-h-48 overflow-y-auto mt-1">
            {fullPromptPreview || <span className="text-gray-700">填写上方字段后自动生成</span>}
          </div>
        </details>
      </div>
    </div>
  );
};
