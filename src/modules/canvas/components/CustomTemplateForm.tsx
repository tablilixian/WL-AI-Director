import React, { useState } from 'react';
import { userTemplateService } from '../services/userTemplateService';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export const CustomTemplateForm: React.FC<Props> = ({ onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [stylePromptZh, setStylePromptZh] = useState('');
  const [subjectPlaceholder, setSubjectPlaceholder] = useState('');
  const [subjectPlaceholderZh, setSubjectPlaceholderZh] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [negativePromptZh, setNegativePromptZh] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('请输入模板名称'); return; }
    if (!stylePrompt.trim()) { setError('请输入风格提示词（英文）'); return; }
    setError('');
    setSaving(true);

    try {
      await userTemplateService.save({
        name: name.trim(),
        stylePrompt: stylePrompt.trim(),
        stylePromptZh: stylePromptZh.trim(),
        subjectPlaceholder: subjectPlaceholder.trim(),
        subjectPlaceholderZh: subjectPlaceholderZh.trim(),
        negativePrompt: negativePrompt.trim(),
        negativePromptZh: negativePromptZh.trim(),
      });
      onSaved();
      onClose();
    } catch {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[520px] max-h-[85vh] bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h3 className="text-base font-medium text-white">新建自定义模板</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">
              模板名称 <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="例如：赛博朋克人像"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">
              主体描述（英文）
            </label>
            <textarea
              value={subjectPlaceholder}
              onChange={(e) => setSubjectPlaceholder(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={2}
              placeholder="A cyberpunk character with neon implants"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">
              主体描述（中文）
            </label>
            <textarea
              value={subjectPlaceholderZh}
              onChange={(e) => setSubjectPlaceholderZh(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={2}
              placeholder="一个带有霓虹植入物的赛博朋克角色"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">
              风格提示词（英文） <span className="text-red-400">*</span>
            </label>
            <textarea
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
              placeholder="neon lighting, cyberpunk aesthetic, detailed, 8K"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">
              风格提示词（中文）
            </label>
            <textarea
              value={stylePromptZh}
              onChange={(e) => setStylePromptZh(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
              placeholder="霓虹灯光，赛博朋克美学，细节丰富，8K分辨率"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">
              负面提示词（英文）
            </label>
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={2}
              placeholder="cartoon, anime, low quality, blurry"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">
              负面提示词（中文）
            </label>
            <textarea
              value={negativePromptZh}
              onChange={(e) => setNegativePromptZh(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={2}
              placeholder="卡通，动漫，低质量，模糊"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                保存中...
              </>
            ) : (
              '保存模板'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
