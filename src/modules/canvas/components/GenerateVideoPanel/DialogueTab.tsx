import React, { useState } from 'react';
import { Mic, Plus, Trash2 } from 'lucide-react';
import { formatTime, type GenerationPanelState } from './types';

export const DialogueTab: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const { dialogues, addDialogue, updateDialogue, removeDialogue, durationMs } = panel;

  // 对白时间编辑态（原属于主组件局部状态，Phase 3 拆分就近归并到本 tab）
  const [dialogueTimeRaw, setDialogueTimeRaw] = useState<Record<string, string>>({});

  const commitDialogueTime = (entryId: string, raw: string) => {
    setDialogueTimeRaw((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
    const parsed = parseTime(raw);
    if (parsed !== null && parsed >= 0 && parsed <= durationMs) {
      updateDialogue(entryId, { timestamp: parsed });
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5 text-gray-400" />
          对白与旁白时间线
          <span className="text-gray-500 font-normal">({dialogues.length}条)</span>
        </label>
        <button
          onClick={addDialogue}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      {dialogues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-500 text-sm gap-2">
          <Mic className="w-8 h-8 opacity-30" />
          <p>暂无对白或旁白</p>
          <p className="text-xs">点击"添加"按钮来创建</p>
        </div>
      )}

      <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
        {dialogues.map((entry) => (
          <div
            key={entry.id}
            className="bg-gray-800/40 rounded-lg border border-gray-700/50 p-2.5 group"
          >
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={dialogueTimeRaw[entry.id] ?? formatTime(entry.timestamp)}
                onChange={(e) =>
                  setDialogueTimeRaw((prev) => ({ ...prev, [entry.id]: e.target.value }))
                }
                onBlur={() =>
                  commitDialogueTime(
                    entry.id,
                    dialogueTimeRaw[entry.id] ?? formatTime(entry.timestamp),
                  )
                }
                className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 font-mono text-center focus:outline-none focus:border-purple-500/50"
              />
              <select
                value={entry.type}
                onChange={(e) =>
                  updateDialogue(entry.id, { type: e.target.value as 'dialogue' | 'narration' })
                }
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-purple-500/50"
              >
                <option value="dialogue">对白</option>
                <option value="narration">旁白</option>
              </select>
              {entry.type === 'dialogue' && (
                <input
                  type="text"
                  value={entry.character}
                  onChange={(e) => updateDialogue(entry.id, { character: e.target.value })}
                  placeholder="角色名"
                  className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                />
              )}
              <button
                onClick={() => removeDialogue(entry.id)}
                className="ml-auto text-gray-400 hover:text-red-400 transition-all p-0.5"
                title="删除此条目"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-2">
              <div
                className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  entry.type === 'dialogue' ? 'bg-blue-400' : 'bg-green-400'
                }`}
              />
              <input
                type="text"
                value={entry.text}
                onChange={(e) => updateDialogue(entry.id, { text: e.target.value })}
                placeholder={entry.type === 'dialogue' ? '对白内容...' : '旁白内容...'}
                className="flex-1 bg-gray-900/60 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-800/20 rounded-lg border border-gray-700/50 p-2.5">
        <div className="relative h-8 bg-gray-900 rounded overflow-hidden">
          {dialogues
            .filter((d) => d.text.trim())
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((entry) => {
              const percent = durationMs > 0 ? (entry.timestamp / durationMs) * 100 : 0;
              return (
                <div
                  key={entry.id}
                  className={`absolute top-0 h-full w-0.5 ${
                    entry.type === 'dialogue' ? 'bg-blue-500' : 'bg-green-500'
                  }`}
                  style={{ left: `${Math.min(percent, 100)}%` }}
                  title={`${formatTime(entry.timestamp)} - ${entry.text}`}
                />
              );
            })}
        </div>
        <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
          <span>00:00.000</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>
    </div>
  );
};

function parseTime(str: string): number | null {
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const min = parseInt(parts[0], 10);
  const sec = parseFloat(parts[1]);
  if (isNaN(min) || isNaN(sec)) return null;
  if (sec >= 60) return null;
  return (min * 60 + sec) * 1000;
}
