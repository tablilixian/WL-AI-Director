import React, { useState } from 'react';
import { Film, Plus, Trash2 } from 'lucide-react';
import { formatTime, type GenerationPanelState, type TimestampActionItem } from './types';

export const ActionsTab: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const {
    timestampActions,
    addTimestampAction,
    updateTimestampAction,
    removeTimestampAction,
    durationMs,
  } = panel;

  // 时间输入编辑状态（临时字符串，不强制格式）— 就近归并到本 tab
  const [timeEditRaw, setTimeEditRaw] = useState<Record<string, { start?: string; end?: string }>>(
    {},
  );

  const getTimeInputValue = (actionId: string, field: 'start' | 'end', msValue: number): string => {
    return timeEditRaw[actionId]?.[field] ?? formatActionTime(msValue);
  };

  const handleTimeInputChange = (actionId: string, field: 'start' | 'end', raw: string) => {
    setTimeEditRaw((prev) => ({
      ...prev,
      [actionId]: { ...prev[actionId], [field]: raw },
    }));
  };

  const commitTimeInput = (
    actionId: string,
    field: 'start' | 'end',
    action: TimestampActionItem,
  ) => {
    const raw = timeEditRaw[actionId]?.[field];
    if (raw === undefined) return;

    // 清除编辑态
    setTimeEditRaw((prev) => {
      const next = { ...prev };
      if (next[actionId]) {
        delete next[actionId][field];
        if (Object.keys(next[actionId]).length === 0) delete next[actionId];
      }
      return next;
    });

    // 尝试解析
    const parsed = parseTimeDisplay(raw);
    if (parsed === null) return;

    if (field === 'start') {
      if (parsed >= 0 && parsed < action.endTime) {
        updateTimestampAction(actionId, { startTime: parsed });
      }
    } else {
      if (parsed > action.startTime && parsed <= durationMs) {
        updateTimestampAction(actionId, { endTime: parsed });
      }
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5 text-green-400" />
          动作时间线
          <span className="text-gray-500 font-normal">({timestampActions.length}段)</span>
        </label>
        <button
          onClick={addTimestampAction}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加动作段
        </button>
      </div>

      <p className="text-[10px] text-gray-500">
        将视频按时间段分解为连续的动作序列。模型将按时间顺序依次执行各段动作描述。
        <span className="text-green-500/70"> Sora 2 等模型对此格式响应最佳。</span>
      </p>

      {timestampActions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-500 text-sm gap-2">
          <Film className="w-8 h-8 opacity-30" />
          <p>暂无动作分段</p>
          <p className="text-xs">点击"添加动作段"将视频动作分解为时间序列</p>
        </div>
      )}

      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {timestampActions.map((action, idx) => (
          <div
            key={action.id}
            className="bg-gray-800/40 rounded-lg border border-green-700/30 p-2.5 group"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-gray-500 font-mono w-5">#{idx + 1}</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={getTimeInputValue(action.id, 'start', action.startTime)}
                  onChange={(e) => handleTimeInputChange(action.id, 'start', e.target.value)}
                  onBlur={() => commitTimeInput(action.id, 'start', action)}
                  className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 font-mono text-center focus:outline-none focus:border-green-500/50"
                />
                <span className="text-gray-600 text-[10px]">→</span>
                <input
                  type="text"
                  value={getTimeInputValue(action.id, 'end', action.endTime)}
                  onChange={(e) => handleTimeInputChange(action.id, 'end', e.target.value)}
                  onBlur={() => commitTimeInput(action.id, 'end', action)}
                  className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 font-mono text-center focus:outline-none focus:border-green-500/50"
                />
              </div>
              <span className="text-[10px] text-gray-600">
                时长 {(action.endTime - action.startTime) / 1000}s
              </span>
              <button
                onClick={() => removeTimestampAction(action.id)}
                className="ml-auto text-gray-400 hover:text-red-400 transition-all p-0.5"
                title="删除此动作段"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <textarea
              value={action.description}
              onChange={(e) => updateTimestampAction(action.id, { description: e.target.value })}
              placeholder={`描述第 ${idx + 1} 段的动作内容...`}
              rows={2}
              className="w-full bg-gray-900/60 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500/50 transition-colors resize-none"
            />
          </div>
        ))}
      </div>

      {/* 时间轴可视化 */}
      {timestampActions.length > 0 && (
        <div className="bg-gray-800/20 rounded-lg border border-gray-700/50 p-2.5">
          <div className="relative h-8 bg-gray-900 rounded overflow-hidden">
            {timestampActions
              .filter((a) => a.description.trim())
              .sort((a, b) => a.startTime - b.startTime)
              .map((action, idx) => {
                const left = durationMs > 0 ? (action.startTime / durationMs) * 100 : 0;
                const width =
                  durationMs > 0 ? ((action.endTime - action.startTime) / durationMs) * 100 : 0;
                const colors = [
                  'bg-green-500',
                  'bg-blue-500',
                  'bg-yellow-500',
                  'bg-purple-500',
                  'bg-pink-500',
                  'bg-cyan-500',
                ];
                return (
                  <div
                    key={action.id}
                    className={`absolute top-1 bottom-1 rounded ${colors[idx % colors.length]} opacity-60`}
                    style={{
                      left: `${Math.min(left, 100)}%`,
                      width: `${Math.min(width, 100 - left)}%`,
                    }}
                    title={`${formatActionTime(action.startTime)}-${formatActionTime(
                      action.endTime,
                    )}: ${action.description}`}
                  />
                );
              })}
          </div>
          <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
            <span>00:00.000</span>
            <span>{formatTime(durationMs)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

function parseTimeDisplay(str: string): number | null {
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const min = parseInt(parts[0], 10);
  const sec = parseFloat(parts[1]);
  if (isNaN(min) || isNaN(sec)) return null;
  if (sec >= 60) return null;
  return (min * 60 + sec) * 1000;
}

function formatActionTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (!isFinite(sec) || isNaN(sec)) return '00:00.000';
  return `${min.toString().padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
}
