import React, { useState } from 'react';
import { AlignLeft, AlignCenter, AlignRight, Bold } from 'lucide-react';
import { TextClip, TextAnimation } from '../../../types/editor';

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

export const TextEditor: React.FC<TextEditorProps> = ({
  clip,
  onUpdate,
  onClose,
}) => {
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
            onChange={(e) => onUpdate({ text: e.target.value })}
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
              {FONTS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
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
              value={clip.backgroundColor || '#000000'}
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
            {ANIMATIONS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
