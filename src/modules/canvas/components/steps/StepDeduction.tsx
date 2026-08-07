import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { useCanvasStore } from '../../hooks/useCanvasState';
import type { DeductionData, StoryboardPanelData } from '../../types/flow';
import { OptimizableTextarea } from '../shared/OptimizableTextarea';
import { optimizeStoryDirection } from '../../services/promptOptimizer';
import { logger, LogCategory } from '../../../../../services/logger.ts';

interface StepDeductionProps {
  sourceLayerId: string;
  initialData: DeductionData | null;
  vlmRawAnalysis: string;
  onSave: (data: DeductionData) => void;
  onNext: () => void;
  onBack: () => void;
}

const SHOT_SIZE_OPTIONS = [
  '大远景',
  '远景',
  '全景',
  '中全景',
  '中景',
  '中近景',
  '近景',
  '特写',
  '大特写',
];
const CAMERA_ANGLE_OPTIONS = [
  '平视',
  '仰拍',
  '俯拍',
  '鸟瞰',
  '斜拍',
  '正面',
  '侧面',
  '背面',
  '低角度',
];
const POSITION_OPTIONS = ['居中', '左侧1/3', '右侧1/3', '黄金分割左', '黄金分割右', '边缘'];
const TRANSITION_OPTIONS = [
  '硬切',
  '推镜头',
  '拉镜头',
  '横移',
  '跟拍',
  '环绕',
  '过曝闪白',
  '黑场过渡',
  '模糊转场',
  '匹配剪辑',
];

function makeDefaultPanels(): StoryboardPanelData[] {
  return [0, 1, 2, 3].map((i) => ({
    index: i,
    checked: true,
    shotSize: '',
    cameraAngle: '',
    subjectPosition: '',
    action: '',
    lighting: '',
    dialogue: '',
    transitionToNext: '',
    rawDescription: '',
  }));
}

export const StepDeduction: React.FC<StepDeductionProps> = ({
  sourceLayerId,
  initialData,
  vlmRawAnalysis,
  onSave,
  onNext,
  onBack,
}) => {
  const { layers } = useCanvasStore();
  layers.find((l) => l.id === sourceLayerId);

  const [narrativeDirection, setNarrativeDirection] = useState(
    initialData?.narrativeDirection || '',
  );
  const [optimizedNarrativeDirection, setOptimizedNarrativeDirection] = useState('');
  const [panels, setPanels] = useState<StoryboardPanelData[]>(
    initialData?.panels || makeDefaultPanels(),
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<number | null>(null);
  const [rawLlmOutput, setRawLlmOutput] = useState('');

  const updatePanel = (index: number, updates: Partial<StoryboardPanelData>) => {
    setPanels((prev) => prev.map((p) => (p.index === index ? { ...p, ...updates } : p)));
  };

  const handleDeduce = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);

    // 优先使用 AI 优化后的结果
    const effectiveDirection = optimizedNarrativeDirection || narrativeDirection;

    try {
      const { chat } = await import('../../../../../services/modelService');

      const llmPrompt = `你是一个影视分镜师。请根据下面的"画面分析"和"剧情方向"，生成 4 个连贯的分镜描述。

画面分析：
${vlmRawAnalysis || '（无分析数据）'}

剧情方向：
${effectiveDirection || '（未提供，请基于画面分析做合理的剧情推演）'}

要求：
- 第1个分镜延续当前画面，往后推演故事
- 每个分镜包含：景别、机位角度、主体位置、动作描述、光照、对白
- 4帧是同一段画面在时间轴上的连续取样点，根据剧情方向自行判断4个分镜之间的逻辑关系——可能是固定机位的时间推进、氛围的渐进变化、慢动作的时间拉伸等，不要预设固定模板
- 景别、机位、主体位置是三个独立维度，必须分开理解：
  · 景别 = 相机的焦段/取景范围设定（如全景、中景、特写），描述的是镜头设定本身，不是画面中主体此刻看起来多大
  · 机位 = 相机的物理位置和拍摄角度（如平视、仰拍、俯拍、固定、运动）
  · 主体位置 = 主体在画面中的位置和远近（如居中、左侧1/3、远处、近处、紧贴镜头）
- 关键规则：当机位为固定镜头时，4帧的景别必须保持完全一致，主体的运动感和远近变化只能通过"主体位置"和"动作"两个字段来传达，绝不能通过改变景别来表现主体靠近或远离
- 还要描述每个分镜到下一个分镜的转场效果
- 保持角色、场景、光影风格一致

输出格式（不要有多余文字）：
分镜1
景别: <大远景/远景/全景/中景/近景/特写>
机位: <平视/仰拍/俯拍...>
主体位置: <居中/左侧1/3...>
动作: <动作描述>
光照: <光照描述>
对白: <对白内容，无则填"无">
转场: <到下一个分镜的转场效果>
---
分镜2
...`;

      logger.info(LogCategory.CANVAS, '=== [Deduction] LLM Request ===');
      logger.info(LogCategory.CANVAS, 'Prompt:', llmPrompt);
      logger.info(LogCategory.CANVAS, 'vlmRawAnalysis length:', vlmRawAnalysis?.length);

      let result = await chat({ prompt: llmPrompt });

      logger.info(LogCategory.CANVAS, '=== [Deduction] LLM Response ===');
      logger.info(LogCategory.CANVAS, 'Raw result length:', result?.length);
      logger.info(LogCategory.CANVAS, 'Raw result:', result);

      // 去掉 markdown 代码块包裹
      result = result
        .replace(/^```[\s\S]*?\n/, '')
        .replace(/\n```\s*$/, '')
        .trim();
      setRawLlmOutput(result);

      const parsedPanels: StoryboardPanelData[] = [];
      const blocks = result.split(/---+/);
      for (const block of blocks) {
        const lines = block.trim().split('\n').filter(Boolean);
        if (lines.length === 0) continue;
        const panel: Partial<Record<string, string>> = {};
        let rawDescription = '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (/^(?:分镜\s*\d*|景别|机位|主体位置|动作|光照|对白|转场)[：:]/.test(trimmed)) {
            const match = trimmed.match(/^([^：:]+)[：:]\s*(.+)/);
            if (match) {
              let key = match[1].trim();
              if (key.startsWith('分镜')) key = '分镜';
              panel[key] = match[2].trim();
            }
          } else if (!/^分镜/.test(trimmed)) {
            rawDescription += line + '\n';
          }
        }
        if (Object.keys(panel).length > 0) {
          const fields = ['景别', '机位', '主体位置', '动作', '光照', '对白', '转场'];
          const summary = fields
            .map((f) => panel[f])
            .filter(Boolean)
            .join('，');
          parsedPanels.push({
            index: parsedPanels.length,
            checked: true,
            shotSize: panel['景别'] || '',
            cameraAngle: panel['机位'] || '',
            subjectPosition: panel['主体位置'] || '',
            action: panel['动作'] || '',
            lighting: panel['光照'] || '',
            dialogue: panel['对白'] || '',
            transitionToNext: panel['转场'] || '',
            rawDescription: rawDescription.trim() || summary,
          });
        }
      }

      // 如果解析失败，把整段文本放入第1个 panel 的 rawDescription 作为回退
      if (parsedPanels.length === 0 && result) {
        parsedPanels.push({
          index: 0,
          checked: true,
          shotSize: '',
          cameraAngle: '',
          subjectPosition: '',
          action: '',
          lighting: '',
          dialogue: '',
          transitionToNext: '',
          rawDescription: result,
        });
      }

      while (parsedPanels.length < 4) {
        parsedPanels.push({
          index: parsedPanels.length,
          checked: true,
          shotSize: '',
          cameraAngle: '',
          subjectPosition: '',
          action: '',
          lighting: '',
          dialogue: '',
          transitionToNext: '',
          rawDescription: '',
        });
      }

      setPanels(parsedPanels.slice(0, 4));
    } catch (err: any) {
      setError(err.message || '推演失败');
    } finally {
      setIsProcessing(false);
    }
  }, [narrativeDirection, optimizedNarrativeDirection, vlmRawAnalysis, isProcessing]);

  const handleConfirm = () => {
    const effectiveDirection = optimizedNarrativeDirection || narrativeDirection;
    onSave({ narrativeDirection: effectiveDirection, panels });
    onNext();
  };

  const hasData = panels.some((p) => p.action || p.rawDescription) || rawLlmOutput.length > 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline mt-1">
            关闭
          </button>
        </div>
      )}

      <div>
        <OptimizableTextarea
          value={narrativeDirection}
          onChange={setNarrativeDirection}
          onOptimizedChange={setOptimizedNarrativeDirection}
          onOptimize={async () => {
            const result = await optimizeStoryDirection({
              rawDirection: narrativeDirection,
              vlmAnalysis: vlmRawAnalysis,
            });
            return result.optimizedDirection;
          }}
          placeholder="用你的话描述想要的画面。例如：骑兵从山谷远处跑来，镜头固定不动..."
          rows={2}
          label="剧情方向"
          optimizedLabel="AI 优化后的剧情方向"
          hint={
            <div className="space-y-2">
              <p className="text-[var(--text-muted)]">不确定怎么写？参考这些范例：</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-[var(--bg-base)] rounded border border-[var(--border-primary)]">
                  <p className="font-medium text-[var(--text-secondary)] text-[11px]">固定机位</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    骑兵队列从山谷远处跑来，镜头固定不动
                  </p>
                </div>
                <div className="p-2 bg-[var(--bg-base)] rounded border border-[var(--border-primary)]">
                  <p className="font-medium text-[var(--text-secondary)] text-[11px]">空间递进</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    深夜书房，主角发现古书后蓝光亮起
                  </p>
                </div>
                <div className="p-2 bg-[var(--bg-base)] rounded border border-[var(--border-primary)]">
                  <p className="font-medium text-[var(--text-secondary)] text-[11px]">氛围渐变</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    雨夜街角，一把红伞逐渐消失在雾中
                  </p>
                </div>
                <div className="p-2 bg-[var(--bg-base)] rounded border border-[var(--border-primary)]">
                  <p className="font-medium text-[var(--text-secondary)] text-[11px]">时间拉伸</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    爆炸瞬间，碎片飞溅的慢镜头
                  </p>
                </div>
              </div>
            </div>
          }
        />
      </div>

      {!hasData && !isProcessing && (
        <button
          onClick={handleDeduce}
          className="w-full py-3 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          AI 推演 4 个分镜
        </button>
      )}

      {isProcessing && (
        <div className="py-8 text-center">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">正在推演剧情...</p>
        </div>
      )}

      {hasData && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {panels.map((panel, i) => (
              <div
                key={i}
                className={`rounded-lg border overflow-hidden ${
                  panel.checked
                    ? 'border-amber-500/40'
                    : 'border-[var(--border-primary)] opacity-60'
                }`}
              >
                <div className="px-3 py-1.5 bg-gray-800 border-b border-inherit flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={panel.checked}
                      onChange={(e) => updatePanel(i, { checked: e.target.checked })}
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-xs font-mono font-bold text-[var(--text-tertiary)]">
                      分镜 {i + 1}
                    </span>
                  </div>
                  <button
                    onClick={() => setExpandedPanel(expandedPanel === i ? null : i)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  >
                    {expandedPanel === i ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <div className="p-2.5">
                  <textarea
                    value={panel.rawDescription}
                    onChange={(e) => updatePanel(i, { rawDescription: e.target.value })}
                    placeholder="分镜描述..."
                    rows={2}
                    className="w-full px-2 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none"
                  />
                </div>
                {expandedPanel === i && (
                  <div className="px-2.5 pb-3 space-y-1.5 border-t border-[var(--border-primary)] pt-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[9px] text-[var(--text-tertiary)]">景别</label>
                        <select
                          value={panel.shotSize}
                          onChange={(e) => updatePanel(i, { shotSize: e.target.value })}
                          className="w-full px-1.5 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[10px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                        >
                          <option value="">—</option>
                          {SHOT_SIZE_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-[var(--text-tertiary)]">机位</label>
                        <select
                          value={panel.cameraAngle}
                          onChange={(e) => updatePanel(i, { cameraAngle: e.target.value })}
                          className="w-full px-1.5 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[10px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                        >
                          <option value="">—</option>
                          {CAMERA_ANGLE_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-[var(--text-tertiary)]">主体位置</label>
                        <select
                          value={panel.subjectPosition}
                          onChange={(e) => updatePanel(i, { subjectPosition: e.target.value })}
                          className="w-full px-1.5 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[10px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                        >
                          <option value="">—</option>
                          {POSITION_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-[var(--text-tertiary)]">转场</label>
                        <select
                          value={panel.transitionToNext}
                          onChange={(e) => updatePanel(i, { transitionToNext: e.target.value })}
                          className="w-full px-1.5 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[10px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                        >
                          <option value="">—</option>
                          {TRANSITION_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] text-[var(--text-tertiary)]">动作</label>
                      <input
                        value={panel.action}
                        onChange={(e) => updatePanel(i, { action: e.target.value })}
                        className="w-full px-1.5 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[10px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-[var(--text-tertiary)]">光照</label>
                      <input
                        value={panel.lighting}
                        onChange={(e) => updatePanel(i, { lighting: e.target.value })}
                        className="w-full px-1.5 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[10px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-[var(--text-tertiary)]">对白</label>
                      <input
                        value={panel.dialogue}
                        onChange={(e) => updatePanel(i, { dialogue: e.target.value })}
                        className="w-full px-1.5 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[10px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDeduce}
              disabled={isProcessing}
              className="flex items-center gap-1 px-3 py-1.5 border border-[var(--border-primary)] text-[var(--text-secondary)] text-xs rounded-lg hover:text-[var(--text-primary)]"
            >
              <Sparkles className="w-3 h-3" /> 重新推演
            </button>
          </div>

          {rawLlmOutput && (
            <details className="text-[10px] text-[var(--text-tertiary)]">
              <summary className="cursor-pointer hover:text-[var(--text-secondary)] select-none">
                LLM 原始输出（{rawLlmOutput.length} 字符）
              </summary>
              <pre className="mt-1 text-[10px] text-[var(--text-muted)] whitespace-pre-wrap bg-[var(--bg-hover)] p-2 rounded max-h-48 overflow-y-auto font-mono border border-[var(--border-primary)]">
                {rawLlmOutput}
              </pre>
            </details>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onBack}
              className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm rounded-lg hover:text-[var(--text-primary)] flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> 返回分析
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
            >
              确认，生成宫格图
            </button>
          </div>
        </>
      )}
    </div>
  );
};
