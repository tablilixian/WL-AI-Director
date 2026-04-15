/**
 * 视觉描述编辑 Modal
 * 用于编辑角色的"标志性姿态"和"病态微动作"
 * 支持 AI 润色和预览图生成功能
 *
 * 功能流程：
 * 1. 用户输入原文本
 * 2. 点击"AI 润色"按钮，AI 将文本润色为专业的视觉描述
 * 3. 点击"查看预览"按钮，生成预览图片
 * 4. 用户可编辑润色后的文本
 * 5. 保存时保存 original 和 polished 文本
 */

import React, { useState } from 'react';
import {
  X,
  Wand2,
  Eye,
  Save,
  Loader2,
  AlertCircle,
  ImageIcon,
  Sparkles,
  Edit3
} from 'lucide-react';
import { VisualDescriptionField, Character } from '../../types';
import { useImageLoader } from '../../hooks/useImageLoader';

interface VisualDescriptionModalProps {
  /** 字段类型：标志性姿态 或 病态微动作 */
  fieldType: 'signaturePose' | 'microAction';
  /** 当前字段值 */
  fieldValue?: VisualDescriptionField;
  /** 角色信息（用于生成提示词） */
  character: Character;
  /** 关闭回调 */
  onClose: () => void;
  /** 保存回调 */
  onSave: (field: VisualDescriptionField) => void;
  /** AI 润色文本 */
  onPolish: (text: string, fieldType: 'signaturePose' | 'microAction', character: Character) => Promise<string>;
  /** 生成预览图 */
  onGeneratePreview: (polishedText: string, fieldType: 'signaturePose' | 'microAction', character: Character) => Promise<string>;
  /** 是否有其他 Modal 正在生成中 */
  isGeneratingGlobal?: boolean;
}

/**
 * AI 润色提示词模板
 * 将用户的简单描述转化为专业的视觉描述
 */
const getPolishPrompt = (text: string, fieldType: 'signaturePose' | 'microAction'): string => {
  if (fieldType === 'signaturePose') {
    return `你是一位拥有30年经验的顶级动画编剧和角色设计专家。

请将以下"标志性姿态"描述转化为专业的、适合直接用于图像生成的视觉描述。

要求：
- 必须包含具体的身体动作和表情描写
- 必须包含视角/景别信息（如：远景、中景、近景、特写）
- 必须包含光影/氛围描述
- 禁止使用抽象形容词（如"冷酷"、"威严"），必须转化为具体动作
- 输出格式：[景别] 具体描写 [光影氛围]

原始描述：
"${text}"

请直接输出润色后的描述，不要解释。`;
  } else {
    return `你是一位拥有30年经验的顶级动画编剧和角色设计专家。

请将以下"病态微动作"描述转化为专业的、适合直接用于图像生成的视觉描述。

要求：
- 必须包含具体的微动作细节（手指、面部肌肉、眼神等）
- 必须包含该动作发生时的状态描写
- 必须包含视角/景别信息
- 这个微动作应该让人感到不安或反常
- 输出格式：[景别] 具体描写 [微动作细节]

原始描述：
"${text}"

请直接输出润色后的描述，不要解释。`;
  }
};

const VisualDescriptionModal: React.FC<VisualDescriptionModalProps> = ({
  fieldType,
  fieldValue,
  character,
  onClose,
  onSave,
  onPolish,
  onGeneratePreview,
  isGeneratingGlobal = false,
}) => {
  // 当前编辑的文本
  const [editText, setEditText] = useState(fieldValue?.original || '');
  // 润色后的文本
  const [polishedText, setPolishedText] = useState(fieldValue?.polished || '');
  // 是否正在润色
  const [isPolishing, setIsPolishing] = useState(false);
  // 是否正在生成预览
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  // 是否显示预览图
  const [showPreview, setShowPreview] = useState(false);
  // 预览图加载状态
  const [localPreviewImageUrl, setLocalPreviewImageUrl] = useState<string | undefined>(fieldValue?.previewImageUrl);
  const { src: previewImageSrc, loading: previewImageLoading } = useImageLoader(localPreviewImageUrl);

  // 字段显示名称
  const fieldLabel = fieldType === 'signaturePose' ? '标志性姿态' : '病态微动作';
  // 输入框 placeholder
  const placeholder = fieldType === 'signaturePose'
    ? '例如：靠在墙上，眼神不聚焦，仿佛无视一切'
    : '例如：说话前用舌头顶一下腮帮子，手指不自觉地抽搐';

  /**
   * 处理 AI 润色
   */
  const handlePolish = async () => {
    if (!editText.trim()) return;

    setIsPolishing(true);
    try {
      const polished = await onPolish(editText, fieldType, character);
      setPolishedText(polished);
    } catch (error) {
      console.error('AI 润色失败:', error);
    } finally {
      setIsPolishing(false);
    }
  };

  /**
   * 处理预览图生成
   */
  const handleGeneratePreview = async () => {
    const textToUse = polishedText || editText;
    if (!textToUse.trim()) return;

    setIsGeneratingPreview(true);
    try {
      const imageUrl = await onGeneratePreview(textToUse, fieldType, character);
      if (imageUrl) {
        setLocalPreviewImageUrl(imageUrl);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('预览图生成失败:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  /**
   * 处理保存
   */
  const handleSave = () => {
    // 确定要保存的 polished 文本（优先使用用户编辑过的润色文本）
    const finalPolished = polishedText || editText;

    const field: VisualDescriptionField = {
      original: editText.trim(),
      polished: finalPolished.trim() !== editText.trim() ? finalPolished.trim() : undefined,
      previewImageUrl: localPreviewImageUrl,
    };

    // 如果 polished 和 original 相同，不保存 polished
    if (field.polished === field.original) {
      delete field.polished;
    }

    onSave(field);
    onClose();
  };

  /**
   * 判断是否有内容可保存
   */
  const canSave = editText.trim().length > 0;
  /**
   * 判断是否可以生成预览
   */
  const canGeneratePreview = (editText.trim() || polishedText.trim()) && !isGeneratingPreview && !isGeneratingGlobal;

  return (
    <div
      className="absolute inset-0 z-40 bg-[var(--bg-base)]/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              fieldType === 'signaturePose'
                ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]'
                : 'bg-[var(--error-bg)] text-[var(--error-text)]'
            }`}>
              {fieldType === 'signaturePose' ? (
                <Edit3 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {fieldLabel}
              </h3>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                {character.name} - 角色视觉描述
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--error-hover-bg)] rounded text-[var(--text-tertiary)] hover:text-[var(--error-text)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 原始文本输入区 */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-1.5">
              <Edit3 className="w-3 h-3" />
              原始描述
            </label>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="w-full bg-[var(--bg-base)] border border-[var(--border-secondary)] text-[var(--text-primary)] px-3 py-2 text-xs rounded-lg focus:outline-none focus:border-[var(--accent)] resize-none font-mono leading-relaxed"
              placeholder={placeholder}
              disabled={isPolishing || isGeneratingPreview}
            />
          </div>

          {/* 操作按钮区 */}
          <div className="flex items-center gap-3">
            {/* AI 润色按钮 */}
            <button
              onClick={handlePolish}
              disabled={!editText.trim() || isPolishing || isGeneratingGlobal}
              className="flex-1 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPolishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  润色中...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  AI 润色
                </>
              )}
            </button>

            {/* 查看预览按钮 */}
            <button
              onClick={handleGeneratePreview}
              disabled={!canGeneratePreview}
              className="flex-1 py-2.5 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border-primary)]"
            >
              {isGeneratingPreview ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  查看预览
                </>
              )}
            </button>
          </div>

          {/* 润色结果区 */}
          {(polishedText || isPolishing) && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[var(--accent-text)]" />
                AI 润色结果 {polishedText && !isPolishing && (
                  <span className="text-[9px] normal-case font-normal text-[var(--text-muted)] ml-2">
                    （可手动编辑）
                  </span>
                )}
              </label>
              {isPolishing ? (
                <div className="h-20 bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded-lg flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : (
                <textarea
                  value={polishedText}
                  onChange={(e) => setPolishedText(e.target.value)}
                  rows={3}
                  className="w-full bg-[var(--bg-base)] border border-[var(--accent)] text-[var(--text-primary)] px-3 py-2 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none font-mono leading-relaxed"
                  placeholder="AI 润色后的描述将显示在这里..."
                />
              )}
            </div>
          )}

          {/* 预览图区 */}
          {(showPreview || fieldValue?.previewImageUrl) && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-1.5">
                <ImageIcon className="w-3 h-3" />
                效果预览
              </label>
              <div className="relative aspect-video bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded-lg overflow-hidden">
                {previewImageLoading || isGeneratingPreview ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--text-muted)]" />
                  </div>
                ) : previewImageSrc ? (
                  <img
                    src={previewImageSrc}
                    alt="预览图"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-muted)]">
                    <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
                    <span className="text-[10px]">暂无预览图</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-16 px-6 border-t border-[var(--border-primary)] flex items-center justify-end gap-3 bg-[var(--bg-surface)] shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[var(--bg-hover)] hover:bg-[var(--border-secondary)] text-[var(--text-secondary)] rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default VisualDescriptionModal;
