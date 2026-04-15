/**
 * CharacterCard - 角色卡片组件
 * 显示单个角色的信息、图像和操作按钮
 *
 * 功能：
 * - 角色图像展示/上传/生成
 * - 角色基本信息编辑（名称、性别、年龄）
 * - 标志性姿态编辑（通过 Modal）
 * - 病态微动作编辑（通过 Modal）
 * - 服装变体管理
 * - 造型九宫格管理
 */

import React, { useState } from 'react';
import {
  User,
  Check,
  Shirt,
  Trash2,
  Edit2,
  AlertCircle,
  FolderPlus,
  Grid3x3,
  Loader2,
  Wand2,
  Sparkles
} from 'lucide-react';
import { Character, VisualDescriptionField } from '../../types';
import PromptEditor from './PromptEditor';
import ImageUploadButton from './ImageUploadButton';
import VisualDescriptionModal from './VisualDescriptionModal';
import { useImageLoader } from '../../hooks/useImageLoader';

interface CharacterCardProps {
  character: Character;
  isGenerating: boolean;
  onGenerate: () => void;
  onUpload: (file: File) => void;
  onPromptSave: (newPrompt: string) => void;
  onOpenWardrobe: () => void;
  onOpenTurnaround: () => void;
  onImageClick: (imageUrl: string) => void;
  onDelete: () => void;
  /**
   * 更新角色信息
   * 支持的字段：
   * - name, gender, age, personality
   * - microAction: VisualDescriptionField（病态微动作）
   * - signaturePose: VisualDescriptionField（标志性姿态）
   */
  onUpdateInfo: (updates: {
    name?: string;
    gender?: string;
    age?: string;
    personality?: string;
    microAction?: VisualDescriptionField;
    signaturePose?: VisualDescriptionField;
  }) => void;
  onAddToLibrary: () => void;
  onReplaceFromLibrary: () => void;
  /** AI 润色文本回调 */
  onPolishText?: (text: string, fieldType: 'signaturePose' | 'microAction', character: Character) => Promise<string>;
  /** 生成预览图回调 */
  onGeneratePreview?: (text: string, fieldType: 'signaturePose' | 'microAction', character: Character) => Promise<string>;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  isGenerating,
  onGenerate,
  onUpload,
  onPromptSave,
  onOpenWardrobe,
  onOpenTurnaround,
  onImageClick,
  onDelete,
  onUpdateInfo,
  onAddToLibrary,
  onReplaceFromLibrary,
  onPolishText,
  onGeneratePreview,
}) => {
  // ========== 编辑状态 ==========
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingGender, setIsEditingGender] = useState(false);
  const [isEditingAge, setIsEditingAge] = useState(false);
  const [editName, setEditName] = useState(character.name);
  const [editGender, setEditGender] = useState(character.gender);
  const [editAge, setEditAge] = useState(character.age);

  // ========== Modal 状态 ==========
  /** 当前打开的 VisualDescription Modal 类型 */
  const [editingVisualField, setEditingVisualField] = useState<'signaturePose' | 'microAction' | null>(null);

  const { src: imageSrc, loading: imageLoading } = useImageLoader(character.imageUrl);

  // ========== 处理函数 ==========

  /**
   * 保存名称编辑
   */
  const handleSaveName = () => {
    if (editName.trim()) {
      onUpdateInfo({ name: editName.trim() });
      setIsEditingName(false);
    }
  };

  /**
   * 保存性别编辑
   */
  const handleSaveGender = () => {
    if (editGender.trim()) {
      onUpdateInfo({ gender: editGender.trim() });
      setIsEditingGender(false);
    }
  };

  /**
   * 保存年龄编辑
   */
  const handleSaveAge = () => {
    if (editAge.trim()) {
      onUpdateInfo({ age: editAge.trim() });
      setIsEditingAge(false);
    }
  };

  /**
   * 处理 VisualDescription Modal 保存
   */
  const handleVisualFieldSave = (field: VisualDescriptionField) => {
    if (editingVisualField === 'signaturePose') {
      onUpdateInfo({ signaturePose: field });
    } else if (editingVisualField === 'microAction') {
      onUpdateInfo({ microAction: field });
    }
  };

  /**
   * AI 润色文本（默认实现）
   * 如果外部没有提供 onPolishText，则使用简单的大纲生成
   */
  const defaultPolishText = async (
    text: string,
    fieldType: 'signaturePose' | 'microAction',
    _character: Character
  ): Promise<string> => {
    // 默认返回原文本 + 标注
    if (fieldType === 'signaturePose') {
      return `[中景] ${text}。角色站在画面中央，身体略微侧转，呈现出放松却充满气场的姿态。[光影] 侧光照明，在角色脸部形成明暗对比，突出其不聚焦的眼神。`;
    } else {
      return `[特写] ${text}。角色的面部肌肉微微抽搐，手指不自觉地做出该微动作。[细节] 镜头捕捉到手指轻微的颤抖，眼神中闪过一丝不安。`;
    }
  };

  /**
   * 生成预览图（默认实现）
   * 如果外部没有提供 onGeneratePreview，则返回空字符串
   */
  const defaultGeneratePreview = async (
    text: string,
    fieldType: 'signaturePose' | 'microAction',
    char: Character
  ): Promise<string> => {
    // 默认实现：返回空字符串（需要外部提供真实实现）
    console.warn('onGeneratePreview not provided, using default implementation');
    return '';
  };

  /**
   * 获取字段按钮的显示状态
   */
  const getFieldButtonContent = (
    fieldValue: VisualDescriptionField | undefined,
    label: string
  ) => {
    if (!fieldValue || !fieldValue.original) {
      return {
        text: `+ ${label}`,
        hasPolish: false,
        hasPreview: false
      };
    }
    return {
      text: fieldValue.original,
      hasPolish: !!fieldValue.polished,
      hasPreview: !!fieldValue.previewImageUrl
    };
  };

  // 获取各字段状态
  const signaturePoseState = getFieldButtonContent(character.signaturePose, '标志性姿态');
  const microActionState = getFieldButtonContent(character.microAction, '病态微动作');

  return (
    <>
      <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl overflow-hidden flex flex-col group hover:border-[var(--border-secondary)] transition-all hover:shadow-lg">
        <div className="flex gap-4 p-4 pb-0">
          {/* ========== 角色图像区域 ========== */}
          <div className="w-48 flex-shrink-0">
            <div
              className="aspect-video bg-[var(--bg-elevated)] relative rounded-lg overflow-hidden cursor-pointer"
              onClick={() => character.imageUrl && onImageClick(character.imageUrl)}
            >
              {imageSrc ? (
                <>
                  <img src={imageSrc} alt={character.name} className="w-full h-full object-cover" />
                  <div className="absolute top-1.5 right-1.5 p-1 bg-[var(--accent)] text-[var(--text-primary)] rounded shadow-lg">
                    <Check className="w-3 h-3" />
                  </div>
                </>
              ) : imageLoading ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)]">
                  <Loader2 className="w-8 h-8 mb-2 animate-spin text-[var(--accent)]" />
                  <span className="text-[10px] text-[var(--text-tertiary)]">加载中...</span>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] p-2 text-center">
                  {character.status === 'failed' ? (
                    <>
                      <AlertCircle className="w-8 h-8 mb-2 text-[var(--error)]" />
                      <span className="text-[10px] text-[var(--error)] mb-2">生成失败</span>
                      <ImageUploadButton
                        variant="inline"
                        size="small"
                        onUpload={onUpload}
                        onGenerate={onGenerate}
                        isGenerating={isGenerating}
                        uploadLabel="上传"
                        generateLabel="重试"
                      />
                    </>
                  ) : (
                    <>
                      <User className="w-8 h-8 mb-2 opacity-10" />
                      <ImageUploadButton
                        variant="inline"
                        size="small"
                        onUpload={onUpload}
                        onGenerate={onGenerate}
                        isGenerating={isGenerating}
                        uploadLabel="上传"
                        generateLabel="生成"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ========== 角色信息区域 ========== */}
          <div className="flex-1 flex flex-col min-w-0 justify-between">
            {/* 头部：名称、性别、年龄 */}
            <div>
              {/* 名称 */}
              {isEditingName ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyPress={(e) => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                  className="font-bold text-[var(--text-primary)] text-base mb-1 bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-2 py-1 w-full focus:outline-none focus:border-[var(--accent)]"
                />
              ) : (
                <div className="flex items-center gap-2 mb-1 group/name">
                  <h3 className="font-bold text-[var(--text-primary)] text-base">{character.name}</h3>
                  <button
                    onClick={() => {
                      setEditName(character.name);
                      setIsEditingName(true);
                    }}
                    className="opacity-0 group-hover/name:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-opacity"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* 性别和年龄 */}
              <div className="flex items-center gap-2">
                {isEditingGender ? (
                  <input
                    type="text"
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                    onBlur={handleSaveGender}
                    onKeyPress={(e) => e.key === 'Enter' && handleSaveGender()}
                    autoFocus
                    className="text-[10px] text-[var(--text-primary)] font-mono uppercase bg-[var(--bg-hover)] border border-[var(--border-secondary)] px-2 py-0.5 rounded focus:outline-none focus:border-[var(--accent)] w-20"
                  />
                ) : (
                  <span
                    onClick={() => {
                      setEditGender(character.gender);
                      setIsEditingGender(true);
                    }}
                    className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase bg-[var(--bg-elevated)] px-2 py-0.5 rounded cursor-pointer hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    {character.gender}
                  </span>
                )}
                {isEditingAge ? (
                  <input
                    type="text"
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    onBlur={handleSaveAge}
                    onKeyPress={(e) => e.key === 'Enter' && handleSaveAge()}
                    autoFocus
                    className="text-[10px] text-[var(--text-primary)] bg-[var(--bg-hover)] border border-[var(--border-secondary)] px-2 py-0.5 rounded focus:outline-none focus:border-[var(--accent)] w-20"
                  />
                ) : (
                  <span
                    onClick={() => {
                      setEditAge(character.age);
                      setIsEditingAge(true);
                    }}
                    className="text-[10px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors"
                  >
                    {character.age}
                  </span>
                )}
                {character.variations && character.variations.length > 0 && (
                  <span className="text-[9px] text-[var(--text-tertiary)] font-mono flex items-center gap-1 bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">
                    <Shirt className="w-2.5 h-2.5" /> +{character.variations.length}
                  </span>
                )}
              </div>

              {/* ========== 标志性姿态按钮 ========== */}
              <div className="mt-3">
                <button
                  onClick={() => setEditingVisualField('signaturePose')}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                    character.signaturePose?.original
                      ? 'bg-[var(--accent-bg)]/30 border-[var(--accent-border)] hover:bg-[var(--accent-bg)]/50'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Edit2 className={`w-3.5 h-3.5 flex-shrink-0 ${
                      character.signaturePose?.original
                        ? 'text-[var(--accent-text)]'
                        : 'text-[var(--text-muted)]'
                    }`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      character.signaturePose?.original
                        ? 'text-[var(--accent-text)]'
                        : 'text-[var(--text-muted)]'
                    }`}>
                      标志性姿态
                    </span>
                  </div>
                  {/* 状态图标 */}
                  <div className="flex items-center gap-1.5">
                    {character.signaturePose?.polished && (
                      <Sparkles className="w-3.5 h-3.5 text-[var(--warning-text)]" title="已润色" />
                    )}
                    {character.signaturePose?.previewImageUrl && (
                      <Check className="w-3.5 h-3.5 text-[var(--success-text)]" title="有预览图" />
                    )}
                  </div>
                </button>
              </div>

              {/* ========== 病态微动作按钮 ========== */}
              <div className="mt-2">
                <button
                  onClick={() => setEditingVisualField('microAction')}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                    character.microAction?.original
                      ? 'bg-[var(--error-bg)]/20 border-[var(--error-border)]/50 hover:bg-[var(--error-bg)]/30'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 ${
                      character.microAction?.original
                        ? 'text-[var(--error-text)]'
                        : 'text-[var(--text-muted)]'
                    }`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      character.microAction?.original
                        ? 'text-[var(--error-text)]'
                        : 'text-[var(--text-muted)]'
                    }`}>
                      病态微动作
                    </span>
                  </div>
                  {/* 状态图标 */}
                  <div className="flex items-center gap-1.5">
                    {character.microAction?.polished && (
                      <Sparkles className="w-3.5 h-3.5 text-[var(--warning-text)]" title="已润色" />
                    )}
                    {character.microAction?.previewImageUrl && (
                      <Check className="w-3.5 h-3.5 text-[var(--success-text)]" title="有预览图" />
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* ========== 操作按钮区域 ========== */}
            <div className="flex flex-col gap-2 mt-3">
              {/* 服装变体 */}
              <button
                onClick={onOpenWardrobe}
                className="w-full py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-[var(--border-primary)] transition-colors"
              >
                <Shirt className="w-3 h-3" />
                服装变体
              </button>

              {/* 造型九宫格 */}
              <button
                onClick={onOpenTurnaround}
                className={`w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-colors ${
                  character.turnaround?.status === 'completed'
                    ? 'bg-[var(--accent-bg)] hover:bg-[var(--accent-hover-bg)] text-[var(--accent-text)] border-[var(--accent-border)]'
                    : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border-[var(--border-primary)]'
                }`}
              >
                <Grid3x3 className="w-3 h-3" />
                造型九宫格
                {character.turnaround?.status === 'completed' && (
                  <Check className="w-2.5 h-2.5" />
                )}
              </button>

              {/* 上传按钮 */}
              {character.imageUrl && (
                <div className="w-full">
                  <ImageUploadButton
                    variant="separate"
                    hasImage={true}
                    onUpload={onUpload}
                    onGenerate={onGenerate}
                    isGenerating={isGenerating}
                    uploadLabel="上传"
                  />
                </div>
              )}

              {/* 从资产库替换 */}
              <button
                onClick={onReplaceFromLibrary}
                disabled={isGenerating}
                className="w-full py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-[var(--border-primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FolderPlus className="w-3 h-3" />
                从资产库替换
              </button>
            </div>
          </div>
        </div>

        {/* ========== 底部区域：提示词 + 按钮 ========== */}
        <div className="p-4 flex-1 flex flex-col">
          {/* 角色提示词编辑 */}
          <div className="flex-1 mb-3">
            <PromptEditor
              prompt={character.visualPrompt || ''}
              onSave={onPromptSave}
              label="角色提示词"
              placeholder="输入角色的视觉描述..."
            />
          </div>

          {/* 加入资产库 */}
          <button
            onClick={onAddToLibrary}
            disabled={isGenerating}
            className="w-full py-2 mt-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <FolderPlus className="w-3 h-3" />
            加入资产库
          </button>

          {/* 删除角色 */}
          <button
            onClick={onDelete}
            disabled={isGenerating}
            className="w-full py-2 mt-2 bg-transparent hover:bg-[var(--error-bg)] text-[var(--error-text)] hover:text-[var(--error-text)] border border-[var(--error-border)] hover:border-[var(--error-border)] rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3 h-3" />
            删除角色
          </button>
        </div>
      </div>

      {/* ========== VisualDescription Modal ========== */}
      {editingVisualField && (
        <VisualDescriptionModal
          fieldType={editingVisualField}
          fieldValue={editingVisualField === 'signaturePose'
            ? character.signaturePose
            : character.microAction
          }
          character={character}
          onClose={() => setEditingVisualField(null)}
          onSave={handleVisualFieldSave}
          onPolish={onPolishText || defaultPolishText}
          onGeneratePreview={onGeneratePreview || defaultGeneratePreview}
          isGeneratingGlobal={isGenerating}
        />
      )}
    </>
  );
};

export default CharacterCard;
